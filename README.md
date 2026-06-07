# FORGE — Dream and Doing

Plataforma de construção de apps web movida a IA. Descreva sua ideia e o agente gera código, configura o stack e faz deploy.

> **Agentes LLM:** leia **[FORGE.md](./FORGE.md)** (fonte de verdade).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + TanStack Start + TypeScript |
| UI | Radix UI + Tailwind CSS 4 |
| Backend | Supabase (DB, Auth, Realtime, Edge Functions) |
| Agente durável | Inngest |
| Sandbox | E2B |
| Deploy | Vercel (+ preview E2B) |

## Como rodar

```bash
npm install
npm run dev
```

## Agente (resumo)

```
Editor → useAgentRun → Edge agent-run → Inngest → loop
       → agent_stream_events → Supabase Realtime → UI
```

Detalhes, debug e arquivos críticos: **[FORGE.md](./FORGE.md)**.

## Deploy

```bash
./scripts/sync/migrate.sh
./scripts/sync/deploy-all.sh
```

Supabase ref canônico: `dpduljngdurfpmaclffa`. Vercel: `npm run build && npm run build:inngest`.