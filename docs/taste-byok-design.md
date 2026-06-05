# FORGE — Taste (NVIDIA) + BYOK + Router

## Visão

- **Tecnologia:** FORGE (editor, agent-run, preview iframe, conectores, setup).
- **Crédito de inferência (fase 1):** do usuário (BYOK). Sem plano corporativo misturado no router.
- **Taste:** porta de entrada com **NVIDIA Nemotron 550B** (pool da plataforma, isolado). Agente **concierge/vendedor**, não engenheiro full-time.

## O que “sem default” significa

- **Não** cair da chave NVIDIA do usuário (429) para Anthropic/chaves do admin.
- **Não** assumir Sonnet/modelo sem escolha do usuário em BYOK.
- **Router inteligente (Auto)** existe **só** com chaves do usuário, entre modelos **ativos** dele.

## Fase Taste

| Recurso | Quantidade | Comportamento |
|---------|------------|---------------|
| **Taste Chat** | **50** mensagens | Concierge: capacidades, diagnóstico, orientar Vercel/API Keys/conectores. Sem job de construção. |
| **Start Project** | **1** por conta | Job real **10–15 min**: apresenta **plano**, agent-run completo, tools, preview **iframe**. Usuário sente o produto e decide continuar (BYOK). |

### Taste Chat (concierge)

- Modelo: NVIDIA Taste (pool admin / secret isolada).
- Sem `shell_exec` / loop longo de build.
- Pode sugerir links e passos (`/api-keys`, conectores).
- Coleta **e-mail** (lead); **senha** só via `/auth`, nunca no chat.

### Start Project

- Mesmo motor `agent-run` + SSE + preview ao vivo.
- Prompt: plano visível (fases, escopo ~10–15 min), UI polida, escopo limitado mas **não** só landing vazia.
- Ao terminar: CTA “Configure suas API Keys para continuar construindo”.

## Fase BYOK (produção)

- Setup obrigatório: modo (Fixo / Auto / ROBIN) + chaves + modelos ativos.
- `connectorKeys` = **somente** usuário (sem merge de LLM da plataforma).
- **Auto:** `ModelRouter` (barato vs forte) no inventário do usuário.

## Detecção de fase

```
se usuário tem chave LLM própria habilitada → BYOK
senão se sessionKind === taste_start e taste_start_remaining > 0 → Start Project
senão se taste_chat_remaining > 0 → Taste Chat
senão → bloqueio + CTA API Keys
```

## UI educacional (paralelo ao agente)

- Setup rail + **TasteSetupChecklist** (trilha 5 passos).
- Botão **Start Project** no chat vazio.
- Deep links: `#forge-ai-studio`, `#forge-key-vercel`, `/connectors`.
- SSE **`ui_action`**: `open_connector`, `navigate_setup`, `lead_saved` → eventos `forge:ui-action` no editor.
- **TastePostStartBanner** após Start Project consumido.

## Contadores (`profiles`)

- `taste_chat_remaining` — default **50**
- `taste_start_remaining` — default **1**
- `trial_messages_remaining` — legado; código prefere `taste_*`