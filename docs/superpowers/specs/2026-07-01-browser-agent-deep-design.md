# Browser Agent Autônomo para Design Library — Modo DEEP

**Data:** 2026-07-01  
**Branch:** `feat/browser-agent-deep`  
**Status:** Aprovado para implementação  

---

## 1. Objetivo

Transformar o modo **DEEP** da Design Library em um agente autônomo de browser que navega, observa e extrai design DNA em tempo real via Chrome DevTools Protocol (CDP) dentro de um sandbox E2B. O usuário acompanha a execução no preview, conversa com o agente no chat e pode redirecioná-lo sem interromper o looping.

O resultado final deve ser um material absurdamente qualificado: riqueza de evidências visuais e estruturais combinando a profundidade do **Refero** (scrape estruturado + CSS + DOM) com a inteligência do **browser-use** (agente com visão orientado por objetivo).

---

## 2. Problema atual

O modo DEEP hoje executa um script Python (`/opt/forge/agent.py`) em batch dentro do sandbox. Ele:
- Navega para a URL.
- Tira screenshots segmentados.
- Computa CSS via JavaScript.
- Envia tudo para LLM extraction em multi-pass.
- Persiste o resultado na `design_system_library`.

O usuário vê o preview do sandbox e um chat genérico, mas:
- Não sabe o que o agente está fazendo agora.
- Não pode intervir durante a extração.
- O material é bom, mas não explorativo: se o LLM omitir algo, não há segunda chance autônoma.

---

## 3. Experiência alvo

### 3.1 Para o usuário

1. Cria um job DEEP para uma URL.
2. O sandbox inicia e o preview aparece.
3. No chat, o agente diz: *"Vou abrir https://site.com, começar pelo hero e depois explorar motion e tipografia."*
4. O usuário vê o iframe carregar a URL.
5. A cada passo, o chat mostra:
   - **Pensamento:** *"O hero tem uma imagem full-bleed com texto centralizado. Vou capturar o CSS computado e verificar se há parallax."*
   - **Ação:** ícone + descrição (ex: screenshot, scroll, analyze `.hero`).
   - **Observação:** resumo do que foi encontrado.
6. O usuário pode digitar: *"ignora o rodapé, foca nas animações de entrada"*.
7. O agente lê a instrução no próximo ciclo, ajusta o plano e continua.
8. Ao final, o agente entrega um Design DNA estruturado de alta qualidade, com referências a screenshots, seções DOM e CSS computado.

### 3.2 Métricas de sucesso

| Métrica | Target |
|---------|--------|
| Agent steps visíveis no chat | 100% |
| Screenshot por URL (mínimo) | 3 |
| CSS computado capturado | 100% DEEP |
| DOM sections/components detectados | ≥ 5 por URL |
| Instruções do usuário consumidas | ≥ 90% |
| Loop concluído sem crash | ≥ 95% |
| Material persistido na library | 100% concluídos |

---

## 4. Arquitetura

### 4.1 Diagrama de fluxo

```
Frontend: BrowserPreviewPanel
  ├─ iframe: E2B Sandbox (Chrome page)
  ├─ ChatPanel: SSE + mensagens do usuário
  └─ Timeline: eventos design_dna_events

Supabase / Inngest:
  design-dna-extract.ts
    └─ run-design-dna.ts
         └─ browser-agent-runner.ts  (NOVO)
              ├─ browser-agent-state.ts   (NOVO)
              ├─ browser-cdp-tools.ts     (NOVO, refatora design-library-actions)
              ├─ browser-agent-llm.ts      (NOVO)
              ├─ browser-agent-synthesis.ts (NOVO)
              └─ refero-fallback.ts        (reusa refero)

Banco:
  design_dna_jobs (existente)
  design_dna_events (existente)
  design_dna_instructions (NOVO)
  design_system_library (existente)
```

### 4.2 Ciclo do agente

```
1. Obter estado atual (URL, screenshot, DOM resumo, histórico).
2. Ler instruções pendentes do usuário.
3. Montar prompt para LLM com:
   - objetivo da extração
   - categorias solicitadas
   - histórico de ações/observações
   - screenshots base64
   - instruções do usuário
4. LLM retorna:
   - thought (texto)
   - action (uma das tools CDP)
   - done? boolean
   - dna_partial? (JSON acumulado)
5. Persistir thought + action como eventos.
6. Executar action no sandbox via CDP.
7. Coletar observação (resultado da tool).
8. Se done=true, sintetizar DNA final e persistir.
9. Senão, voltar ao passo 1.
```

### 4.3 Tools CDP disponíveis para o agente

| Tool | Descrição |
|------|-----------|
| `navigate` | Vai para URL, aguarda load. |
| `screenshot` | Captura viewport ou full page. |
| `scroll` | Scrolla para coordenada Y. |
| `click` | Clica em elemento por selector. |
| `type` | Digita texto em input. |
| `analyze` | Extrai tag, texto, html, rect, styles de selector. |
| `evaluate` | Executa JS customizado e retorna valor. |
| `get_url` | Retorna URL atual. |

---

## 5. Componentes novos

### 5.1 `browser-agent-state.ts`

Responsabilidade: manter o estado do agente durante a execução.

```typescript
export type BrowserAgentStep = {
  stepNumber: number;
  thought: string;
  action: AgentAction;
  observation: AgentObservation;
  timestamp: string;
};

export type BrowserAgentContext = {
  jobId: string;
  url: string;
  categories: string[];
  depth: "deep";
  userId: string;
  sandboxId: string;
  sandboxAccessToken: string | null;
  maxSteps: number;
  steps: BrowserAgentStep[];
  dnaPartial: Record<string, unknown>;
  instructions: UserInstruction[];
};
```

### 5.2 `browser-cdp-tools.ts`

Responsabilidade: executar comandos CDP no sandbox E2B.

- Refatora a lógica de `design-library-actions` para módulo reutilizável.
- Exporta funções tipadas: `navigate`, `screenshot`, `scroll`, `click`, `type`, `analyze`, `evaluate`, `getUrl`.
- Tratamento de erro e retry para operações CDP.

### 5.3 `browser-agent-llm.ts`

Responsabilidade: orquestrar chamadas ao LLM.

- Monta o prompt do agente.
- Força resposta em JSON com schema definido (`thought`, `action`, `done`, `dna_partial`).
- Suporta visão: anexa screenshots quando disponível.
- Reutiliza `resolveLLMConfig` do executor.

### 5.4 `browser-agent-synthesis.ts`

Responsabilidade: ao final do ciclo, transformar histórico de observações em Design DNA final.

- Coleta screenshots, CSS computado, seções, componentes.
- Chama LLM de síntese para gerar JSON final `layout`, `color`, `typography`, `motion`, `interaction`, `component`.
- Calibra `quality_score` e `confidence`.

### 5.5 `browser-agent-runner.ts`

Responsabilidade: orquestrar o loop do agente.

- Inicializa estado.
- Loop de até `maxSteps`.
- Consome instruções pendentes.
- Chama LLM → executa action → coleta observação.
- Persiste eventos.
- Finaliza e chama síntese.

### 5.6 `design_dna_instructions` (tabela nova)

Colunas:
- `id` uuid primary key
- `job_id` uuid references design_dna_jobs(id)
- `role` text (user/system)
- `content` text
- `status` text (pending/consumed/canceled)
- `created_at` timestamptz default now()
- `consumed_at` timestamptz nullable

RLS: usuário pode inserir instruções para seus próprios jobs; service_role pode atualizar status.

---

## 6. Integração com frontend

### 6.1 `BrowserPreviewPanel.tsx`

Mudanças:
- Novos tipos de evento exibidos no chat: `agent_thought`, `agent_action`, `agent_observation`.
- Mensagens do usuário inserem na `design_dna_instructions` em vez de apenas chamar `design-library-chat`.
- O chat passa a ser **modo passivo/ativo**:
  - Passivo: explica eventos do agente.
  - Ativo: envia instruções para o loop.
- Botões de ação rápida: "Focar no hero", "Ignorar rodapé", "Capturar motion", "Sintetizar agora".

### 6.2 `hooks.ts`

Adicionar:
- `useDesignDnaInstructions(jobId)` — realtime subscription na tabela `design_dna_instructions`.
- `usePostInstruction(jobId)` — mutation para inserir instrução.

---

## 7. Backwards compatibility

- Modo **SHALLOW** continua usando `extractDesignDnaForUrl` (batch) sem alterações.
- Modo **DEEP** passa a usar `BrowserAgentRunner`.
- `design-library-actions` e `design-library-chat` continuam existindo; a lógica CDP é extraída para módulo compartilhado.
- Python agent em `/opt/forge/agent.py` pode ser removido do template E2B em fase futura; durante a transição, mantém-se inativo.

---

## 8. Testes

- Unitários para cada tool CDP (com mock de resposta CDP).
- Testes de prompt e parsing do agente LLM.
- Testes de síntese com fixtures de observações.
- Teste E2E simplificado do runner com sandbox mockado.
- Testes frontend para inserção e exibição de instruções.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Custo LLM alto por causa de screenshots | Cache de screenshots; limitar maxSteps; usar modelo tier médio para thoughts, tier alto só para síntese. |
| Loop infinito ou repetitivo | maxSteps rígido; detector de ciclos (mesma URL + mesma ação 3x). |
| Sandbox instável | Retry por action; fallback para SHALLOW se sandbox falhar no início. |
| LLM não segue schema | Parser robusto com retry e fallback para `done=true` + síntese do que tem. |
| Segurança (navegação fora do domínio) | Allowlist de URLs baseadas no job; bloquear protocolos não-HTTP. |

---

## 10. Escopo explícito

**Dentro do escopo:**
- Novo agente DEEP com CDP, visão e chat realtime.
- Tabela `design_dna_instructions`.
- Refatoração de `design-library-actions` para módulo compartilhado.
- Melhorias no `BrowserPreviewPanel`.

**Fora do escopo:**
- Reescrever modo SHALLOW.
- Alterar pipeline de build do agente `agent-run` do FORGE.
- Substituir Refero (mantido como fallback/evidência).
- Billing/métricas de custo detalhadas.
