# E2B Template: dreaming-doing-chromium

Custom E2B template com Chromium headed + live view (noVNC) + CDP para extração DEEP.

**Fonte de verdade:** `docs/DESIGN_DNA_CANONICAL_SPEC.md` §5 e Etapa 4 (Gate G4).

## Portas

| Porta | Uso | URL externa |
|-------|-----|-------------|
| **9222** | Chrome DevTools Protocol (agent loop) | `https://9222-<sandboxId>.e2b.app` |
| **6080** | Live view noVNC (`previewUrl` no iframe) | `https://6080-<sandboxId>.e2b.app` |

A porta **9222 não é HTML** — nunca use como `previewUrl`. O iframe carrega **6080** (mesmo Chrome que o CDP controla).

## Por que?

Sem template custom, o sandbox genérico E2B não tem Chromium. Este template sobe:

1. **Xvfb** `:99` — display virtual
2. **Chromium headed** (sem `--headless`) com CDP em `:9222`
3. **x11vnc** `:5900` + **websockify/noVNC** `:6080`

Quando `run-design-dna` cria o sandbox, `ensurePreview()` valida CDP + live view e grava `meta.previewUrl` **antes** do agent loop.

## Build

```bash
cd e2b-template
npm install
echo "E2B_API_KEY=e2b_..." > .env
echo "E2B_TEMPLATE_TAG=dreaming-doing-chromium" >> .env

# Build dev (tag = dreaming-doing-chromium-dev)
npm run build:dev

# Build prod (tag = dreaming-doing-chromium)
npm run build:prod
```

O build demora ~5–10 min (download do Chromium + deps + noVNC).

## Uso no app

```bash
# .env.local ou secrets Supabase/Inngest
E2B_TEMPLATE=dreaming-doing-chromium
```

Após rebuild do template, jobs DEEP recebem `previewUrl = https://6080-<sandboxId>.e2b.app`.

## Arquitetura

```
┌─────────────────────────────────────────────┐
│ E2B Sandbox (dreaming-doing-chromium)       │
│                                             │
│  start-browser-stack.sh                     │
│  ├─ Xvfb :99                                │
│  ├─ Chromium (headed) → CDP :9222         │
│  ├─ x11vnc :5900                            │
│  └─ websockify/noVNC :6080  ← previewUrl    │
│                                             │
│  :9222  → agent CDP (WebSocket)             │
│  :6080  → iframe live view (HTML)           │
└─────────────────────────────────────────────┘
```

## Gate G4 (manual)

1. Disparar extração DEEP de uma URL
2. Iframe carrega `6080-...e2b.app` (noVNC)
3. Agente `navigate` → preview muda (mesmo browser)
4. Não reatribuir `iframe.src` para URL externa no frontend

## Limites

- 2 vCPUs, 4GB RAM por sandbox
- Sandbox TTL: 15 min auto-pause (configurado no executor)
- Rebuild obrigatório após alterar `template.ts`