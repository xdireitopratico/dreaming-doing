
# Plano — Home "Intergaláctica" (Dark + Motion + Disney Magic)

Objetivo: transformar a Home numa vitrine cinematográfica que comunique soberania, magia e competência técnica. Sem flat, sem medo, sem genérico. O motor de prompt é o herói. Conectores educam, não assustam.

## 1. Design System — Dark Cinematográfico

**Paleta (substitui o dourado quente atual):**
- `--background`: `oklch(0.08 0.005 270)` — preto profundo, azulado sutil (céu noturno)
- `--surface`: `oklch(0.12 0.006 270)` / `--surface-elev`: `oklch(0.16 0.008 270)`
- `--foreground`: `oklch(0.98 0.003 270)` — branco quase puro
- `--silver`: `oklch(0.78 0.01 270)` — prata para detalhes, ícones, hairlines
- `--primary`: `oklch(0.92 0.005 270)` — branco/prata como ação principal (Apple-like)
- `--accent-sun`: `oklch(0.85 0.16 85)` — amarelo-sol APENAS em contraste pontual (highlight, brilho, faísca de estrela)
- `--accent-aurora`: `oklch(0.7 0.18 230)` — azul-aurora pra gradientes de fundo
- Gradientes: `--gradient-cosmos` (radial multi-stop preto→roxo profundo→azul-aurora), `--gradient-starlight` (linha de luz que cruza), `--gradient-sun-flare` (pontual)

**Tipografia:**
- Display: `Instrument Serif` (mantém) com peso visual maior + `letter-spacing` apertado
- Sans: `Inter Tight` (mais condensado, vibe tech)
- Mono: `JetBrains Mono`
- Tamanho hero: clamp(64px, 9vw, 140px)

**Texturas/superfícies:**
- Grão SVG (mantém, mais sutil — opacity 0.03)
- Vignette radial no body
- Hairlines verticais visíveis em seções estruturais
- `backdrop-filter: blur(20px)` em cards flutuantes (glass)

## 2. Motion & Parallax (a alma do projeto)

Bibliotecas: `motion` (já instalado) + `lenis` (smooth scroll) — adicionar `lenis`.

**Camadas de movimento na Home:**

```text
┌─ Camada 0: Canvas cósmico (fixed, behind)
│   └─ partículas de estrela (canvas 2D, ~200 pontos, drift lento)
├─ Camada 1: Aurora gradient (parallax 0.2x)
├─ Camada 2: Conteúdo (scroll normal)
├─ Camada 3: Hairlines + grão (fixed overlay)
└─ Camada 4: Cursor glow (radial gradient seguindo o mouse)
```

**Efeitos por seção:**
- **Hero**: título entra letra-a-letra (split text + stagger), prompt box "respira" (scale 1↔1.005, 4s loop), faísca dourada que cruza o input no hover, estrelas caem ao focar
- **Manifesto**: texto longo com `scroll-linked opacity` + palavras-chave em prata sublinhadas com SVG path drawing on view
- **Pillars**: cards 3D com `transform-style: preserve-3d` + tilt no mouse (vanilla, sem lib pesada)
- **Live Editor Demo**: mockup do editor com parallax interno (chat à esquerda desliza mais lento que preview à direita)
- **Connectors Path**: trilha animada SVG (linha que se desenha conforme scrolla) ligando Supabase → GitHub → LLM → Deploy, cada nó com ícone do serviço real
- **Portfolio Grid**: masonry com `whileInView` stagger + hover que revela metadados em prata
- **Footer**: estrelas se condensam num único brilho dourado (último frame "Disney")

**Reduced motion:** todas as animações respeitam `prefers-reduced-motion`.

## 3. Copy — De Medo para Acolhimento

Reescrever as 6 seções abandonando o tom defensivo ("sem permissão", "sua infra, sem ninguém"). Trocar por convite e maravilhamento.

| Seção | Antes (medo) | Depois (acolhimento) |
|---|---|---|
| Hero H1 | "Construa algo extraordinário" | "Sonhe. Descreva. Veja acontecer." |
| Subhead | "Sem amarras, sem permissão" | "Um estúdio de software que cabe num prompt — e que continua seu pra sempre." |
| Pilar 1 | "Soberania — sem permissão" | "Seu. Desde o primeiro caractere até o deploy." |
| Pilar 2 | "Caixa de vidro" | "Transparência total: você vê cada passo, cada custo, cada arquivo." |
| Pilar 3 | "MCP-nativo" | "Conecte tudo que você já ama: Supabase, GitHub, Anthropic, Groq, n8n." |
| CTA principal | "Construir" | "Começar a criar" |

Tom de referência: Disney + Apple ("Hello again"). Frases curtas, sensoriais, otimistas. Zero FUD.

## 4. Motor de Prompt como Protagonista

Hero box redesenhada:
- Centralizada, ocupando ~65% da largura no desktop
- Borda em gradiente animado (conic, rota 8s) quando focada
- Placeholder rotativo (typewriter): "um portfólio fotográfico minimalista...", "um CRM com Supabase...", "um painel financeiro pessoal..."
- Chips abaixo com 4 sugestões clicáveis que preenchem o prompt
- Botão "Começar a criar" com micro-anim de faísca dourada
- Logado: cria projeto direto. Anônimo: salva em `localStorage` (já implementado) e leva pra `/auth`.

## 5. Trilha de Conectores Educativa (nova seção)

Substitui a defesa de "MCP" por uma trilha visual que ensina o usuário a se conectar:

```text
[Supabase] ──── [GitHub] ──── [LLM (Anthropic/Groq/OpenAI)] ──── [Deploy (Vercel/Cloudflare)]
   │              │                       │                              │
   │              │                       │                              │
"Como criar"   "Como criar"        "Onde tirar a chave"          "Como conectar"
   │              │                       │                              │
   └─ modal       └─ modal                └─ modal                       └─ modal
      passo-a-       passo-a-                passo-a-                       passo-a-
      passo          passo                   passo                          passo
```

Cada nó é um botão que abre um modal/drawer com instruções ilustradas. Estética n8n (nós conectados) com SVG path animado.

## 6. Estrutura da Home (ordem final)

1. Hero cósmico + prompt box
2. Manifesto curto (3 linhas, scroll-linked)
3. Live editor demo (parallax interno)
4. Pilares (3D tilt cards)
5. Trilha de conectores (educativa)
6. Portfolio grid (showcase de projetos gerados)
7. Pricing teaser (assinatura mínima + você gerencia seus créditos)
8. FAQ
9. Footer com "fade to starlight"

## 7. Entregáveis técnicos

**Arquivos novos:**
- `src/components/cosmos/StarField.tsx` — canvas de estrelas
- `src/components/cosmos/AuroraBackdrop.tsx` — gradiente parallax
- `src/components/cosmos/CursorGlow.tsx` — glow seguindo mouse
- `src/components/landing/HeroPromptBox.tsx` — extraído, com placeholder rotativo + chips
- `src/components/landing/Manifesto.tsx`
- `src/components/landing/ConnectorsPath.tsx` — trilha SVG animada
- `src/components/landing/PricingTeaser.tsx`
- `src/lib/smooth-scroll.tsx` — provider Lenis
- `src/lib/split-text.ts` — utilitário de letra-a-letra

**Arquivos editados:**
- `src/styles.css` — paleta cósmica, gradientes, vignette, fontes Inter Tight
- `src/routes/__root.tsx` — adicionar Inter Tight, Lenis provider
- `src/routes/index.tsx` — nova composição
- `src/components/landing/PillarsDiagram.tsx` — 3D tilt + copy nova
- `src/components/landing/LiveEditorDemo.tsx` — parallax interno
- `src/components/landing/PortfolioGrid.tsx` — stagger refinado
- `src/components/landing/FAQ.tsx` — copy nova

**Dependências a instalar:** `lenis`.

**Não escopo deste plano:** redesenhar o editor (`/projects/$projectId`) — fica pra próxima rodada como o usuário pediu. Backend/agente também intactos.

## 8. Critério de aceite

- Home dá sensação de "uau, isso não é mais um site flat de IA"
- 60fps em scroll num MacBook médio
- Mobile (384px) mantém a essência sem parallax pesado (degrada graciosamente)
- Copy em PT-BR, acolhedora, zero fear-mongering
- Trilha de conectores é a primeira coisa que o usuário entende após o prompt
- Dark é a única identidade (light mode segue como espelho, sem prioridade)

Aprova pra eu implementar tudo numa rodada?
