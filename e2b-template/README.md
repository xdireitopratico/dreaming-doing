# E2B Template: dreaming-doing-chromium

Custom E2B template que vem com Chromium + Playwright pré-instalados e Chromium rodando com Chrome DevTools na porta 9222.

## Por que?

Sem template custom, o sandbox genérico E2B (`code-interpreter-v1`) não tem Chromium nem Chrome DevTools. O padrão `<port>-<sandboxId>.e2b.app` que o app gera (`https://9222-<sandboxId>.e2b.app`) **não funciona** porque o sandbox não escuta em 9222.

Este template resolve isso instalando e iniciando Chromium no build, então quando um sandbox é criado, Chrome já está rodando e o `previewUrl` do BrowserPreview realmente funciona.

## Build

```bash
cd e2b-template
npm install
# .env precisa de E2B_API_KEY (pega do .env.local raiz ou define direto)
echo "E2B_API_KEY=e2b_..." > .env
echo "E2B_TEMPLATE_TAG=dreaming-doing-chromium" >> .env

# Build dev (tag = dreaming-doing-chromium-dev)
npm run build:dev

# Build prod (tag = dreaming-doing-chromium)
npm run build:prod
```

O build demora ~5-10 min (download do Chromium + install de deps).

## Uso

Depois do build, configure o app para usar o template:

```bash
# No .env.local (ou secrets do Supabase)
E2B_TEMPLATE=dreaming-doing-chromium
```

Quando o executor `run-design-dna` criar o sandbox, ele usa este template. Chromium já estará rodando em `:9222` e o `previewUrl` será `https://9222-<sandboxId>.e2b.app` — acessível externamente via E2B.

## Arquitetura

```
┌─────────────────────────────────┐
│ E2B Sandbox (template custom)   │
│                                 │
│  /usr/local/bin/start-chromium  │
│  └─> chromium headless          │
│      --remote-debugging-port=9222│
│      --remote-debugging-address │
│          =0.0.0.0                │
│                                 │
│  :9222  ←─── E2B hostname ────→  https://9222-<sandboxId>.e2b.app
│  :3000+ ←─ Playwright scripts  │
└─────────────────────────────────┘
```

## Limites

- 2 vCPUs, 4GB RAM por sandbox
- Sandbox TTL: 1h (configurável via `setSandboxTimeout`)
- Build demora ~5-10 min na primeira vez

## Próximos passos

1. Build dev, testar manualmente
2. Build prod, atualizar `E2B_TEMPLATE` no app
3. Validar iframe carrega no BrowserPreview
4. Commit no E2B → para reusar, basta o nome do template
