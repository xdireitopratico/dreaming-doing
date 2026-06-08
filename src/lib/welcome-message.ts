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

/** BYOK — chaves do usuário; agente completo. */
export const FORGE_WELCOME_BYOK_MARKDOWN = `Projeto pronto para construir.

**Checklist (acima do chat)**
Confira E2B + modelo Nemotron — o agente só roda com os dois OK.

**Preview à direita**
Quando a IA gravar arquivos, seu site aparece aqui (rotas na barra do preview).

**Para testar o 550B**
- [Modelos](/models): **ROBIN** + pool **NVIDIA** + card Nemotron Ultra, ou **Fixo** com o mesmo slug.
- Slug na API NIM: nvidia/nemotron-3-ultra-550b-a55b (igual Hermes / build.nvidia.com).
- [API](/api): chave NVIDIA salva + **E2B**.

O chat já abre em **Build** — descreva o MVP (ex.: landing + dashboard) e a interface aparece no preview.`;