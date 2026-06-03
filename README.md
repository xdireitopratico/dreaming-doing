# FORGE — Construa o inimaginável

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

## Arquitetura do Agente

O Dream Weaver é o coração do FORGE. Ele recebe prompts em linguagem natural e gera código completo.

### Ferramentas (8 tools, model-agnostic)

| Tool | Descrição |
|------|-----------|
| `fs_read` | Lê um arquivo |
| `fs_read_many` | Lê vários arquivos com glob pattern |
| `fs_write` | Cria/sobrescreve arquivo |
| `fs_edit` | Substituição cirúrgica de texto (como o edit_file do Command Code) |
| `fs_delete` | Remove arquivo |
| `fs_list` | Lista arquivos com glob |
| `fs_search` | Grep nos arquivos |
| `shell_exec` | Executa qualquer comando shell (git, npm, node, ls, cat, etc) |

### Loop de Execução

```
GATHER CONTEXT → ANALYZE INTENT → EXECUTE (com auto-correção) → SUMMARIZE
```

1. **Gather Context**: lê package.json, configs, estrutura do projeto — o LLM não trabalha às cegas
2. **Analyze Intent**: classifica o pedido (projeto novo, feature, bug, dependência)
3. **Execute**: loop com tool-calling + auto-correção (build falhou → erro → corrige → rebuild, máx 3x)
4. **Summarize**: resposta final em português

### Streaming SSE

O frontend recebe eventos em tempo real:
```json
{"type":"phase","phase":"gather","message":"Analisando projeto..."}
{"type":"tool_start","name":"fs_read","args":{"path":"package.json"}}
{"type":"tool_done","name":"fs_read","ok":true}
{"type":"validate_ok","message":"Build passou"}
{"type":"done","summary":"App criado com React + Tailwind..."}
```

### Model-Agnostic

O modelo de linguagem é commodity. Configure via variáveis de ambiente:

```env
LLM_PROVIDER=claude     # claude | openai | gemini | openrouter | ollama
LLM_API_KEY=sk-...
LLM_MODEL=claude-sonnet-4-20250514
LLM_BASE_URL=           # opcional (ex: http://localhost:11434/v1 para Ollama)
E2B_API_KEY=            # opcional (sem ela, shell_exec roda em modo simulado)
```

### GitHub Integration

O agente comita automaticamente cada mudança:
```bash
git add -A && git commit -m "src/App.tsx: update"
```

O código-fonte do projeto fica no repositório do usuário, não no nosso.

### LLM Adapters

```
Claude (Anthropic)  │  OpenAI (GPT-4o)  │  Gemini  │  OpenRouter  │  Ollama (local)
```

O adapter normaliza tool definitions e respostas para um formato único, independente do provedor.

## Estrutura de Arquivos

```
supabase/
  functions/
    agent-run/
      index.ts          # Edge Function principal com SSE streaming
      loop.ts           # AgentLoop com 4 fases + auto-correção
      registry.ts       # ToolRegistry (registro/execução dinâmica de tools)
      sandbox.ts        # E2B + Noop fallback
      prompts.ts        # System prompts por fase
      types.ts          # Tipos base model-agnósticos
      adapters/
        llm.ts          # 5 adapters (Claude, OpenAI, Gemini, OpenRouter, Ollama)
      tools/
        fs.ts           # 7 ferramentas de filesystem
        shell.ts        # 1 ferramenta universal shell_exec
  migrations/
    *.sql               # Schema do banco (projects, files, messages, agent_plans, etc)
src/
  routes/               # Rotas da aplicação (landing, auth, editor, etc)
  components/           # Componentes React (UI, landing, editor)
  lib/                  # Auth, theme, smooth-scroll
  integrations/         # Supabase client, Lovable auth
```

## Status

- [x] Agente model-agnóstico com 8 ferramentas
- [x] Loop de execução com auto-correção
- [x] Streaming SSE para frontend
- [x] Criação de projetos via shell_exec
- [x] Adapters para 5 provedores de LLM
- [ ] Sandbox E2B em produção (atualmente noop)
- [ ] Deploy automático (Cloudflare Pages API)
- [ ] Preview em tempo real (WebContainers)
- [ ] MCP connectors
