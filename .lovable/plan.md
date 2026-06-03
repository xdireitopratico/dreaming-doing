# Lovable Clone — Replanejamento (o que falta)

Estado atual (avaliação honesta):

- ✅ Supabase conectado, schema completo (projects, project_files, conversations, messages, connectors, mcp_servers, deployments, user_roles, profiles, snapshots) com RLS e grants.
- ✅ Auth (email + Google), rotas protegidas, `/auth`, `/projects`, `/connectors`, `/settings` existem.
- ✅ Edge Function `agent-run` já roda (mas com Lovable AI Gateway + **HTML vanilla via srcdoc**, não WebContainer; sem Claude/Grok ainda).
- ✅ Landing "Celestial Forge" no ar (Hero, Ticker, HowItWorks, Features, Stats, FinalCTA, SpaceScene).
- ⚠️ Editor `/projects/$projectId` existe mas usa design antigo, preview por `srcdoc`, sem Monaco, sem file tree, sem WebContainer.
- ❌ Multi-provider (Anthropic / xAI) não plugado — só Lovable AI Gateway.
- ❌ GitHub connector (OAuth, push, sync) — vazio.
- ❌ MCP, auto-deploy, snapshots UI, visual edits, command palette, history — nada.
- ❌ Hidratação quebra (`Math.random()` no `SpaceScene` / headline).
- ❌ Fluxo prompt da home → cria projeto real → navega: hoje só faz `warp` para `/editor` que redireciona.

Reescopei em 3 fases enxutas. Cada fase é entregável independente.

---

## FASE 1A — Fechar o MVP (o que está pela metade)

Objetivo: home → prompt → projeto real → editor com preview funcional → push GitHub. Sem quebra de hidratação, com design Celestial Forge aplicado também ao editor.

1. **Bug de hidratação** (`SpaceScene` / KineticHeadline): mover `Math.random()` para `useEffect` ou `useMemo` client-only com guard `typeof window`.
2. **Fluxo home → editor real** em `PromptEngine.submit`:
   - `createServerFn` `createProjectFromPrompt({ prompt })` que insere `projects` + `conversations` + 1ª `messages` (role user) + dispara `agent-run` e retorna `projectId`.
   - Warp transition navega para `/projects/$projectId` (não `/editor`).
   - Remover `src/routes/editor.tsx` (redirect legado).
3. **Editor repaginado (Celestial Forge)**:
   - Aplicar tokens (`bg-background`, grain overlay sutil, vignette, glass cards, HUD corner brackets, mono labels).
   - Chat à esquerda (30%), Preview/Code à direita (70%) com toggle. Tool calls colapsáveis estilizadas.
   - **Manter preview por iframe `srcdoc` do `index.html`** (já funciona) — WebContainer fica para Fase 1B.
   - Streaming SSE de `agent-run` no chat (hoje é só refetch via Realtime — adicionar token-a-token).
4. **GitHub OAuth + push** (Fase 1, prometido):
   - `/connectors` com botão "Conectar GitHub" via `lovable.auth.signInWithOAuth` **não serve** (Lovable Cloud só suporta google/apple). Caminho real: Edge Function `github-oauth-start` + `github-oauth-callback` com `GITHUB_OAUTH_CLIENT_ID/SECRET` (request secrets).
   - Token cifrado em `connectors` (AES-GCM com `ENCRYPTION_KEY`).
   - Botão "Push to GitHub" no editor → Edge Function `github-sync` (Octokit via esm.sh) cria repo se necessário e faz commit tree completo.
5. **Snapshots mínimos**: botão "Save snapshot" + lista em sheet lateral; restore sobrescreve `project_files`.
6. **SEO + OG** na home (og:image, canonical, JSON-LD WebApplication).

Saída: usuário cria conta, descreve um app, vê código sendo escrito ao vivo, preview renderiza, dá push pro GitHub, reabre depois.

---

## FASE 1B — WebContainers (substituir srcdoc)

Só faz sentido depois que 1A estiver sólido, porque muda a arquitetura do preview.

1. Instalar `@webcontainer/api`. Documentar em `/settings` que produção pública exige plano StackBlitz pago — em dev é gratuito.
2. Reescrever system prompt do `agent-run` para gerar **Vite + React + TS** (não mais HTML vanilla). Templates iniciais em `project_files` quando o projeto é criado a partir de um starter.
3. Componente `WebContainerPreview`:
   - `webcontainer.mount(treeFromFiles)`
   - `npm install` + `npm run dev`
   - `on('server-ready')` → seta URL do iframe
   - Cada `write_file` do agente: `webcontainer.fs.writeFile` para HMR sem reload + persistência no DB em paralelo.
4. Fallback: se `crossOriginIsolated === false` (headers COOP/COEP ausentes), exibir aviso e cair pra preview estático (`vite build` server-side via Edge Function? — provavelmente não viável; melhor exigir headers no host).
5. Monaco editor + file tree para edição manual; salvar dispara mesma rota de `apply-file`.

---

## FASE 2 — Paridade competitiva

(mantém o que estava no plano original, só com prioridades mais limpas)

1. **MCP connectors**: tabela já existe. Faltam UI em `/connectors` (add server, OAuth flow via `mcp-connect` Edge Function com `Accept: application/json, text/event-stream`), loader de tools no `agent-run` (AI SDK MCP client com namespace e close-after-stream), meta-tool pattern quando >10 tools.
2. **Multi-provider real**: dropdown de modelo no chat (Lovable Gateway / Anthropic / xAI). Edge Function escolhe SDK conforme `connectors.kind`. Chaves Anthropic/xAI por-usuário em `connectors`, ou globais via secret (já temos `ANTHROPIC_API_KEY`, `XAI_API_KEY`).
3. **Auto-deploy**: Vercel + Cloudflare Pages via `deploy-trigger` (Direct Upload API). Tabela `deployments` já existe. UI no editor com badge de status + URL.
4. **GitHub bidirecional**: Edge Function `github-webhook` (`/api/public/github-webhook` em route TanStack com verificação HMAC), diff via Octokit, atualiza `project_files`, detecta conflito por `content_hash`.
5. **Polimento**:
   - Visual edits (clicar elemento no preview → seletor + screenshot pro agente).
   - Command palette Cmd+K (kbar).
   - History timeline `/projects/$projectId/history` com diff.
   - Templates pré-prontos (landing, dashboard, SaaS).
   - Sharing público read-only `/preview/$projectId`.
6. **Hardening**: rate-limit no `agent-run` (advisory lock por user), audit log, security scan.

---

## Detalhes técnicos relevantes

**Decisões corrigidas em relação ao plano original:**

- GitHub login **não** entra como provider de auth (Lovable Cloud não suporta). Vai como connector próprio via Edge Function OAuth.
- Agent loop **não** usa Anthropic SDK no Deno na Fase 1A — já temos Lovable AI Gateway funcionando; multi-provider entra na Fase 2 quando há valor real.
- WebContainer adiado para 1B porque substituí-lo agora forçaria reescrever o system prompt e o template antes de validar o fluxo end-to-end.
- Cron/backup automatizado e analytics próprio ficam para uma Fase 3 (não bloqueiam paridade).

**Secrets que ainda precisarão ser pedidos:**

- `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` (Fase 1A passo 4).
- `ENCRYPTION_KEY` (32 bytes base64) para cifrar tokens em `connectors`.
- `WEBCONTAINER_API_KEY` (só Fase 1B em produção).
- Vercel/Cloudflare: por-usuário, na Fase 2.

`ANTHROPIC_API_KEY`, `XAI_API_KEY`, `LOVABLE_API_KEY` já estão nos secrets.

**Arquivos a tocar / criar na Fase 1A:**

- `src/components/space/SpaceScene.tsx`, `src/components/landing/Hero.tsx` (fix hidratação).
- `src/lib/projects.functions.ts` (createProjectFromPrompt).
- `src/components/prompt/PromptEngine.tsx` (chamar serverFn + navegar para `/projects/$id`).
- `src/routes/projects/$projectId.tsx` + `src/components/EditorShell.tsx` (redesign Celestial Forge, streaming).
- `supabase/functions/github-oauth-start/index.ts`, `github-oauth-callback/index.ts`, `github-sync/index.ts`.
- `src/routes/connectors.tsx` (UI GitHub).
- `src/routes/__root.tsx` (SEO/OG).
- `src/routes/editor.tsx` (deletar).

---

## Recomendação de ordem

Começar pela Fase 1A, na ordem listada (1 → 6). Itens 1, 2 e 3 são rápidos e desbloqueiam ver o produto rodando. Item 4 (GitHub) precisa que você crie um GitHub OAuth App e me passe `CLIENT_ID/SECRET`.

Se preferir, posso fazer 1A em duas entregas: **(A1)** fix hidratação + fluxo home→editor + redesign editor + snapshots; **(A2)** GitHub OAuth + push depois que você gerar as credenciais.
