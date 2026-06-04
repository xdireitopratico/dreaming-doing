# Dogfood Report: FORGE (dreaming-doing)

| Field | Value |
|-------|-------|
| **Date** | 2026-06-04 |
| **App URL** | https://dreaming-doing.vercel.app |
| **Session** | forge-dogfood |
| **Scope** | Full app — landing, auth, projects, editor, settings, connectors |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 3 |
| Medium | 4 |
| Low | 4 |
| **Total** | **12** |

## Issues

---

### ISSUE-001: Redirect loop infinito — editor NUNCA renderiza

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Category** | functional |
| **URL** | https://dreaming-doing.vercel.app/projects/test123 |
| **Repro Video** | N/A |

**Description**

Qualquer rota que requer auth (`/projects`, `/projects/:id`, `/settings`, `/connectors`) redireciona para `/auth?next=...`. O problema é que o `MarketingShell.requireAuth` usa `window.location.pathname` como `next`, e ao chegar na rota `/auth`, o `AuthProvider` ainda detecta `!loading && !user`, causando novo redirect com `next` acumulando recursivamente:

```
/auth?next=/projects
/auth?next=/auth?next=/projects
/auth?next=/auth?next=/auth?next=/projects
... (aninhamento infinito)
```

Isso acontece porque o `useEffect` no `MarketingShell.tsx` linha 47 chama `navigate({ to: "/auth", search: { next: window.location.pathname } })`, e quando a página auth carrega na Vercel (sem acesso ao Supabase local), `window.location.pathname` é `/auth` — causando o loop `next = /auth → redirect → next = /auth?next=/auth → ...`.

**Root cause em MarketingShell.tsx linha 47:**
```tsx
navigate({ to: "/auth", search: { next: window.location.pathname } as never });
```

Deveria preservar o `next` original da URL atual, não sobrescrever com `pathname`. Quando já está em `/auth`, NÃO deve adicionar outro `next`.

**Impacto:** O editor é inacessível — este é o "problema mestre" mencionado.

---

### ISSUE-002: ~54 requisições de rede falhando no console (Supabase WebSocket)

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | console / errors |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

Toda navegação gera múltiplos erros no console. O snapshot de erros mostra 54 `✗` em todas as páginas — são tentativas de conexão WebSocket do Supabase Realtime falhando porque as variáveis `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` não estão disponíveis no ambiente serverless da Vercel. O `.env` local contém esses valores mas eles não são injetados no build Vercel (apenas `VITE_*` são).

A página carrega com SSR parcial, mas os erros se acumulam no lado do cliente quando o `supabase` tenta abrir conexão realtime.

---

### ISSUE-003: Google OAuth quebrado — depende do gateway Lovable

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | https://dreaming-doing.vercel.app/auth |
| **Repro Video** | N/A |

**Description**

O botão "Continuar com Google" chama `lovable.auth.signInWithOAuth("google", ...)` que depende de `@lovable.dev/cloud-auth-js`. Esse pacote requer o gateway Lovable Cloud para funcionar. Na Vercel, o clique não redireciona — a página permanece na mesma tela de auth sem feedback visível.

Sem OAuth funcional, o único caminho de login é email/senha via Supabase — mas o Supabase não tem as env vars na Vercel (ver ISSUE-002).

---

### ISSUE-004: Navbar links (MISSION, FEATURES, DOCS, PRICING) todos apontam para "/"

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

Os `ScrambleLink` componentes em `Nav.tsx` recebem `to="/"` para todos os 4 links de navegação:
```tsx
<ScrambleLink to="/" label="MISSION" />
<ScrambleLink to="/" label="FEATURES" />
<ScrambleLink to="/" label="DOCS" />
<ScrambleLink to="/" label="PRICING" />
```

Clicar em qualquer um deles não navega para lugar nenhum — são botões mortos. As páginas `/mission`, `/features`, `/docs`, `/pricing` não existem nas rotas do TanStack Router.

---

### ISSUE-005: Botão "Importar do GitHub" não funciona

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

O botão "Importar do GitHub" (ref=e14) na landing page tem `expanded=false` e ao ser clicado não expande, não abre modal, não faz nada. O atributo `expanded=false` indica que é um elemento colapsável, mas o handler de clique não está implementado ou não aciona nenhuma ação visível.

---

### ISSUE-006: Campos de email/senha sem labels acessíveis

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | accessibility |
| **URL** | https://dreaming-doing.vercel.app/auth |
| **Repro Video** | N/A |

**Description**

Os textboxes na página de auth (ref=e11, ref=e12) não têm labels associadas visíveis no snapshot inicial (modo collapsed). O snapshot completo mostra `LabelText "EMAIL"` e `LabelText "SENHA"`, mas os inputs não têm atributos `aria-label` ou associação explícita `htmlFor` ↔ `id` visível na árvore de acessibilidade. Leitores de tela podem não conseguir identificar os campos corretamente.

---

### ISSUE-007: Botão "Enviar" sempre desabilitado — sem feedback de validação

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

Na landing page, o prompt input `ref=e23` aceita texto, mas o botão "Enviar" (`ref=e26`) permanece `[disabled]` mesmo após digitar. Não há feedback visual indicando por que o envio está bloqueado — o usuário precisa adivinhar que precisa estar logado ou que o campo tem requisitos não atendidos. Isso causa frustração e abandono no fluxo principal de conversão.

---

### ISSUE-008: Logotipo "Dream Weaver" inconsistente com branding "FORGE"

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | https://dreaming-doing.vercel.app/auth |
| **Repro Video** | N/A |

**Description**

Na página de auth, o header mostra `<Logo> + "Dream Weaver"`. Na landing page, o Nav mostra `<Logo> + "FORGE" + HUD telemetry`. São dois nomes diferentes para o mesmo produto — o usuário pode achar que está em sites diferentes. A página de auth usa `MarketingShell`? Não — a `auth.tsx` tem seu próprio header inline com "Dream Weaver". Isso cria inconsistência visual.

---

### ISSUE-009: Texto "códigoem" sem espaço no heading

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

Heading H2 "Do conceito ao códigoem segundos" — falta espaço entre "código" e "em". Deveria ser "Do conceito ao código em segundos".

---

### ISSUE-010: Non-breaking spaces renderizados como `\u{a0}` no snapshot

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual / ui |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

O heading H1 principal renderiza "C o n s t r u a \u{a0} o \u{a0} i n i m a g i n á v e l ." — os `\u{a0}` são non-breaking spaces (`&nbsp;`) usados para espaçar as letras, mas estão escapados incorretamente no HTML renderizado. O efeito visual pode estar quebrado ou inconsistente entre navegadores.

---

### ISSUE-011: Warning THREE.Clock deprecated no console

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | console |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

`[warning] THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` — aparece em toda página que carrega o componente SpaceScene. O `@react-three/fiber` está usando a API antiga THREE.Clock. Migrar para THREE.Timer elimina o warning.

---

### ISSUE-012: Variáveis de ambiente Supabase ausentes no deploy Vercel

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | console |
| **URL** | https://dreaming-doing.vercel.app |
| **Repro Video** | N/A |

**Description**

As variáveis `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` estão no `.env` local mas não são prefixadas com `VITE_`, portanto não são injetadas pelo Vite no bundle cliente. No servidor (Vercel serverless), o `process.env.SUPABASE_URL` também não existe. Isso causa falhas nas requisições Supabase. Para o deploy Vercel, essas vars precisam ser configuradas no dashboard do projeto.

As vars `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` existem no `.env` e são injetadas corretamente, mas o código no `auth-middleware.ts` (servidor) e `supabase/client.ts` (cliente) pode estar usando as variáveis erradas.

---

## Plano de Ataque

### Fase 1 — Crítico: Fazer o editor renderizar (hoje)

1. **Consertar `MarketingShell.tsx` redirect loop** — Preservar `next` original da URL atual, não sobrescrever com `pathname`. Quando já está em `/auth`, NÃO redirecionar novamente.
2. **Configurar env vars Supabase na Vercel** — Adicionar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` no dashboard Vercel.

### Fase 2 — Alta prioridade: Auth e navegação

3. **Criar fallback OAuth** — Quando `@lovable.dev/cloud-auth-js` não está acessível (Vercel), mostrar mensagem "Login com Google requer Lovable Cloud" ou implementar OAuth direto via Supabase.
4. **Criar páginas para navbar links** ou remover links — Adicionar rotas `/mission`, `/features`, `/docs`, `/pricing` com conteúdo real OU esconder os links da navbar.
5. **Investigar e suprimir erros de rede** — Configurar Supabase client com `realtime: { enabled: false }` quando as env vars de Supabase não estão disponíveis.

### Fase 3 — Média prioridade: UX e interatividade

6. **Implementar modal GitHub Import** no clique do botão da landing page.
7. **Adicionar labels acessíveis** nos inputs de auth com `htmlFor`/`id` explícitos.
8. **Habilitar botão Enviar** com validação e mensagem de erro quando vazio.
9. **Unificar branding** — Usar "FORGE" em todas as páginas, remover "Dream Weaver" ou integrá-lo como subtítulo consistente.

### Fase 4 — Baixa prioridade: Polish

10. **Corrigir typo** "códigoem" → "código em".
11. **Corrigir `\u{a0}`** — Usar `letter-spacing` CSS em vez de `&nbsp;` entre caracteres.
12. **Migrar THREE.Clock → THREE.Timer** no SpaceScene.
13. **Configurar Supabase Realtime** corretamente para ambiente serverless.
