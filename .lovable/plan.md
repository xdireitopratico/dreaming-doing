# FORGE — Plano de Launch (50 tarefas) v3

## 0. Realidade dos dois Supabase (ler antes de aprovar)

Hoje o projeto vive em **dois Supabase**:


| Ref                    | Quem usa                                                                              | Quem consigo modificar daqui                         |
| ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `mtcnwvzjfbvyiuhrqrlo` | **Lovable Cloud** (preview Lovable, `.env` runtime do sandbox)                        | ✅ Migrations, edge functions, secrets via tools      |
| `dpduljngdurfpmaclffa` | **Sua conta** (Vercel, CLI local, `config.toml`, `.env.example`, `forge-supabase.ts`) | ❌ Só por SQL/CLI que você roda. Eu gero os arquivos. |


**Lovable Cloud não desconecta** (documentação oficial). Então só temos dois caminhos honestos:

1. **Canônico = sua conta (`dpduljngdurfpmaclffa`).** Lovable Cloud vira "espelho descartável" usado só pro preview interno. Toda migration e edge function que eu criar daqui pra frente eu emito **também** como arquivo `.sql`/script que você roda via CLI no seu projeto.  **Recomendado** — é o que seu Vercel já usa.  
  
*ESSA É A ROTA*  

2. **Canônico = Lovable Cloud (`mtcnwvzjfbvyiuhrqrlo`).** Aponta Vercel e CLI pra esse ref. Mais simples mas você perde controle CLI/billing.

Vou planejar assumindo **(1)**. Se quiser **(2)**, me diz e eu reescrevo as fases 1–4.

---

## Eixos do plano

```text
A. Sincronização Supabase (1–6)        D. Editor & UX (24–32)
B. Segurança crítica (7–13)            E. Integrações & deploy (33–40)
C. Agente — confiabilidade (14–23)     F. Performance, SEO, launch (41–50)
```

---

## A. Sincronização Supabase  *(prioridade absoluta)*

1. **Diff de schema** `mtcnwvzjfbvyiuhrqrlo` ↔ `dpduljngdurfpmaclffa`. Gero `scripts/sync/schema-diff.sql` que você roda no seu projeto pra ficar idêntico.
2. **Snapshot completo das edge functions** atuais → publico no `dpduljngdurfpmaclffa` via `supabase functions deploy` (instruções em `scripts/sync/deploy-all.sh`). Lista: `agent-run`, `admin-platform-secrets`, `connector-upsert`, `deploy-publish`, `github-import`, `mcp-server`, `preview-boot`, `project-delete`, `voice-transcribe`.
3. **Secrets paridade**: gero `scripts/sync/secrets-checklist.md` com todas as 13 secrets que precisam existir no seu projeto (`E2B_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `LOVABLE_API_KEY`, etc.).
4. `**supabase/config.toml**`: revisar `verify_jwt`, CORS, e timeouts por função; padronizar.
5. **Helper `forge-supabase**`: adicionar warning visível no editor quando `VITE_SUPABASE_URL` ≠ `dpduljngdurfpmaclffa` (hoje só `console.warn`).
6. `**scripts/sync/migrate.sh**`: wrapper que aplica qualquer migration nova nos dois refs (Lovable via tool, sua conta via `supabase db push`).

## B. Segurança crítica  *(corrige todas as 6 findings do painel)*

7. `**mcp-server` autenticação**: bloquear `POST/GET` sem `Authorization`; opcionalmente exigir `assertForgeAdmin` pras tools `auth_users`/`query`/`migrate`. *(finding agent_security crítico)*
8. `**realtime.messages` policy pra `project_files**`: replicar política `editor-%` para canais `project_files-<projectId>`. *(finding supabase_lov crítico)*
9. `**deployments` policies**: adicionar `UPDATE` + `DELETE` restritas ao owner. *(warn)*
10. `**user_roles` policies**: explicit `INSERT/UPDATE/DELETE` negando ao role `authenticated` (só `service_role` muda). *(warn — privilege escalation)*
11. `**has_role()` SECURITY DEFINER**: `REVOKE EXECUTE ... FROM authenticated` (chamado só dentro de policies, não por client). *(warn supabase linter)*
12. **Painel admin server-driven**: `AdminPlatformSecretsPanel` só renderiza se `admin-platform-secrets` `action: status` devolver `isAdmin: true`. Remove `isForgeAdminEmail` do client. *(warn)*
13. **Rotacionar `SUPABASE_SERVICE_ROLE_KEY**` depois das mudanças (via `supabase--rotate_api_keys` no Lovable + CLI no seu projeto).

## C. Agente — confiabilidade & qualidade

14. **Resume de execução**: botão "Continuar" no editor quando `ok: false, resumable: true` (loop.ts já marca, falta UI).
15. **Persistir `executionLog**` em `messages.tool_calls` pra histórico real (hoje fica em memória).
16. **Backoff + retry** por provider em `providers.ts` (Anthropic 529, Groq 429).
17. **Limite de tokens dinâmico**: medir `usage.input_tokens` do response e ajustar `CompressionManager` antes de estourar.
18. `**shell_exec` sandboxed**: hoje `git commit` solto; mover pra `tools/shell.ts` com allowlist de comandos.
19. **Detecção de loops**: `isStuck` hoje compara strings vazias; substituir por hash dos últimos 3 `tool_calls.name+args`.
20. `**RuntimeObserver` real**: rodar `tsc --noEmit` e `vite build --mode=production` dentro do E2B; capturar erros e devolver pro LLM.
21. `**SkillRegistry**`: implementar 3 skills concretas (shadcn, supabase-migration, tailwind-v4) com detecção por arquivo.
22. **Cancelamento server-side**: `AbortController` no client cancela fetch, mas Edge Function continua. Persistir `runs.canceled_at` e checar a cada step.
23. `**agent_runs` tabela**: id, project_id, started_at, finished_at, status, steps, provider, tokens. Dashboard simples em `/projects/$projectId/history`.

## D. Editor & UX

24. **Monaco editor** (`@monaco-editor/react`) no tab Code; salvar via serverFn `updateProjectFile`.
25. **File tree com criar/renomear/deletar** + drag-drop.
26. **Command palette** (`kbar`): Novo projeto, Importar GitHub, Snapshot, Publicar, Trocar provider, Buscar arquivo.
27. **Diff viewer** por mensagem do assistente (mostra fs_edit aplicados).
28. **Preview hot-reload**: WebSocket entre `project_files` change e iframe (E2B já tem HMR — só precisa invalidar).
29. **Voice em todas as caixas de texto** (PromptEnhancer, prompt rules editor).
30. **Visual edits**: clique em elemento no preview → seletor CSS + screenshot anexado ao próximo prompt.
31. **Trace expandível**: collapse por padrão, abre só último step; mostra args/result completos.
32. **Dark/light theme polido** + persistência por usuário em `profiles.meta.theme`.

## E. Integrações & deploy

33. **GitHub OAuth** (`github-oauth-start/callback` + `connectors.token_encrypted` AES-GCM). Requer secrets `GITHUB_OAUTH_CLIENT_ID/SECRET` + `ENCRYPTION_KEY`.
34. `**github-push**`: commit dos `project_files` num repo do usuário (cria se não existir).
35. **Webhook `/api/public/github-webhook**`: pull changes do GitHub → `project_files` (sync bidirecional).
36. **Deploy Vercel**: edge function `deploy-vercel` + token do usuário; "Publicar" no editor.
37. **Deploy Cloudflare Pages**: alternativa. Requer `CLOUDFLARE_API_TOKEN`.
38. **Stripe billing** (opcional): plano free (3 projetos) vs pro. Já temos tabela `connectors`, falta UI + webhook.
39. **MCP UI em `/connectors**`: adicionar/remover MCP server, listar tools, ativar no agente.
40. **Multi-provider dropdown** no chat (lê `connectors` do usuário + fallback global).

## F. Performance, SEO, launch

41. **Bundle audit**: `bun run build --analyze`; remover deps não usadas (Cursor.tsx, SpaceScene se não está na landing).
42. **Code-split**: lazy-load `Monaco`, `CodeEditor`, `AgentMemoryViewer`.
43. **Imagens otimizadas**: converter logos PNG → SVG/WebP; `loading="lazy"` em tudo abaixo da fold.
44. **SEO**: `head()` por rota (`/`, `/auth`, `/projects`, `/connectors`, `/settings`) com title/description únicos + og:image gerado.
45. `**robots.txt` + `sitemap.xml**` servidos via server route.
46. **Lighthouse ≥ 90** em LCP/CLS/INP na landing.
47. **Rate limiting** em `agent-run` (advisory lock por user_id + max 3 runs concorrentes).
48. **Audit log**: tabela `audit_events` (user_id, action, target, meta) + write em todas as serverFn mutadoras.
49. **Backup automático**: `pg_dump` diário do `dpduljngdurfpmaclffa` para storage (script GitHub Actions).
50. **Smoke test E2E** (`vitest` + `playwright`): signup → criar projeto → prompt → preview boota → snapshot → restore. Roda no CI antes do deploy.

---

## O que executo na próxima sessão (estimativa honesta)

Com aprovação do plano, **execução em ordem**, parando só em bloqueios reais (= secrets que não tenho):

- **Garantido (1 sessão)**: A1, A4, A5, B7, B8, B9, B10, B11, B12, C14, C15, C19, C22, C23, D26, D27, D31, F41, F44, F47, F48 → **≈ 21 tarefas**.
- **Provável (mesma sessão se sobrar tempo)**: A2, A6, B13, C16, C17, C20, D24, D25, D28, F45, F46 → mais **≈ 10**.
- **Total realista da próxima sessão**: **30–32 de 50** (60–65%).
- **Bloqueado por secrets seus**:
  - E33–E37 (GitHub OAuth, Vercel, Cloudflare) — precisa de tokens.
  - E38 (Stripe) — chave + decisão de plano.
  - F49 (backup) — precisa de bucket S3/R2.

## Pergunta única antes de implementar

Confirma o caminho **(1) sua conta `dpduljngdurfpmaclffa` como canônica** (Lovable Cloud vira espelho)? Se sim, aprovo o plano e na próxima sessão começo por **A1 → B7 → B8** (sincronização + as duas findings críticas), depois desço a lista.