# Diagnóstico: Erros de Build com Código Truncado

## O Problema

Erro recorrente em preview builds: o LLM gera código de landing pages (via `fs_write`) e o conteúdo chega truncado — especificamente, imports cortados no meio:

```
[plugin:vite:react-babel] /home/user/src/App.tsx: Unexpected token (1:83)

import { motion, useScroll, useTransform, useMotionValue, useMotionTemplate } from 
```

O arquivo termina abruptamente no caractere 83 da linha 1 — o resto da declaração de import (`"framer-motion";`) simplesmente não existe.

## Causa Raiz

### Causa Primária: `max_tokens: 4096` insuficiente para geração de código

O LLM escreve arquivos via `fs_write`, cujo `content` é o arquivo **inteiro** serializado como string JSON no argumento da tool call. Uma landing page completa (imports + componentes + JSX) consome facilmente 800-2000+ tokens. Com `max_tokens: 4096`, o LLM gasta tokens com:

1. JSON wrapper: `{"path":"src/App.tsx","content":"...` (dezenas de tokens)
2. System prompt massivo (identidade + regras + stack + ferramentas = 1500-2500+ tokens)
3. Histórico da conversa
4. File content do arquivo em si

**Quando o limite é atingido, o LLM para de gerar no meio do JSON string** — o parser recebe um `arguments` incompleto e escreve o arquivo truncado como está.

**Evidência:** `loop.ts` linhas 2045 e 2354 usam `max_tokens: 4096` para TODAS as chamadas LLM, incluindo geração de código. Não há override para operações que geram arquivos grandes.

### Causa Secundária: Possível corrupção no SSE streaming

O adaptador `chatCompletionsStream()` (adapters/llm.ts, linha 334) acumula os `arguments` de tool calls via:

```typescript
const lines = buffer.split("\n");
```

Se o provider enviar quebras de linha **reais** (não `\n` escapado) dentro do JSON da string `content` — o que acontece quando um arquivo de código fonte contém quebras de linha — o parser SSE parte o evento em múltiplas linhas, perdendo chunks de dados.

### Fator Agravante: Sem validação pós-escrita

Não há verificação de integridade. Se o `content` chega truncado, ele é escrito no arquivo assim mesmo — sem validação sintática, sem retry, sem warning.

## Arquivos Envolvidos

| Arquivo | Papel |
|---------|-------|
| `supabase/functions/agent-run/loop.ts` (L2045, L2354) | Chamadas LLM com `max_tokens: 4096` |
| `supabase/functions/agent-run/adapters/llm.ts` (L289-395) | SSE streaming; `\n` split pode quebrar JSON |
| `supabase/functions/agent-run/tools/fs.ts` (L70-120) | `fs_write` — salva content truncado sem validação |
| `supabase/functions/agent-run/types.ts` (L30) | Interface `ChatParams.max_tokens` |
| `src/lib/seeds/vite-react.ts` | Template seed que gera `src/App.tsx` inicial |

## Soluções Recomendadas

### 1. Aumentar `max_tokens` para geração de código

No `loop.ts`, duas chamadas LLM principais:

**L2045** (chamada de execução com tools):
```typescript
max_tokens: 4096,  // → 16384
```

**L2354** (chamada de execução principal):
```typescript
max_tokens: 4096,  // → 16384
```

### 2. Validar conteúdo de arquivos após `fs_write`

No `tools/fs.ts`, no handler `fs_write` (L84-120), adicionar verificação:

- Se o `content` termina com caractere de escape de string JSON não fechado
- Se o `content` não termina com `\n` (arquivo truncado geralmente não termina com newline)

Se detectar truncamento, retornar erro em vez de salvar. Isso força o LLM a regenerar.

### 3. Hardened SSE parser (adapter)

No `chatCompletionsStream()`, melhorar o buffer para não perder dados quando o JSON contém quebras de linha literais:

- Rastrear `{`/`}` balanceamento no buffer
- Ser mais tolerante a payloads JSON multi-linha
- Logar parsing failures com warning para diagnóstico

### 4. (Opcional) Diferenciação de `max_tokens` por tipo de operação

Criar dois níveis de `max_tokens`:
- `max_tokens: 4096` para conversação/clarify/inventário
- `max_tokens: 16384` para geração de código (`fs_write`)

## Como Verificar

1. **Build com o projeto real** — após as correções, gerar landing page, verificar se `App.tsx` está completo
2. **Teste unitário:** `max_tokens` defaults em loop.ts
3. **Teste de integridade:** mockar LLM com resposta truncada, verificar se `fs_write` rejeita

## Resumo

O build quebra porque o token budget `max_tokens: 4096` é muito baixo para gerar arquivos de código completos via tool call. O LLM para no meio do JSON string, o parser aceita o conteúdo truncado, e o Vite tenta compilar um arquivo TypeScript inválido.
