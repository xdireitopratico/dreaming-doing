import {
  assertEquals,
  assertStringIncludes,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { splitUserFacingChatReply } from "./sanitize-prose.ts";

Deno.test("splitUserFacingChatReply removes leaked prompt scaffold and keeps final answer", () => {
  const raw = `
* User says: "Boa noite"
* Context: The user has been repeatedly asking for a "markdown drawing".
* Goal: Respond as a senior engineer, direct, human, Portuguese.
* Draft 1 (Too robotic): Boa noite. Vou enviar o desenho agora.
* *Adding the wireframe block.*Boa noite! Vamos destravar isso agora para alinharmos a visão.

\`\`\`wireframe
+--------+
| Hero   |
+--------+
\`\`\`
`.trim();

  const result = splitUserFacingChatReply(raw);

  assertStringIncludes(
    result.userText,
    "Boa noite! Vamos destravar isso agora para alinharmos a visão.",
  );
  assertMatch(result.reasoningText ?? "", /User says:/);
  assertStringIncludes(result.reasoningText ?? "", "Goal:");
  assertStringIncludes(result.userText, "```wireframe");
  assertStringIncludes(result.userText, "| Hero");
});

Deno.test("splitUserFacingChatReply preserves normal direct chat answers", () => {
  const raw = "Boa noite! Posso te ajudar a revisar esse layout agora.";
  const result = splitUserFacingChatReply(raw);
  assertEquals(result.userText, raw);
  assertEquals(result.reasoningText, null);
});
