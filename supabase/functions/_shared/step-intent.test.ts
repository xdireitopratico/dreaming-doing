// step-intent.test.ts — critério 2 (veracidade): step_intent nunca é fabricado.
// "Avançar com X" era rótulo sem significado; agora toda tool tem intenção real ou neutra honesta.
import { describeStepExpectation } from "./step-intent.ts";
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("describeStepExpectation — nunca retorna 'Avançar com' (critério 2: veracidade)", () => {
  const tools = [
    "fs_read", "fs_read_many", "fs_list", "fs_glob", "fs_search",
    "fs_write", "fs_edit", "shell_exec", "web_search", "web_fetch",
    "web_research", "web_scrape", "extract_design_dna", "read_design_library",
    "find_skills", "load_skill", "create_plan", "clarify", "deploy",
    "alguma_tool_nova_que_ninguem_previu",
  ];
  for (const name of tools) {
    const intent = describeStepExpectation(name, {});
    assertEquals(
      intent.startsWith("Avançar com"),
      false,
      `step_intent fabricado para "${name}": "${intent}" — veracidade violada`,
    );
  }
});