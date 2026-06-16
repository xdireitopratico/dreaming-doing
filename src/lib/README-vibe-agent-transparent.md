# Vibe Agent Transparent v2

## Arquitetura

O Vibe Agent agora opera com dois canais independentes:

### 1. Chat (canal limpo)
- `useVibeChat` hook
- Intro contextual
- Minicard de looping em tempo real
- Plano atômico com tarefas
- Fechamento com resumo e próximos passos

### 2. Inspector (canal completo)
- `useVibeInspector` hook
- Thinking stream bruto do LLM
- Tool call timeline
- Session metadata
- Export JSON da sessão

## Fluxo de execução

```
POST /functions/v1/vibe-agent-chat/execute
  ↓
createSSEStream(chat) + createSSEStream(inspector)
  ↓
executeAgentLoop()
  ├── emit chat_intro
  ├── runExplorationLoop()
  ├── runLLMExecution()
  │   ├── load history
  │   ├── load flow definition
  │   ├── call LLM
  │   ├── parse response
  │   └── normalize patch
  ├── emit chat_plan_approved
  ├── emit chat_closure
  └── persist messages + events
```

## Endpoints

- `POST /execute` — inicia execução
- `GET /stream/chat` — SSE do canal limpo
- `GET /stream/inspector` — SSE do canal completo
- `POST /apply-patch` — aplica patch versionado
- `POST /undo` — desfaz versão
- `GET /history` — histórico de versões
- `POST /conversations` — cria conversa
- `GET /conversations` — lista conversas

## Resiliência

- Idempotência via `Idempotency-Key`
- Retry exponencial com jitter no client
- Abort via `AbortController`
- Rate limiting por conversa
- Buffer capped no inspector

## Validação

```bash
npx tsc --noEmit
deno check supabase/functions/_shared/agent-loop.ts
deno check supabase/functions/vibe-agent-chat/index.ts
```
