## Posicionamento (a base de tudo)

Antes de desenhar, defino o **porquê** do produto. Tudo na landing serve esta tese:

> **Dream Weaver** é um construtor de software por IA **soberano**: você é dono do código, do banco e da infra. Conecta seu Supabase, seu GitHub, sua chave de IA — e mantém o controle total. Tudo o que o agente faz é transparente: cada chamada de ferramenta, cada arquivo, cada custo, em tempo real.

Quatro pilares (também a espinha da página):

1. **Soberania** — seu Supabase, sua chave de IA, seu GitHub. Sem vendor lock-in. Exporte e suma a hora que quiser.
2. **Transparência radical** — o agente é uma caixa de vidro: stream de tool-calls, diffs, custo por mensagem, log auditável.
3. **MCP-nativo** — qualquer ferramenta do ecossistema MCP plugada em minutos. Sua stack, suas regras.
4. **Português de verdade** — UX, prompts do agente e documentação pensados em PT-BR como primeira língua, não traduzidos.

Esses são os **diferenciais reais frente ao Lovable**, e cada um vira uma seção da página com demonstração visual, não claim solto.

---

## Estrutura da landing (storytelling em 9 atos)

Mistura o **storytelling problema→solução** do Rig.ai, a **interatividade e portfólio** do Pixila, e o **prompt protagonista** do Lovable. Tudo em um único scroll vertical com motion ancorando cada transição.

```text
[01] Top nav fina (logo · Entrar · Começar)
[02] HERO — manifesto + prompt protagonista + marquee de stack
[03] O PROBLEMA — "Você não é dono do seu builder de IA" (3 cards Rig-style)
[04] A RESPOSTA — pilares em diagrama animado (Soberania · Transparência · MCP · PT-BR)
[05] DEMO VIVA — mini-editor estático tocando uma timeline de tool-calls reais
[06] FEITO COM — galeria 6 projetos (Pixila-style com hover) que o próprio Dream Weaver gerou
[07] COMO FUNCIONA — 3 passos (Descreva · Veja construir · Publique no seu domínio)
[08] PROVA / NÚMEROS — marquee de logos de stack + métricas honestas
[09] FAQ — perguntas reais (sou dono do código? minha chave fica onde? quanto custa?)
[10] CTA FINAL + footer mínimo
```

Cada ato a seguir com layout, conteúdo e motion concretos.

---

### [01] Top nav

- 56px, sticky, vidro com backdrop-blur sobre o fundo.
- Esquerda: marca-d'água `Dream Weaver` em serif + chip pequeno `beta`.
- Direita: link sutil `Manifesto` (ancora #problema), `Entrar` (ghost), `Começar` (CTA dourado).
- Em scroll > 100px, ganha hairline border e densidade aumenta.

Nada de "Templates / Preços / Docs" agora — não existem ainda. Zero placeholder.

### [02] HERO — manifesto + prompt

```text
                        ┌─ chip ─┐
                        │ Beta privada · convide-se │
                        └────────┘

           Construa software como
           você  pensa.  Sem  pedir
           licença  pra  ninguém.

      O primeiro construtor por IA em que o código,
      o banco e a infra continuam seus desde o
      primeiro prompt.

      ┌────────────────────────────────────────────┐
      │  Descreva o que você quer construir…       │
      │                                            │
      │  [+]                       [Modelo ▾]  ↑   │
      └────────────────────────────────────────────┘
        ⌘+Enter para enviar · sem cadastro pra testar

      ┌─ marquee infinita, lenta ────────────────────┐
        Supabase · TanStack · React 19 · WebContainers · 
        Google Gemini · MCP · GitHub · Cloudflare · Vite
      └─────────────────────────────────────────────┘
```

- Headline em `Instrument Serif`, 64–84px, com **"pensa"** em itálico e **"licença"** com underline manuscrito animado (SVG path).
- Glow radial dourado discreto atrás do prompt, pulsa devagar.
- Prompt box é o componente protagonista — mesmo lugar central da Lovable.
- Marquee monoespaçada embaixo, opacity 60%, pisca sutilmente.
- **Não logado:** clicar `↑` armazena o prompt em `localStorage` e abre `/auth?next=/&prompt=…`. Após login, a Home retoma e cria o projeto.

### [03] O problema — "Você não é dono do seu builder"

Estrutura tipo Rig (3 cards numerados, copy direta, ícone monoline a cada um):

| 001 | **Seu código mora num inquilino** | "Se eles fecham, sumem com seu app. Se mudam o preço, você paga. Se mudam o modelo, sua build quebra." |
| 002 | **Sua chave é deles** | "Você não vê o que o agente faz, não vê quanto custa, não tem como auditar." |
| 003 | **Você está preso ao stack deles** | "Sem MCP. Sem seu Supabase. Sem suas ferramentas. Só o que eles permitirem." |

Background da seção vira sutilmente mais escuro, com hairlines verticais que respiram com scroll (motion `useScroll`).

### [04] A resposta — os 4 pilares

Diagrama central animado: um quadrado com 4 nós que se acendem em sequência quando entra no viewport. Em cada nó, ao hover, o card lateral muda mostrando a explicação. Inspirado no diagrama "Your machine, your code" do Rig.

- **Soberania** — "Conecte seu Supabase em 30s. Sua chave de IA. Seu GitHub. Você é dono." Mini-screenshot do `/connectors`.
- **Transparência radical** — "Cada tool-call streamado em tempo real. Cada token contado. Cada arquivo diffado." Mini-screenshot do chat com tool-calls expostos.
- **MCP-nativo** — "Plugue qualquer servidor MCP. Da Notion ao seu CRM interno." Lista de logos MCP.
- **Português de verdade** — "Agente, prompts e documentação pensados em PT-BR. Sem tradução automática esquisita." Trecho real de output do agente em PT.

### [05] Demo viva — o editor em mini

Um componente **não interativo, mas animado em loop** mostrando o editor real (mesma chrome do `/projects/$projectId`): chat à esquerda recebendo uma mensagem, o agente respondendo com tool-calls em stream (`write_file: index.html`, `write_file: app.tsx`, etc.), file tree aparecendo arquivos, preview à direita renderizando uma página. Loop de 12s, pausa em hover.

Mostra **o produto em funcionamento**, não um screenshot estático. É o "Watch it come to life" da Lovable, mas mais honesto.

### [06] Feito com Dream Weaver — galeria

Inspirado no portfólio Pixila. Grid 3×2 de cards reais (mesmo que mockados nesta fase — declaramos no plano que são exemplos curados pela equipe). Cada card:

- Thumbnail `aspect-video`, borda sutil.
- Hover: leve scale + overlay com nome do projeto e stack ("Next-style portfolio · Supabase · 3h de prompt").
- Clique: link `/showcase/{slug}` (rota stub neste turno, só conteúdo dummy).

6 exemplos iniciais que cobrem casos diferentes:
1. **Portfólio fotógrafo** — site estático
2. **CRM interno** — app SaaS com auth
3. **Loja de pão artesanal** — e-commerce simples
4. **Dashboard financeiro** — gráficos + Supabase
5. **Blog editorial** — markdown + RLS
6. **Apresentador de slides** — clone do Lovable Slides

Imagens via `imagegen` em standard quality, 16:9, paleta consistente.

### [07] Como funciona — 3 passos

Pixila tem um bloco "3 expertises". Aqui são 3 passos do fluxo, cada um com um ícone simbólico de montanha/cordilheira (sem importar identidade visual do Pixila, mas captura a metáfora "ascensão"):

1. **Descreva** — uma frase. Em português. O agente entende.
2. **Veja construir** — cada arquivo, cada decisão, em stream. Você intervém quando quiser.
3. **Publique** — no seu domínio, no seu GitHub, no seu Cloudflare. Saímos do caminho.

### [08] Prova / números

Honestidade sobre o estágio do produto:

- **Beta privada** · **N convites/semana** · **MIT license no agente**.
- Marquee horizontal com **logos das peças que carregamos** (Supabase, Cloudflare, React, Tailwind, MCP, Anthropic/Google/OpenAI, GitHub).
- Bloco "Compatível com o ecossistema MCP" — lista textual dos servers oficiais suportados.

Nada de "1M projects built" sem ser verdade.

### [09] FAQ

Accordion shadcn, 6 perguntas reais:

1. Sou dono do código?
2. Onde fica minha chave de IA?
3. Meu banco fica onde?
4. Como exporto pro GitHub?
5. O que é MCP e por que importa?
6. Quanto custa?

Respostas honestas, 2–4 linhas, sem marketês.

### [10] CTA final + footer

Mesmo prompt do hero, repetido. Headline curta: "Pare de pedir licença pra construir." Botão único: `Começar agora`.

Footer mínimo, uma única linha: marca · GitHub do projeto · status · contato.

---

## Design system (refeito do zero, não adaptado)

### Paleta — dark editorial, não preto puro

Tokens em `src/styles.css`, todos em `oklch`. Light mode espelho.

```css
.dark {
  --background:        oklch(0.155 0.005 285);   /* carvão grafite */
  --background-elev:   oklch(0.195 0.005 285);   /* superfícies elevadas */
  --surface:           oklch(0.225 0.006 285);   /* cards */
  --foreground:        oklch(0.965 0.004 285);
  --muted-foreground:  oklch(0.66 0.012 285);
  --border:            oklch(1 0 0 / 0.08);
  --border-strong:     oklch(1 0 0 / 0.16);

  --primary:           oklch(0.78 0.13 78);      /* dourado quente — assinatura */
  --primary-foreground:oklch(0.18 0.02 78);
  --accent:            oklch(0.72 0.17 295);     /* violeta — só no logotipo + halo */
  --ring:              oklch(0.78 0.13 78 / 0.35);

  --gradient-hero:     radial-gradient(60% 50% at 50% 32%,
                          oklch(0.78 0.13 78 / 0.18), transparent 70%);
  --shadow-soft:       0 1px 0 0 oklch(1 0 0 / 0.04) inset,
                       0 30px 60px -30px oklch(0 0 0 / 0.55);
  --radius:            14px;
}
```

Light mode segue a mesma estrutura semântica. Toggle persistido em `localStorage` via `ThemeProvider`.

### Tipografia

- **Display**: `Instrument Serif` (h1, citações). Itálico no destaque ("pensa", "soberano").
- **Body/UI**: `Inter`.
- **Mono**: `JetBrains Mono` (chips `⌘+Enter`, tool-calls da demo, marquee de stack).
- Carregadas via `<link>` no `__root.tsx` head, com `display=swap`.

### Textura

- SVG noise inline aplicado em `body::before` com `opacity: 0.04`, `mix-blend-mode: overlay`. Dá grão Pixila sem custo de imagem.
- Hairlines verticais (`oklch(1 0 0 / 0.04)`) num container `1120px` que aparecem em seções selecionadas — assinatura visual recorrente.

### Motion

Instalar `motion` (sucessor de framer-motion). Padrões:

- **Headline hero**: stagger por palavra, `y: 12 → 0`, `opacity: 0 → 1`, ease `[0.22, 1, 0.36, 1]`, duração 0.7s.
- **Prompt box**: entra com `scale: 0.98 → 1`, delay após headline.
- **Glow hero**: `animate` infinito de `opacity` 0.6 ↔ 1 em 8s.
- **Marquees** (stack, depoimentos): translação CSS infinita, pausa em hover.
- **Seções no scroll**: `whileInView` com `once: true`, threshold 30%.
- **Diagrama dos 4 pilares**: nó acende com `pathLength` em SVG.
- **Cards do portfólio**: hover `scale: 1.02`, sombra ganha intensidade, overlay fade-in.

Tudo respeita `prefers-reduced-motion`.

---

## Arquitetura de shells (a correção estrutural)

```text
__root.tsx                 → sem shell global, só Theme + Auth + Toaster

/  (index)                 → MarketingShell  (PÚBLICO)
/auth                      → AuthShell       (centered, sem nav)
/projects                  → MarketingShell  (requer auth)
/connectors                → MarketingShell  (requer auth)
/settings                  → MarketingShell  (requer auth)
/projects/$projectId       → EditorShell     (sidebar colapsável EXCLUSIVA aqui)
```

- `AppShell.tsx` (sidebar lateral fixa) é **deletado**.
- `MarketingShell.tsx` novo — só top nav + footer.
- `EditorShell.tsx` novo — chrome atual do editor extraída.
- `RequireAuth` continua, aplicado apenas onde precisa.

---

## Comportamento do prompt para não-logados

Crítico: o prompt funciona para visitantes anônimos sem cadastro forçado.

1. Visitante digita prompt e clica `↑`.
2. Salvamos `prompt` em `localStorage`.
3. Redirecionamos para `/auth?next=/`.
4. Após login bem-sucedido, `/` lê o prompt do `localStorage`, cria o projeto, navega ao editor, limpa o storage.

Isso é o "test drive" — o que falta no Lovable: poder digitar a frase antes de criar conta.

---

## Arquivos deste turno

**Criados:**
- `src/components/MarketingShell.tsx` — top nav + footer.
- `src/components/EditorShell.tsx` — extrai chrome do `/projects/$projectId`.
- `src/components/ThemeToggle.tsx` + `src/lib/theme.tsx` — provider de tema.
- `src/components/landing/Hero.tsx`
- `src/components/landing/StackMarquee.tsx`
- `src/components/landing/ProblemCards.tsx`
- `src/components/landing/PillarsDiagram.tsx`
- `src/components/landing/LiveEditorDemo.tsx`
- `src/components/landing/PortfolioGrid.tsx`
- `src/components/landing/HowItWorks.tsx`
- `src/components/landing/Numbers.tsx`
- `src/components/landing/FAQ.tsx`
- `src/components/landing/FinalCTA.tsx`
- `src/components/landing/Noise.tsx` (SVG grão)
- `src/assets/showcase/*.jpg` — 6 thumbnails do portfólio via imagegen.

**Editados:**
- `src/styles.css` — tokens, fontes, grão, gradientes, hairlines.
- `src/routes/__root.tsx` — fontes no head, ThemeProvider, sem shell global.
- `src/routes/index.tsx` — landing pública composta das seções acima.
- `src/routes/auth.tsx` — sem AppShell, lê `?next=` e prompt do localStorage.
- `src/routes/projects/index.tsx` · `connectors.tsx` · `settings.tsx` — usam `MarketingShell` com `requireAuth`.
- `src/routes/projects/$projectId.tsx` — usa `EditorShell`.

**Deletado:**
- `src/components/AppShell.tsx`.

**Dependência:**
- `bun add motion`.

Nada de mudar backend, agent, schema, edge function neste turno.

---

## Critérios de aceitação

1. Visitante anônimo abre `/` e vê a landing inteira. Sem sidebar. Sem gate.
2. Prompt funciona para anônimo: armazena, manda pro auth, retoma.
3. Cada seção tem **conteúdo real** alinhado com os 4 pilares — nenhuma frase placeholder genérica.
4. Estética claramente Pixila-grade: dark suave, dourado, serif no display, grão, marquees, motion no scroll.
5. Sidebar aparece **apenas** em `/projects/$projectId`.
6. Toggle de tema funciona e persiste em todas as rotas.
7. `prefers-reduced-motion` respeitado: motion para em zero.
8. Build TanStack passa, viewport mobile (375px) decente.

Se aprovar este plano, executo em build pass único.