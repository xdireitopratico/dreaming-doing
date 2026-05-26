# Lovable Clone — Plano de Construção (2 fases)

Construído como app Vite+React+TS+Tailwind+shadcn dentro do Lovable, mas com **Supabase apontando para meu próprio SUPABASE CLOUD (JÁ ESTÁ CONECTADO NO LOVABLE)** desde o primeiro deploy. Sem placeholder, sem mock. Nada de Next.js/Express/K8s — descartado o stack do README do branch porque ele não reflete como o Lovable real funciona.

## Decisões técnicas (fixas, sem perguntas)


| Camada            | Escolha                                                                                                                                                          | Justificativa                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Frontend          | Vite + React 18 + TS + Tailwind + shadcn/ui + framer-motion + Monaco                                                                                             | Mesma stack que o Lovable usa; portável                        |
| Backend           | **Seu Supabase CLOUD (JÁ ESTÁ CONECTADO NO LOVABLE)** (PASSAREI URL+anon+service CASO AINDA PRECISE)                                                             | Auth, Postgres+RLS, Storage, Edge Functions cobrem tudo        |
| Agente IA         | Multi PROVIDER LOVABLE + GROK BUILD + Claude 3.5 Sonnet via Anthropic SDK, dentro de Edge Function streaming. (NÃO PEÇA CHAVES API, SERÃO INSERIDAS MANUALMENTE) | Modelo público mais alinhado a code-edits; tool-calling nativo |
| Loop de tools     | `write_file`, `read_file`, `delete_file`, `list_dir`, `run_command`, `install_package`, `search` — implementadas em TS, persistem em `project_files`             | Réplica do loop do Lovable                                     |
| Engine de preview | **StackBlitz WebContainers** (`@webcontainer/api`) — Node roda no browser dentro do editor                                                                       | Mesma engine do Bolt.new; zero infra; HMR real                 |
| GitHub            | OAuth + Octokit em Edge Function (`github-sync`)                                                                                                                 | Push, criar repo, webhook bidirecional                         |
| Auto-deploy       | Edge Function chama API Vercel/Cloudflare Pages com token do usuário                                                                                             | Lovable usa infra própria; aqui usamos provider externo        |
| MCP               | Tabela `mcp_servers` + Edge Function `mcp-proxy` (Accept: json+SSE)                                                                                              | Mesmo contrato MCP do Lovable                                  |
| Realtime          | Supabase Realtime nos canais `messages` e `project_files`                                                                                                        | Substitui Socket.io                                            |


## Mapa de rotas do app (espelho do Lovable)

```
/                       Home — input de prompt + lista "My projects"
/auth                   Login/signup (email+senha, Google, GitHub OAuth)
/projects/:id           Editor — chat | file tree | Monaco | preview WebContainer
/projects/:id/code      Toggle code/preview
/projects/:id/history   Versões (snapshots)
/connectors             GitHub + MCP servers + Vercel/Cloudflare tokens
/settings               Perfil, API keys próprios (Anthropic opcional override)
```

---

## FASE 1 — MVP funcional (sem placeholder)

Entrega: um usuário consegue **logar, escrever um prompt, ver o app sendo gerado ao vivo, editar via chat, ter preview rodando, persistir e fazer push pro GitHub**.

### 1.1 Conexão com seu Supabase

- SUPABASE JÁ ESTÁ CONECTADO,  NÃO HÁ NECESSIDADE `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, AINDA SIM, SECRETS SERÃO INSERIDAS MANUALMENTE.
- Configuro `src/integrations/supabase/client.ts` e secrets de Edge Functions.
- Verifico que CLI Supabase consegue rodar migrations contra o endpoint da VPS.

### 1.2 Schema + RLS (migration única)

Tabelas em `public`:

- `profiles` (id→auth.users, display_name, avatar_url, github_username)
- `projects` (id, owner_id, name, slug, description, template, created_at, updated_at)
- `project_files` (id, project_id, path, content, content_hash, updated_at) — unique(project_id, path)
- `project_snapshots` (id, project_id, label, tree jsonb, created_at) — versionamento
- `conversations` (id, project_id, title, created_at)
- `messages` (id, conversation_id, role, parts jsonb, tool_calls jsonb, created_at)
- `connectors` (id, owner_id, kind enum['github','vercel','cloudflare','anthropic'], token_encrypted, meta jsonb)
- `mcp_servers` (id, owner_id, name, url, transport, auth_state, tokens_encrypted)
- `deployments` (id, project_id, provider, url, status, logs, created_at)
- `user_roles` + enum `app_role` + `has_role()` security-definer (padrão Lovable)

Cada tabela: `GRANT` explícito + `ENABLE RLS` + policies escopadas por `auth.uid()`. Tokens nunca expostos via SELECT (view `connectors_public` esconde colunas sensíveis; base table `USING(false)` em SELECT, acesso só via Edge Function com service-role).

### 1.3 Autenticação

- Email/senha + Google + **GitHub OAuth** (o GitHub OAuth já serve como connector para push).
- Trigger `on_auth_user_created` cria profile automático.
- `/auth` com tabs Login/Cadastro, recuperação de senha, `/reset-password`.
- `onAuthStateChange` configurado em `AuthProvider`; rotas protegidas via `ProtectedRoute`.

### 1.4 Home + Dashboard

- Hero com input de prompt grande (estilo Lovable), botão "Build".
- Submit → cria `project` + `conversation` inicial + roda agente com prompt → navega para `/projects/:id`.
- Abaixo: grid "My projects" (cards com snapshot, nome, último deploy).
- Sidebar: Home, Search (Cmd+K), Connectors, All projects, Starred.
- Background substituindo o degradê do Lovable: shader animado WebGL leve (via `ogl` ou canvas 2D com noise) — alta qualidade visual, performance contida.

### 1.5 Editor (a peça central)

Layout 3 colunas:

1. **Chat** (esquerda, 30%): histórico de mensagens com `parts[]`, tool calls colapsáveis, streaming token-a-token, input com anexos de imagem.
2. **File tree + Monaco** (centro, oculto por padrão atrás do toggle "Code"): leitura/escrita de `project_files`.
3. **Preview WebContainer** (direita, 70% padrão): iframe servido pelo WebContainer rodando Vite dev server do projeto gerado.

Fluxo:

- Ao abrir, carrega `project_files`, monta no WebContainer (`webcontainer.mount(tree)`), roda `npm install` + `npm run dev`, faz `webcontainer.on('server-ready', url => setPreviewUrl(url))`.
- Edits do agente: cada `write_file` chama Edge Function `apply-file` (persiste no DB + emite via Realtime) e simultaneamente `webcontainer.fs.writeFile(path, content)` — preview atualiza com HMR sem reload.

### 1.6 Edge Function `agent-run` (cérebro)

- Stream SSE. Recebe `{ projectId, conversationId, userMessage }`.
- Carrega contexto: últimas 20 mensagens + manifesto de arquivos (paths + tamanhos, conteúdo só on-demand via tool `read_file`).
- System prompt em PT-BR espelhando o do Lovable: parallel tool calls, edits cirúrgicos, sem reescrever arquivos inteiros, etc.
- Loop com `stepCountIs(50)`, Claude 3.5 Sonnet via `@anthropic-ai/sdk` (npm: import no Deno).
- Tools (todas executadas server-side, retornam JSON conciso):
  - `read_file`, `write_file`, `delete_file`, `list_dir` — operam em `project_files`
  - `install_package` — atualiza `package.json`
  - `search_codebase` — `ilike` em `content`
  - `run_command` — apenas comandos whitelisted (`npm install`, `npm run build`) reportam resultado simulado; execução real fica no WebContainer cliente
- Persiste cada step em `messages.tool_calls`.
- Erros 402/429/validação retornam payload tipado que o cliente renderiza como banner.

### 1.7 Conector GitHub (Fase 1)

- Em `/connectors`, botão "Conectar GitHub" → OAuth (escopo `repo`).
- Token salvo cifrado em `connectors` (Edge Function `connector-store` usa `pgsodium` ou AES via secret).
- No editor, botão "Push to GitHub": Edge Function `github-sync` cria repo (se primeira vez), faz commit tree completo via Octokit. Salva `repo_url` em `projects.meta`.

### 1.8 Persistência e versionamento mínimo

- Botão "Save snapshot" cria `project_snapshots` com tree completo (jsonb).
- Restore: sobrescreve `project_files` e remonta WebContainer.

### 1.9 QA e validação Fase 1

- E2E manual: criar conta → prompt "todo app com Tailwind" → ver Claude gerar arquivos → preview renderiza → editar via chat → push pro GitHub → reload e abrir projeto novamente.
- Lighthouse > 90 na home; build sem erros TS.

---

## FASE 2 — Paridade competitiva

Entrega: **MCP, auto-deploy, sync GitHub bidirecional, multi-provider, polimento de produto**.

### 2.1 MCP connectors framework

- UI em `/connectors` para adicionar MCP server (URL + nome + transport HTTP/SSE).
- Edge Function `mcp-connect` faz probe (`Accept: application/json, text/event-stream`), implementa fluxo OAuth quando server expõe (CIMD se HTTPS, DCR fallback).
- Estado: `authenticating` | `ready` | `failed` + `authUrl`.
- Tools dos MCPs carregados sob demanda no `agent-run` via `createMCPClient` (AI SDK MCP) com namespace por connector. Fecha cliente após stream.
- Meta-tool pattern quando >10 tools por usuário (evita inflar context).

### 2.2 Auto-deploy real

- `/connectors` aceita tokens Vercel e Cloudflare Pages.
- Botão "Publish" no editor: Edge Function `deploy-trigger`:
  - Vercel: cria project (se não existe) + upload do tree via API `/v13/deployments` (zip do `project_files`).
  - Cloudflare Pages: equivalente via Direct Upload.
- Status em tempo real via polling + Realtime; URL pública em `deployments`.
- Custom domain: campo + verificação DNS (TXT record) — provider-side.

### 2.3 GitHub bidirecional

- Webhook `/functions/v1/github-webhook` recebe `push` events, baixa diff via Octokit, atualiza `project_files`, emite Realtime.
- Conflict detection: se hash do arquivo no DB ≠ hash do parent commit, marca conflito e mostra diff no editor.
- Branch switching (experimental, opt-in em Settings → Labs).

### 2.4 Polimento de produto

- **Visual edits** (estilo Lovable): clicar elemento no preview destaca componente, agente recebe seletor + screenshot.
- **Command palette** Cmd+K (kbar) com ações: novo projeto, abrir, deploy, push.
- **History timeline** (`/projects/:id/history`) com restore por snapshot, diff entre versões.
- **Templates**: catálogo de starters (landing, dashboard, SaaS) — inicializa `project_files` a partir de um tree predefinido.
- **Sharing**: `projects.visibility` enum (private/unlisted/public-remix) + página `/preview/:id` somente-leitura.
- **Analytics próprio**: tabela `events`, dashboard em `/settings/usage` (créditos Anthropic, builds, deploys).

### 2.5 Hardening

- Rate limiting em `agent-run` (token bucket no Redis ou Postgres `pg_advisory_lock`).
- Audit log (`audit_log` table) para escritas sensíveis.
- Backup automatizado: pg_dump diário disparado por edge cron → bucket Storage.
- Security scan e RLS revisitada por terceiro automatizado.

---

## Detalhes técnicos (seção dev)

**Edge Functions (Deno) a criar:**  
`agent-run`, `apply-file`, `connector-store`, `github-sync`, `github-webhook`, `mcp-connect`, `mcp-callback`, `mcp-proxy`, `deploy-trigger`, `deploy-status`, `snapshot-create`, `snapshot-restore`.

**Secrets necessários (você fornece):**  
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `ENCRYPTION_KEY` (32 bytes para AES de tokens), `WEBCONTAINER_API_KEY` (Fase 2, produção). Vercel/Cloudflare tokens são por-usuário, não global.

**WebContainers — observação:** licença StackBlitz é gratuita em dev; em produção pública requer plano pago (≈ US$ 0 para até X seats, depende do contrato). Documento isso em `/settings` e deixo plano B (preview estático via `vite build` + iframe) plugável caso você queira evitar.

**O que NÃO vai entrar:**  

- Kubernetes/Docker self-managed para preview (substituído por WebContainers).
- OpenHands (descartado, conforme você instruiu).
- Next.js/Express/Prisma (substituídos por Vite/React + Supabase/PostgREST).
- Stripe na Fase 1 (entra só se você pedir Fase 3).

## Ordem de implementação imediata após você aprovar

1. Você me passa os 3 valores Supabase + Anthropic key.
2. Configuro client + secrets + roda migration 1.2.
3. Auth + Home + Dashboard.
4. Editor shell + WebContainer + carregamento de tree.
5. Edge Function `agent-run` + tools mínimas.
6. GitHub connector + push.
7. QA end-to-end Fase 1. Entrega. Fase 2 começa em loop separado.

Aprovando este plano, o passo seguinte é você colar as credenciais para eu cravar a Fase 1 sem nenhuma camada de mock.