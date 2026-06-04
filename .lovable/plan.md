# FORGE — Estado pós sessão

## Concluído nesta sessão

### Fase 1 — Render destravado
- `src/styles.css`: removido `@import url(...)` que estourava o PostCSS (Tailwind v4).
- `src/routes/__root.tsx`: fonts agora via `<link rel="stylesheet">` no head.
- `src/components/EditorShell.tsx`: troca de `window.location.href` por `<Navigate>` do TanStack (sem flash branco).
- `src/routes/editor.tsx`: já não existe (legado).

### Fase 2 — Backend do agente (sem migration)
- `supabase/functions/agent-run/providers.ts` **novo**: auto-detect de provider em cascata
  `ANTHROPIC → XAI → LOVABLE_AI_GATEWAY → OPENAI`; cheap em `GROQ → LOVABLE_AI`. Honra override por env (`LLM_*` e `LLM_CHEAP_*`) — pronto para quando o usuário trouxer chaves dele.
- `router.ts` reescrito: usa `providers.ts`, sem env obrigatória.
- `loop.ts` reescrito:
  - Removidas refs mortas a `agent_checkpoints` e `file_embeddings` (nada de migration).
  - **Persistência incremental de tool_calls**: cada turn do LLM vira uma `message` viva (status `running` → `ok`/`error`) — chat acompanha em tempo real via Realtime.
- `index.ts` reescrito: SSE com header `X-Accel-Buffering: no`, anúncio do provider no evento `start`.
- `supabase/functions/create-project/` deletada (redundante com serverFn `createProjectFromPrompt`).

### Fase 3 — Streaming + UX viva no editor
- `src/lib/agent-stream.ts` **novo**: lê SSE da Edge Function e dispara eventos tipados.
- `src/routes/projects/$projectId.tsx` **reescrita**:
  - Chat com bolhas, tool-call chips coloridos (`emerald`/`red`/`primary`), trace ao vivo durante a execução.
  - Botão **STOP** que aborta o stream (AbortController).
  - File tree + viewer no tab "Code".
  - Botão "Recarregar preview".

### Fase 4 — Seed Vite+React + preview real via E2B
- `src/lib/seeds/vite-react.ts` **novo**: starter Vite 7 + React 19 + TS estrito + Tailwind v4. 10 arquivos profissionais (zero placeholder, dark theme já configurado, fonte do sistema).
- `src/lib/projects.functions.ts`: agora semeia os 10 arquivos do template ao criar projeto.
- `supabase/functions/agent-run/prompts.ts`: prompts reescritos assumindo Vite+React+TS+Tailwind v4 (não pede mais `npm create vite`).
- `supabase/functions/preview-boot/` **nova edge function**: cria sandbox E2B, sincroniza `project_files`, roda `npm install && npm run dev` em background, retorna URL pública e persiste em `projects.meta.previewUrl`/`previewExpiresAt` (TTL 25 min). Idempotente: reusa se ainda fresca.
- Editor pluga essa URL no iframe (fallback "Ligar preview" se vazio/expirado).

### Fase 5 — Voz no chat (Groq Whisper Large v3 turbo)
- `supabase/functions/voice-transcribe/index.ts` **nova**: aceita `multipart/form-data`, retorna `{ text }` em PT.
- `src/components/voice/MicButton.tsx` **novo**: MediaRecorder → POST → preenche textarea.
- Plugado no chat do editor **e** no `PromptEngine` da home.

### Fase 6 — Import de repo GitHub público
- `supabase/functions/github-import/index.ts` **nova**: baixa zipball, filtra `node_modules`/`.git`/binários (>1MB, ext binária, null bytes), cria projeto e insere `project_files` em lotes de 50. Sem OAuth.
- `src/components/ImportRepoDialog.tsx` **novo**: dialog em `/projects` e chip "Importar do GitHub" na home.

### Fase 9A — Snapshots
- `src/components/editor/SnapshotsSheet.tsx` **novo**: salva snapshot (dump completo de `project_files`) e restaura sobrescrevendo. Botão no header do editor.

### Segurança
- Migration `enable_realtime_messages_rls`: RLS em `realtime.messages` restringindo subscrição a canais `editor-<projectId>` cujo `projectId` pertence ao usuário. Bloqueia escuta cruzada entre contas.

---

## Não feito (ficou para próximas sessões)

### Fase 7 — GitHub OAuth + push bidirecional
Bloqueado: precisa de `GITHUB_OAUTH_CLIENT_ID`/`SECRET` (você cria em github.com/settings/developers).

### Fase 8 — Deploy Cloudflare Pages
Bloqueado: precisa de `CLOUDFLARE_API_TOKEN` (global vs por-usuário a decidir).

### Fase 9B — Monaco editor + edição manual
`bun add @monaco-editor/react`; substitui `<pre>` do tab Code por editor; salvar dispara mesma rota.

### Fase 9C — Command palette Cmd+K
`bun add kbar`. Ações: novo projeto, importar GitHub, salvar snapshot, publicar.

### Fase 9D — History timeline
Rota `/projects/$projectId/history` com diff por mensagem.

### Fase 10 — Multi-provider UI + MCP + Visual Edits + Hardening
- Dropdown no chat: Lovable Gateway / Anthropic / Groq / OpenAI / Gemini / OpenRouter / **chave do usuário**.
- Tela `/connectors`: usuário cola sua chave Anthropic/Groq/etc → serverFn persiste em `connectors.token_encrypted` (precisa de `ENCRYPTION_KEY`).
- Edge function `agent-run` lê chave do usuário primeiro, cai pra global como fallback.
- "Robin model router": múltiplas chaves do mesmo provider revezando.
- MCP em `/connectors` (handshake via `mcp-connect`, tools dinâmicas no registry).
- Visual edits: clique em elemento no preview → seletor CSS + screenshot pro próximo prompt.
- Advisory lock por user em `agent-run` + audit log + rate limit.

---

## Secrets

**Configuradas** (`fetch_secrets`): `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `E2B_API_KEY`, `LOVABLE_API_KEY`, todos os `SUPABASE_*`.

**Pendentes** (na fase correspondente, não agora):
- F7: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `ENCRYPTION_KEY` (32 bytes base64).
- F8: `CLOUDFLARE_API_TOKEN`.
- F10: `OPENAI_API_KEY` se você quiser que o auto-detect tenha esse fallback global.
