# Sessão 2026-06-07 — Bugs de Produção no AgentLoop

## Contexto

Usuário relatou que o agente começou a trabalhar sozinho após uma qualify phase,
e o botão Stop não funcionava. Investigação completa via logs do Supabase, code
review e correção com deploy.

---

## Evidências de Produção (Supabase)

### 1. Reexecução de run já finalizado

```
run 6e299b16 → completed (steps=2, pergunta qualify) às 20:21:36
                 ↑ mesmo runId
                 ↓ 700ms depois, novo classify → execute → fs_read...
run 6e299b16 → reexecutado como modify/complexity=3 às 20:21:37
```

**Causa raiz:** `deleteAgentChunk` falhou silenciosamente. Mensagem PGMQ não
foi removida. Worker a reexecutou. Pre-check só bloqueava `canceled`, não
`completed`.

### 2. Duplicação de runs (race condition)

```
22:49:04.439 → run 98c89130 criado (status: running, steps: 0)
22:49:04.499 → run 876ac48c criado (status: running, steps: 0)
                ↑ mesmo projeto, mesma conversation, 60ms de diferença
                ↓ ambos com único evento "start", nunca processados
```

**Causa raiz:** `runningLocks` é `Map` em memória (não compartilhado entre
instâncias). SELECT de `activeRun` sem lock — ambos veem `null` e inserem.

### 3. Worker preso em mensagem zumbi

```
curl POST /agent-worker → { "ok": false, "error": "Projeto não encontrado" }
                                ↑ chamada manual confirmou o loop
```

**Causa raiz:** Mensagem de projeto deletado na cabeça da fila PGMQ. Worker
tenta processar, falha, catch não chama `finalizeRun` (run fica `running`
eternamente). PGMQ visibility timeout traz a mensagem de volta. Loop infinito.

### 4. E2B container leaking

Usuário reportou "concorrência de container acabando com o plano".
`sandbox.destroy()` era no-op intencional (preserva preview), mas falhas/retries
criavam múltiplos containers sem matar os anteriores.

---

## Typecheck (Deno)

```
$ deno check supabase/functions/agent-run/run-job.ts
Check passed (após correções)

Erros pré-existentes (não tocados):
- attachment-parse.ts:63 — mammoth.convertToMarkdown não existe
- adapters/llm.ts:3,6 — ChatResponse duplicado
- compression.ts:64,85 — getLastInputTokens duplicado
```

---

## Correções Aplicadas (commit f31b8e2)

### 1. `acquire_agent_run_lock` (migration SQL + index.ts)

```sql
CREATE FUNCTION acquire_agent_run_lock(p_project_id, p_conversation_id, p_user_id)
RETURNS uuid AS $$
  IF NOT pg_try_advisory_xact_lock(hashtext('agent_run_lock'), hashtext(p_project_id))
  THEN RETURN existing_run_or_null;
  END IF;
  -- lock adquirido: atomic check + insert
  INSERT INTO agent_runs ... RETURNING id;
$$ LANGUAGE plpgsql;
```

`index.ts` chama `supabase.rpc("acquire_agent_run_lock", ...)` em vez de
INSERT direto. Se lock pertence a outra instância, enfileira a mensagem.

### 2. Worker: finalizeRun no catch + pre-check ampliado

**`agent-worker/index.ts`:**
- Catch block chama `finalizeRun` com `status: failed`, `recoverable: false`
- Pre-check bloqueia `completed`, `failed`, `canceled` (antes só `canceled`)
- `deleteAgentChunk` retorna `boolean`; callers verificam antes de prosseguir

### 3. E2B: `kill()` vs `destroy()`

**`sandbox.ts`:**
```ts
destroy(): void  → this.sandbox = null                    // preserva preview
kill(): void     → await this.sandbox.kill(); this.sandbox = null  // mata container
sync(): void     → if (!this.sandbox) return              // não cria em fs_read
```

**`run-job.ts`:**
```ts
if (result.ok) await sandbox.destroy();  // preview vivo
else           await sandbox.kill();     // container morto
```

**`types.ts`:** `SandboxProvider` ganha `kill()`.

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `migrations/20260607000001_agent_run_acquire_lock.sql` | **Novo.** Advisory lock atômico para INSERT |
| `agent-run/index.ts` | Chama `acquire_agent_run_lock`; enfileira se lock existe |
| `agent-run/run-job.ts` | `destroy()` em ok, `kill()` em falha; dummy sandbox com `kill` |
| `agent-run/sandbox.ts` | `kill()` real, `sync()` não chama `ensure()` se null |
| `agent-run/types.ts` | `SandboxProvider.kill()` |
| `agent-worker/index.ts` | `finalizeRun` no catch, pre-check ampliado, verifica `deleted` |

---

## Patterns & Aprendizados

### Nunca confiar em estado em memória entre instâncias

`Map`/`Set` em memória só funciona dentro da mesma instância da Edge Function.
Para coordenação entre instâncias: **advisory lock no PostgreSQL**
(`pg_try_advisory_xact_lock`).

### PGMQ: sempre verificar sucesso do delete

`pgmq.delete` pode falhar silenciosamente (visibility timeout, race com
re-read). Sempre verificar retorno. Sempre ter pre-check de idempotência
(`status` do run) antes de executar.

### E2B: sandbox é caro, criar só quando necessário

- `fs_read` NUNCA deve criar sandbox
- `sandbox.destroy()` deve ter dois modos: preservar (preview) ou matar (falha)
- Circuit breaker (`e2bCreationCircuit`) já existe — respeitar

### Classificador não-determinístico

Llama 3.3 70B classificou o mesmo prompt como `type: other, complexity: 1`
(disparou qualify) e `type: modify, complexity: 3` (executou direto) em
execuções consecutivas. Cache por hash do prompt resolveria.

### Catch block deve finalizar o run

Se `executeAgentJob` lança exceção, o catch precisa chamar `finalizeRun` com
`status: failed`. Sem isso, o run fica `running` eternamente e o pre-check
não o bloqueia na reexecução.

### Idempotência em filas: pre-check + dead letter

- Pre-check: verificar `status` do run antes de executar
- Dead letter: se falhar N vezes consecutivas, mover para arquivo morto
- Skip locked: `pgmq.read` com `skip_locked` evita que mensagem zumbi bloqueie
  a fila inteira

---

## Deploys

| Função | Versão | Status |
|--------|--------|--------|
| `agent-run` | 73 | ACTIVE |
| `agent-worker` | 5 | ACTIVE |

