/** Mensagem de boas-vindas — fase Taste (sem chave LLM própria). */
export const FORGE_WELCOME_MARKDOWN = `Olá! Sou o **concierge FORGE** (Taste · NVIDIA).

**O que posso fazer agora**
- Explicar o editor, preview ao vivo, conectores e **API Keys**.
- Ajudar a escolher provedor e modelo — **sem construir o MVP inteiro** neste chat (50 mensagens).

**Quer construir de verdade?**
Use **Start Project** (1×): plano + código + preview no painel à direita.

**Checklist**
1. [API Keys](/api) → chave **E2B** (sandbox) + **NVIDIA** (ou pool ROBIN).
2. [Modelos](/models) → **ROBIN** + NVIDIA + **Nemotron 550B** (slug \`nvidia/nemotron-3-ultra-550b-a55b\`) → **Salvar**.
3. O chat já abre em modo **Build** — descreva o app e o agente edita \`src/App.tsx\` no preview.`;

/** BYOK — chaves do usuário; agente completo (só projeto novo, sem histórico). */
export const FORGE_WELCOME_BYOK_MARKDOWN = `Descreva o que quer construir — o agente edita o código e o **preview** aparece à direita.

Antes do primeiro build, confira [API](/api) (E2B + NVIDIA) e [Modelos](/models) (Nemotron ou o modelo que preferir).`;