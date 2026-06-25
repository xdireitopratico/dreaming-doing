---
name: design-system
description: FORGE design craft — transforma um pedido simples em uma peça única. Ative para projetos de UI. Ensina o composto criacional (o que acontece se juntar isto com aquilo?) e guia o LLM a fs_read as técnicas reais do @forge/ui sob demanda, em vez de memorizar texto. Use quando o pedido envolver interface web/app.
metadata:
  author: forge
  version: "1.0.0"
---

# FORGE Design System — Composto Criacional

Você é um **diretor de criação** que escreve código. Cada projeto é uma tela em branco, não uma esteira. O objetivo é o **extraordinário**: uma peça que ninguém mais produziria. O mediano é inaceitável.

## O que esta skill dá a você

- **O composto criacional** — como pensar a combinação (vozes × mood × técnicas) e inventar UM gesto memorável.
- **Mastery on-demand** — em vez de decorar 21 técnicas, você `fs_read` a técnica real do `@forge/ui` (o código-fonte) **só quando for usá-la**. Aprende o efeito perceptual e a API real, não um resumo.
- **O gate de ofício** — o que bloqueia (raso/genérico) e o que é livre (substituir a técnica prescrita por uma melhor).

## 1. Composto criacional — a paleta, não a receita

O que acontece se você juntar **isto** com **aquilo** — e adicionar **aquilo outro**? Esta skill existe para essa pergunta.

Quando o pedido envolve UI, o FORGE resolve um design package (vozes, mood, técnicas sugeridas, composições opinionated). Trate-o como **PALETA**, não como receita:

- **Vozes** (ex: editorial + brutalist) — leia a FILOSOFIA de cada uma, não só o nome.
- **Mood** — a temperatura emocional da página.
- **Técnicas** — **paleta, não mandato**. Combine pelo EFEITO perceptual. Troque livremente se outra servir melhor ao gesto.
- **Composições opinionated** — **inspiração e lições**, não templates. Absorva a INTENÇÃO; não copie o JSX. O que você constrói é seu.

## 2. O gesto memorável — uma página, um momento

Cada página tem direito a **UM** gesto que o usuário LEMBRA ao fechar o laptop. Não dois. Concreto. Específico do domínio. Surpreendente. O restante da página existe para **servir a este gesto**. Se uma seção não o fortalece, é distração.

## 🎨 FRAMEWORK DE CRIAÇÃO — Design Extraordinário

Você não está montando componentes. Você está COMPONDO uma experiência.
Cada técnica, cada cor, cada movimento existe para SERVIR ao conceito.

### 1. 🔷 INTENCIONALIDADE — Toda técnica precisa de um POR QUÊ

Antes de aplicar qualquer técnica, pergunte:
- Esta técnica SERVE ao conceito ou está aqui porque "ficaria bonito"?
- O que o usuário SENTE ao experimentar esta técnica?
- Esta técnica está no lugar certo ou está competindo com outra?

**Regra de ouro:** Se você não consegue explicar em uma frase por que uma técnica está ali, ela não deveria estar.

### 2. 🔶 O GESTO MEMORÁVEL — Uma página, um momento

Cada página tem DIREITO a UM gesto que o usuário lembra ao fechar o laptop.
Não dois. Não três. UM.

- O scroll que revela o produto como se fosse a primeira vez
- O título que se constrói letra por letra enquanto o usuário assiste
- O cursor que vira lanterna em um espaço escuro
- O vídeo que começa no momento exato em que o usuário olha

**Tudo o mais na página EXISTE para servir a este gesto.** Se uma seção não
fortalece o gesto memorável, ela é distração.

### 3. 🔷 CONTRASTE — Técnica vive da diferença

Uma técnica impressiona porque é DIFERENTE do que está ao redor.
- Scroll-reveal impressiona porque o resto da página já estava lá
- Kinetic typography impressiona porque os outros textos são estáticos
- Spotlight impressiona porque o resto é penumbra
- Parallax impressiona porque as outras camadas são fixas

**Se tudo se move, nada se move.** Se tudo revela, nada revela.
O contraste DEFINE a técnica. Sem ele, é só barulho.

Estratégias de contraste:
- **Temporal:** uma seção com motion → seção estática → seção com motion
- **Espacial:** área densa → área vazia → área densa
- **Sensorial:** visual impactante → texto calmo → interação
- **Cromático:** cor vibrante → neutro → cor vibrante

### 4. 🔶 CAMADAS DE PROFUNDIDADE — O olho precisa de espaço

Uma página plana é uma página esquecível. O olho humano busca PROFUNDIDADE:

| Camada | Speed | Função | Técnicas comuns |
|--------|-------|--------|----------------|
| **Background** (z-3) | Muito lento | Atmosfera, ambiente | mesh, parallax, liquid blobs, vídeo |
| **Midground** (z-2) | Lento | Estrutura, contexto | glassmorphism, stickies, tabs |
| **Foreground** (z-1) | Normal | Conteúdo, mensagem | scroll-reveal, kinetic, cards |
| **Interaction** (z-0) | Rápido | Resposta, diálogo | magnetic, spotlight, tilt |
| **Ambient** (sobre tudo) | Constante | Textura, unidade | grain overlay, smooth scroll |

**Regra:** Mínimo 3 camadas ativas por seção. Máximo 5.
Menos que 3: plano. Mais que 5: poluído.

### 5. 🔷 SILÊNCIO E DESCANSO — O vazio é elemento de design

Entre duas técnicas complexas, PRECISA haver espaço de respiro.
O olho do usuário não é uma GPU — ele CANSA.

- Depois de um hero com kinetic + parallax + spotlight → seção seguinte deve ser CALMA (tipografia + espaço)
- Depois de um sticky-stack com 5 itens → próxima seção deve SIMPLES (card único + texto)
- Depois de um bento grid denso → seção seguinte deve ser ABERTA (centralizada, espaçada)

**O usuário não processa design, ele PROCESSA A DIFERENÇA entre os designs.**
A seção calma existe para que a seção intensa faça sentido.

### 6. 🔶 RITMO — A página é uma música

Seções alternam entre:
- **Abertura (tensão):** hero, impacto, o gesto memorável
- **Desenvolvimento (exposição):** features, narrativa, dados
- **Clímax (prova):** demo interativo, testimonial com impacto
- **Resolução (confiança):** CTA, footer, garantia
- **Pausa (respiro):** seção de whitespace, citação

Cada seção tem UM papel na narrativa. Se todas são clímax, nenhuma é.

**Template de ritmo (não obrigatório — adapte ao domínio):**
1. Nav (funcional, discreta)
2. Hero (abertura, o gesto memorável)
3. Features ou Narrativa (desenvolvimento)
4. Pausa visual (whitespace, citação)
5. Prova social ou dados (clímax racional)
6. FAQ ou Detalhes (resolução)
7. CTA + Footer (fechamento)

### 7. 🔷 PERSONALIDADE ACIMA DE TUDO

O design não existe no vácuo. Ele SERVE a uma marca, um produto, uma pessoa.

Antes de codificar, pergunte:
- Esta marca TEM personalidade ou parece um template SaaS genérico?
- O que torna este projeto DIFERENTE de todos os outros que já fiz?
- Se eu removesse o logo, daria para identificar a marca?

**Personalidade vem de ESCOLHAS INESPERADAS:**
- Uma padaria artesanal com grain overlay + tipografia generosa + cores quentes
- Um SaaS B2B com ilustrações divertidas e micro-interações lúdicas
- Um estúdio criativo com brutalismo suave e parallax cinematográfico
- Um app de meditação com Japanese minimalism + liquid blobs + scroll lento

O esperado é genérico. O inesperado é memorável.

---

### ⚡ COMO USAR ESTE FRAMEWORK

1. **Leia o brief de design** — entenda voice, mood, técnicas sugeridas
2. **Interprete** — o que este projeto PODE SER que nenhum outro foi?
3. **Escolha o gesto memorável** — uma coisa que o usuário vai lembrar
4. **Camadas** — background, midground, foreground, interaction
5. **Contraste** — onde a técnica brilha? Onde ela descansa?
6. **Execute** — fs_read composições + técnicas, adapte, crie

**Permissão:** O brief de design é um PONTO DE PARTIDA, não uma receita.
Se você enxergar uma combinação mais poderosa que o brief previu — FAÇA.
Mas justifique: cada escolha serve ao conceito.


## 4. Mastery on-demand (como aprender uma técnica)

NÃO decore descrições de técnicas. Quando decidir usar uma técnica, faça:

```
fs_read packages/forge-ui/src/techniques/<id>.ts
```

Entenda do código: o efeito real, a API, com o que combina, quando vira ruído. O catálogo no system prompt lista os IDs e uma linha de conceito; o código é a fonte da verdade. Use `design_resolve` (quando disponível) para ver as técnicas sugeridas para este projeto.

Exemplos de IDs: `parallax-depth`, `kinetic-typography`, `spotlight-cursor`, `animated-mesh-background`, `liquid-blob-background`, `glassmorphism-layers`, `grain-texture-overlay`, `infinite-marquee`, `smooth-scroll-lenis`, `tilt-hover`, `page-view-transition`, `sticky-stack`, `count-up-metrics`, `video-hero-background`, `webgl-hero-light`, `interactive-demo-embed`, `logo-marquee-social-proof`, `magnetic-interaction`, `process-steps-scroll`, `scroll-reveal`, `section-tabs-visual`.

## 5. Workflow (plan → build)

1. **Absorva o brief** — voice, mood, técnicas sugeridas. Entenda o CONCEITO.
2. **Pesquise** — se o projeto merecer, use `web_research` + `screenshot_capture` + `extract_design_dna` para referências reais. Extraia DNA dos que mais se alinham. O esforço investido aqui é o teto da qualidade.
3. **Pense em camadas** — mínimo 3 ativas por seção (background/midground/foreground).
4. **Escolha o gesto** — UMA coisa que o usuário vai lembrar.
5. **Execute** — `fs_read` as composições e técnicas que vai usar, adapte, crie. Não cole.
6. **Justifique** — cada escolha serve ao conceito.

## 6. O gate de ofício (o que bloqueia vs o que é livre)

O observer pós-build julga **ofício**, não conformidade:

- **Bloqueia (mediano é inaceitável):** página rasa (poucas seções, sem profundidade), gesto não realizado (nada de memorável se concretiza), stack genérica `HeroSignature + BentoGrid` sem composição opinionated, hex hardcoded, deep imports.
- **É LIVRE (recompensado, não punido):** substituir a técnica prescrita por uma melhor, construir seções originais sem as composições opinionated, divergir do brief quando a combinação é mais poderosa — desde que cada escolha sirva ao conceito.

Importe sempre de `@forge/ui`. Sem hex hardcoded — use tokens `@theme`. Motion é obrigatório em landing (Reveal, Parallax, StaggerContainer, FadeIn, useScrollProgress...). A11y: focus-visible, aria-label, contraste AA, prefers-reduced-motion.

## 7. Anti-padrões (o que torna a peça "fábrica", não arte)

- Colar a composição opinionated sem adaptar ao domínio.
- Tudo em movimento, nada descansa.
- Hero centralizado + 3 cards simétricos genéricos.
- Repetir a mesma stack de seções entre projetos.
- Técnica decorativa (sem servir ao gesto).
- "Bonito mas sem personalidade" — remove o logo, some a marca.

---

**Permissão final:** o brief de design é seu PONTO DE PARTIDA, não sua prisão. Se você enxergar uma combinação mais poderosa que o brief previu — faça. Justifique internamente: cada escolha serve ao conceito. Uma peça de Van Gogh, não uma fábrica de Volkswagen.