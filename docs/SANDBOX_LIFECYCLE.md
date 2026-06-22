# Sandbox Lifecycle — E2B

> Contrato de quando o sandbox E2B é criado, conectado, e destruído
> no fluxo do Vibe Code (template `vite-react`). Estabilizado nos patches
> P1–P4 em 2026-06-21.

## TL;DR

| Momento | Deveria criar sandbox? | Quem decide | Quem cria |
|---|---|---|---|
| User entra no editor (sem files) | NÃO | n/a | ninguém |
| User envia "oi" no Plan mode | NÃO | `resolveAllocateSandbox` (planMode=true) | ninguém |
| User envia "oi" no Build mode, sem files | NÃO | P4 (fileCount===0 fail-fast) | ninguém |
| User envia msg longa no Build, sem files | NÃO (P4 fail-fast) | P4 | ninguém |
| User envia msg longa no Build, COM files | SIM | `resolveAllocateSandbox` (return true) | `E2BSandbox.ensure()` |
| Aprova plano + envia "ajusta X" curto | SIM | `hasApprovedPlanInHistory=true` + `!looksLikeInteractionOnly` | `E2BSandbox.ensure()` |
| Aprova plano + envia "entendi" (conversa) | NÃO (P2) | `hasApprovedPlanInHistory=true` + `looksLikeInteractionOnly` + `!projectHasSandbox` | ninguém |
| User abre aba Preview com files | SIM | onClick → `boot({force: true, userInitiated: true})` | `preview-boot` edge → `connectProjectSandboxForPreview` |
| User abre aba Preview sem files | NÃO | edge `if (files.length === 0) → no_files` | ninguém |
| Auto-boot during run (sem files) | NÃO (P1) | `useEditorAgentOrchestration:209` gate `fileCount === 0` | ninguém |
| Auto-boot during run (com files) | SIM | onUserAction ausente, mas fileCount > 0 | edge `connectSandboxForPreview` |

## Quem chama o quê

```
┌─ user clica "Atualizar Preview" / "Abrir Site" (onClick)
│   useEditorPageHandlers.handleOpenLiveSite / handleDiffAccept/Reject
│     → previewBoot.boot({force: true, silent: true})  // userInitiated=true (default)
│         → POST /functions/v1/preview-boot {force: true, userInitiated: true}
│             → if (cached && !force) → reuse
│             → if (files.length === 0) → return no_files
│             → connectProjectSandboxForPreview / ensureAgentProjectSandbox
│
├─ auto-run durante execução (useEditorAgentOrchestration)
│   useEffect[running] dispara quando agent conecta
│     if (fileCount === 0) return  // P1
│     → previewBoot.bootWithRetry({force: true, silent: true, userInitiated: false})
│         → POST /functions/v1/preview-boot {force: true, userInitiated: false}
│             → log info (não warn) para observabilidade
│             → mesmo caminho de criação
│
└─ agent-run loop (Build mode)
    resolveAllocateSandbox(...) — decide se aloca
      if true → run-job.ts:321-336
        if (fileCount === 0) throw fail-fast  // P4
        → createSandboxProvider (classe lazy)
        → registerShellTool
      E2BSandbox.ensure() — chamado em primeiro shell_exec
        if (allowCreate && count > 0) → ensureAgentProjectSandbox → CRIA
        else → connectExistingProjectSandbox → só conecta
```

## Estados do projeto

| Estado | Condição | Sandbox E2B |
|---|---|---|
| **EMPTY** | `project_files.length === 0` | NÃO EXISTE |
| **READY** | `project_files.length > 0` E `meta.previewSandboxId` setado | EXISTE E ATIVO |
| **STALE** | `meta.previewSandboxId` setado mas `envd` não responde | precisa reboot |
| **KILLED** | `meta.previewSandboxId` foi limpo | NÃO EXISTE |

## Princípios

1. **Sandbox só nasce com intent de código.** `resolveAllocateSandbox` é a porta de entrada. Mensagens curtas, conversa social, e Plan mode sem plano aprovado não alocam.

2. **Sandbox é caro.** E2B custa dinheiro. Cada sandbox não-utilizado é desperdício. Auto-run (P1+P2+P3) tem que respeitar isso.

3. **User action tem precedência.** Se o user clica "Abrir Site", o sandbox nasce (mesmo com files=0, recebe mensagem clara). Auto-run sem files não cria.

4. **Fail-fast é melhor que lazy.** P4 garante que `allocateSandbox=true && files=0` falha imediatamente em `run-job.ts`, em vez de esperar o LLM chamar `shell_exec` e descobrir 60-90s depois.

5. **Tabela de lifecycle é lei.** Se você quer adicionar um novo caller de boot, atualize esta tabela E adicione gate explícito de `fileCount === 0` antes de chamar.

## Testes

- `supabase/functions/agent-run/run-context.test.ts` — cobre `resolveAllocateSandbox` com 5 cenários.
- Smoke E2B (`scripts/smoke-e2b-template.mjs`) — 16/16 checks estruturais do template.
- Smoke build failure fix (`scripts/smoke-build-failure-fix.mjs`) — 4/4 patches.

## Histórico de mudanças

- **2026-06-21 (P1)** — `useEditorAgentOrchestration:209` gate `fileCount === 0`.
- **2026-06-21 (P2)** — `resolveAllocateSandbox` não força alocação em conversa pós-aprovação.
- **2026-06-21 (P3)** — `userInitiated` flag distingue auto-run de user action em `boot`/`preview-boot`.
- **2026-06-21 (P4)** — `run-job.ts` rejeita `allocateSandbox` sem files com fail-fast.
