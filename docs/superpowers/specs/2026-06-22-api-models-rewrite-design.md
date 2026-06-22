# Api & Models — inventário, arquitetura e rewrite

**Data:** 2026-06-22  
**Objetivo:** página única `/api-models` com contrato claro — sem duplicar catálogo, sem writes espalhados.

---

## 1. Fontes de verdade (somente leitura na UI)

| Camada | Arquivo | Conteúdo |
|--------|---------|----------|
| Providers built-in + custom | `src/lib/ai-provider-registry.ts` | id, label, baseUrl, secretKey, llmProvider, supportsPool |
| Catálogo de modelos | `src/lib/model-catalog.ts` | presets, tiers, ranks — **IDs intocados** |
| Wire runtime (backend) | `supabase/functions/_shared/provider-wire.ts` | espelha registry |
| STT | `src/lib/stt-config.ts` | groq / grok / openrouter + modelos fixos |
| Preferências agente | `profiles.agent_preferences` + cache `forge:agent-preferences` |

---

## 2. Providers built-in (13)

| id | label | secretKey | pool |
|----|-------|-----------|------|
| alibaba | Alibaba DashScope | DASHSCOPE_API_KEY | — |
| anthropic | Anthropic | ANTHROPIC_API_KEY | — |
| deepseek | DeepSeek | DEEPSEEK_API_KEY | — |
| gemini | Google Gemini | GEMINI_API_KEY | — |
| groq | Groq | GROQ_API_KEY | ✓ |
| minimax | MiniMax | MINIMAX_API_KEY | — |
| moonshotai | Moonshot Kimi | MOONSHOT_API_KEY | — |
| nvidia | NVIDIA NIM | NVIDIA_API_KEY | ✓ |
| ollama | Ollama local | OLLAMA_BASE_URL | — |
| openai | OpenAI | OPENAI_API_KEY | ✓ |
| openrouter | OpenRouter | OPENROUTER_API_KEY | ✓ |
| xai | xAI Grok | XAI_API_KEY | — |
| xiaomi | Xiaomi MiMo | MIMO_API_KEY | — |

**Custom:** `custom-{slug}` → DB `custom_providers`, chave `CUSTOM_{SLUG}_API_KEY`, adapter `openai`, pool ✓.

---

## 3. Modelos (38 presets catálogo)

Ver `RANKED_MODEL_PRESETS` + `NATIVE_POOL` + `OLLAMA_NATIVE` em `model-catalog.ts`.  
Backend mirror: chaves em `supabase/functions/_shared/model-presets.ts` (`PRESETS`).

**ROBIN defaults:** nvidia → `pool-nemotron-ultra-550b`, groq → `pool-groq-flash`.

**User models:** `userModelEntries[]` com `{ slug, env, label? }` → preset id `custom--{slug-dashes}`.

---

## 4. STT (voz)

| id | requiresEnv | modelo API |
|----|-------------|------------|
| groq (default) | groq | whisper-large-v3-turbo |
| grok | xai | grok-voice-stt |
| openrouter | openrouter | openai/whisper-large-v3 |

Independente do modelo de texto.

---

## 5. Infra & Tools (seção 3 da página)

| Item | kind connector | Escrita |
|------|----------------|---------|
| E2B sandbox | `e2b` | connector-upsert |
| Web search | `web_search` | connector-upsert (1 por usuário) |
| Ollama | `openai` + provider `ollama` | connector-upsert |

Ollama também aparece em Providers & Keys (card dedicado).

---

## 6. Lógica de modos (Model Engine)

### Auto
- `autoAllowedPresetIds[]` — modelos marcados; vazio = todos com chave
- Runtime: `resolveAutoForComplexity` no agent-run

### Fixo
- `fixedPresetId` — um preset do catálogo ou `custom--*`
- Runtime: `resolveModelFromPreferences`

### ROBIN
- `poolProvider` + `robinPoolModelId`
- Só providers com `supportsPool` **e** chave/pool conectado
- Runtime: `loadConnectorPools` + `defaultRobinModel`

### Cadastrar provider (passo 2 keys)
1. Modal: label + baseUrl → `custom_providers` + cache local
2. Salvar chave: `connector-upsert` com `meta.provider = custom-{slug}`, `meta.baseUrl`

### Cadastrar modelo (passo 3 engine)
1. Selecionar provider no grid
2. Input slug → `userModelEntries` com `env = providerId` selecionado
3. Slug completo `env/model` se usuário não incluir `/`

---

## 7. Problemas do código antigo (por que 404 / quebra)

1. **Writes espalhados** em `ApiModelsPage` (700+ linhas), `AiModelStudio`, `MotorInfraSection`
2. **Query web_search** com cast inválido → GET 400 em `connectors_public`
3. **Delete custom** não removia `custom_providers` no DB
4. **Dupla persistência** inconsistente (localStorage vs DB, studio só local)
5. **Fallback wire** para provider desconhecido apontava OpenRouter (mascarava erro)

---

## 8. Nova arquitetura (rewrite)

```
src/lib/api-models/
  types.ts           — ProviderUiState, PageActions
  provider-list.ts   — merge lista (registry + rows), build UI state
  actions.ts         — único módulo de escrita (prefs, keys, custom, infra)
  use-api-models-page.ts — hook: queries + state + delega actions

src/components/connectors/api-models/
  ApiModelsPage.tsx        — shell (~120 linhas)
  ModelEngineSection.tsx   — presentational
  ProvidersKeysSection.tsx — presentational
  InfraToolsSection.tsx    — presentational
  AddProviderModal.tsx     — chama actions.addCustomProvider
```

**Regra:** componentes de UI **nunca** chamam `save-*` nem `supabase` diretamente.

**Legado:** `AiModelStudio` / `MotorInfraSection` — remover writes; manter só links para `/api-models` se ainda referenciados.

---

## 9. Fluxo de escrita unificado

| Ação | actions.ts → |
|------|----------------|
| Mudar modo/modelo/STT | `patchPreferences` → `saveAgentPreferencesToDb` |
| Salvar chave LLM | `saveProviderKey` → `save-connector.ts` |
| Pool append/remove | `appendProviderPoolKey` / `removeProviderPoolKey` |
| Disconnect provider | `disconnectProvider` (+ `removeCustomProviderFromDb` se custom) |
| Add custom provider | `registerCustomProvider` → DB + registry cache |
| E2B / Ollama / Web | `saveE2b` / `saveOllama` / `saveWebSearch` |

Invalidação: `queryClient.invalidateQueries(['connectors-public'])` após qualquer connector.