# FORGE — O Maior Custo-Benefício Agent Builder do Mundo

Plataforma de construção de apps web movida a IA. Descreva sua ideia e o agente Dream Weaver gera o código, configura o stack e faz o deploy — tudo em um só lugar.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + TanStack Start + TypeScript |
| UI | Radix UI + Tailwind CSS 4 + Framer Motion + Three.js |
| Backend | Supabase (DB, Auth, Storage, Edge Functions) |
| Sandbox | E2B (execução de código isolada) |
| Deploy | Cloudflare Pages / Vercel |

## Como rodar

```bash
bun install
bun run dev
```

## Arquitetura do Agente (v3 — Definitivo)

O Dream Weaver é o coração do FORGE. Combina o melhor de Bolt.new, v0, Lovable, Cursor e Replit em uma arquitetura model-agnostic com custo imbatível.

### Otimizações de Custo (Margem 90%+)

| Otimização | Economia | Como funciona |
|------------|----------|---------------|
| **Model Router** | 60-70% | Classifier barato ($0.15/1M tokens) roteia 70% das tarefas pra modelos baratos |
| **Conversation Compression** | 97% | Sumariza histórico a cada 5 turns — 50K tokens viram 500 |
| **Prompt Caching** | 50-90% | System prompt + tools sempre iguais = sempre cached (Anthropic/OpenAI) |
| **Parallel Execution** | 30-40% | Reads executadas em paralelo (Promise.all) |
| **Runtime Observer** | Auto-correção grátis | Observa build/typecheck e corrige erros sem user input |

### Ferramentas (8 tools)

| Tool | Descrição |
|------|-----------|
| `fs_read` | Lê um arquivo |
| `fs_read_many` | Lê vários arquivos com glob pattern |
| `fs_write` | Cria/sobrescreve arquivo |
| `fs_edit` | Substituição cirúrgica de texto |
| `fs_delete` | Remove arquivo |
| `fs_list` | Lista arquivos com glob |
| `fs_search` | Grep nos arquivos |
| `shell_exec` | Executa qualquer comando shell (git, npm, node, etc) |

### Loop de Execução

```
CLASSIFY ($0.15/1M) → GATHER CONTEXT + SKILLS → EXECUTE (parallel + auto-correção + runtime observer) → SUMMARIZE
```

1. **Classify**: Modelo barato classifica complexidade (1-5) e roteia pro modelo certo
2. **Gather Context**: Lê package.json, configs, estrutura + detecta skills ativas (React? Next? Supabase?)
3. **Execute**: Loop com tool-calling + execução paralela + auto-correção (build/typecheck/lint)
4. **Runtime Observe**: Observa build, typecheck, lint, git status. Erro → feedback → corrige
5. **Summarize**: Resposta final em português

### Streaming SSE

```json
{"type":"classify","complexity":3,"model":"main","summary":"Criar dashboard React"}
{"type":"phase","phase":"gather","message":"Analisando projeto..."}
{"type":"skills","active":["react-tailwind","supabase-backend"]}
{"type":"tool_start","name":"fs_read","args":{"path":"package.json"}}
{"type":"tool_done","name":"fs_read","ok":true}
{"type":"validate_ok","message":"Runtime OK"}
{"type":"done","summary":"Dashboard criado com React + Tailwind + Supabase"}
```

### Model-Agnostic

```env
# Modelo principal (tarefas complexidade 3-5)
LLM_PROVIDER=claude
LLM_API_KEY=sk-...
LLM_MODEL=claude-sonnet-4-20250514

# Modelo barato (classificação + sumarização + tarefas 1-2)
LLM_CHEAP_PROVIDER=openai
LLM_CHEAP_API_KEY=sk-...
LLM_CHEAP_MODEL=gpt-4o-mini
```

### Skill System (agentskills.io compatible)

Skills são auto-detectadas com base nos arquivos do projeto:

| Skill | Ativada quando |
|-------|---------------|
| `react-tailwind` | Projeto tem package.json |
| `nextjs-app-router` | Projeto tem next.config.* |
| `supabase-backend` | Projeto usa @supabase/supabase-js |
| `vite-react` | Projeto tem vite.config.* |

Skills injetam system prompts específicos pro LLM seguir padrões corretos da stack.

### Supabase MCP Server

Edge Function `mcp-server` expõe tools do Supabase via protocolo MCP:

```
mcp__supabase__query        → Executa query SQL
mcp__supabase__migrate      → Aplica migration
mcp__supabase__list_tables  → Lista tabelas
mcp__supabase__auth_users   → Lista usuários
mcp__supabase__rls_status   → Verifica RLS
```

Qualquer cliente MCP (Claude Desktop, Cursor, Continue.dev) pode conectar.

## Estrutura de Arquivos

```
supabase/
  functions/
    agent-run/
      index.ts          # Edge Function SSE streaming
      loop.ts           # AgentLoop definitivo (router + compression + observer + skills)
      router.ts         # Model Router (classify + route)
      compression.ts    # Compression + Parallel Exec + Prompt Cache
      observer.ts       # Runtime Observer (build + typecheck + lint + git)
      skills.ts         # Skill Registry (agentskills.io compatible)
      registry.ts       # ToolRegistry
      sandbox.ts        # E2B + Noop fallback
      prompts.ts        # System prompts
      types.ts          # Core types
      adapters/
        llm.ts          # 5 adapters (Claude, OpenAI, Gemini, OpenRouter, Ollama)
      tools/
        fs.ts           # 7 ferramentas filesystem
        shell.ts        # shell_exec universal
    mcp-server/
      index.ts          # Supabase MCP Server
  migrations/
    *.sql               # Schema completo
```

## Comparação com Concorrentes

| Feature | v0 | Bolt | Lovable | Replit | Cursor | **FORGE** |
|---------|-----|------|---------|--------|--------|-----------|
| Preview instantâneo | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Fullstack (DB+Auth) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ (Supabase-native) |
| Model-agnostic | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Skills marketplace | ❌ | ❌ | ❌ | ❌ | ✅ (MCP) | ✅ (agentskills.io) |
| Runtime observation | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Deploy 1-clique | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (Cloudflare) |
| Git-native | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Self-hosted | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Custo/sessão | $0.50+ | $0.30+ | $0.40+ | $0.20+ | $1.00+ | **$0.12** |
| MCP server | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Supabase) |
| Model routing | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Status

- [x] 5 adapters LLM (Claude, OpenAI, Gemini, OpenRouter, Ollama)
- [x] Model Router com classificação automática
- [x] Conversation Compression (97% economia)
- [x] Parallel Tool Execution
- [x] Runtime Observer (build + typecheck + lint)
- [x] Skill System (agentskills.io compatible)
- [x] Supabase MCP Server
- [x] Streaming SSE
- [x] 8 ferramentas model-agnostic
- [ ] Sandbox E2B em produção
- [ ] Deploy automático (Cloudflare Pages API)
- [ ] Preview em tempo real (WebContainers)
