# design-dna-email

Temporary email worker for design-dna extraction pipeline. Provides temporary email addresses that Playwright automation uses to log into sites requiring email verification.

## Deploy

```bash
cd workers/design-dna-email
wrangler deploy
```

### First-time setup

1. Create the KV namespace:
   ```bash
   wrangler kv:namespace create DESIGN_DNA_EMAIL_KV
   ```
2. Copy the returned ID and paste it into `wrangler.toml` under `[[kv_namespaces]]`
3. (Optional) Create preview namespace for dev:
   ```bash
   wrangler kv:namespace create DESIGN_DNA_EMAIL_KV --preview
   ```
4. Set `FORGE_DOMAIN` (defaults to `forge.app` in production, `forge.preview.app` in preview)

## Configure Email Routing

1. Go to Cloudflare Dashboard > Email > Email Routing
2. Add your domain (e.g., `forge.app`)
3. Create a **Catch-All** rule or a custom route:
   - Destination: Select this worker (`design-dna-email`)
   - Action: Send to worker
4. Emails sent to `*@design-dna.<FORGE_DOMAIN>` will be received by this worker

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create a new email session |
| `GET` | `/api/sessions/:sessionId` | Get session info and messages |
| `GET` | `/api/sessions/:sessionId/wait` | Long-poll wait for new email (up to 60s) |
| `DELETE` | `/api/sessions/:sessionId` | Delete session |

## Env vars

| Var | Default | Description |
|-----|---------|-------------|
| `FORGE_DOMAIN` | `forge.app` | Domain where email addresses are created |
| `DESIGN_DNA_EMAIL_KV` | (binding) | KV namespace for email storage |
