// techniques-mastery.ts — Conhecimento perceptual profundo de cada técnica.
// Não é um catálogo (isso é o manifest). É um ENSINO: o que cada técnica
// FAZ com o usuário, que emoção ela cria, com o que combina e quando vira ruído.
// O LLM lê isso para PENSAR design, não só para importar componentes.

export interface TechniqueMastery {
  id: string;
  /** O que o usuário SENTE ao experimentar esta técnica (não o que ela faz). */
  perceptual_effect: string;
  /** Tom emocional que esta técnica carrega. */
  emotional_quality: string;
  /** Combinações criativas com REASONING — não só lista, mas POR QUE. */
  creative_combinations: Array<{
    with: string;
    reasoning: string;
    result_quality: string;
  }>;
  /** Quando esta técnica vira ruído — o anti-padrão criativo. */
  noise_signals: string[];
  /** Como esta técnica se posiciona na hierarquia visual do usuário. */
  sensory_hierarchy: "foreground" | "midground" | "background" | "interaction" | "ambient";
  /** Domínio sensorial principal que esta técnica ativa. */
  sensory_domain: "visual" | "tactile" | "temporal" | "spatial" | "kinetic" | "ambient";
  /** Metáfora — uma imagem mental para o LLM entender a técnica. */
  metaphor: string;
}

export const TECHNIQUE_MASTERY: Record<string, TechniqueMastery> = {
  "scroll-reveal": {
    id: "scroll-reveal",
    perceptual_effect: "O conteúdo parece surgir do nada — cada seção é uma DESCOBERTA. O usuário sente que está revelando o conteúdo com seu próprio movimento, não apenas lendo.",
    emotional_quality: "Antecipação + recompensa. O scroll vira um ato de descoberta, não de consumo.",
    creative_combinations: [
      { with: "sticky-stack", reasoning: "Scroll-reveal no conteúdo que entra + sticky-stack no título que fica = narrativa que se constrói enquanto a âncora conceitual permanece.", result_quality: "Artigo interativo premium — sensação de revista digital viva." },
      { with: "parallax-depth", reasoning: "Reveal da camada da frente + parallax no fundo = profundidade temporal: coisas distantes já estavam lá, coisas próximas acabaram de chegar.", result_quality: "Imersão cinematográfica — cada seção é uma cena." },
      { with: "grain-texture-overlay", reasoning: "O grain é constante (textura do papel), o reveal é variável (conteúdo surgindo). A textura ancora o real enquanto o reveal surpreende.", result_quality: "Artesanal + digital — a alma do material com a precisão do código." },
    ],
    noise_signals: [
      "Revelar TUDO — se toda seção tem scroll-reveal, nenhuma seção é especial. Use em 40-60% das seções.",
      "Delay muito alto (>0.4s) entre itens do mesmo grid — o usuário espera, não descobre.",
      "Scroll-reveal em seções acima da dobra — o que já está visível não precisa ser revelado.",
    ],
    sensory_hierarchy: "foreground",
    sensory_domain: "temporal",
    metaphor: "Um curador de galeria que acende as luzes de cada sala conforme você caminha — nunca todas de uma vez, sempre na hora certa.",
  },
  "sticky-stack": {
    id: "sticky-stack",
    perceptual_effect: "Uma âncora visual permanece enquanto o conteúdo ao redor se transforma. O usuário tem um ponto de referência estável em meio à mudança.",
    emotional_quality: "Controle + orientação. O usuário nunca se perde — sabe onde está porque algo fica.",
    creative_combinations: [
      { with: "parallax-depth", reasoning: "Sticky (âncora fixa) + parallax (fundo em movimento) = três camadas de atenção: o que fica, o que passa, o que respira atrás.", result_quality: "Profundidade narrativa — o usuário sente o espaço tridimensional da informação." },
      { with: "count-up-metrics", reasoning: "Números que contam enquanto o sticky segura o contexto. O usuário vê a transformação sem perder a referência.", result_quality: "Storytelling de dados — o número muda, a verdade permanece." },
      { with: "section-tabs-visual", reasoning: "Sticky como navegação vertical + tabs como navegação horizontal = grid bidimensional de descoberta.", result_quality: "Exploração tipo museu — o usuário escolhe o que ver." },
    ],
    noise_signals: [
      "Sticky em mais de uma seção consecutiva — o usuário se perde entre âncoras concorrentes.",
      "Sticky sem parallax ou motion no fundo — parece bug, não técnica. Sticky PRECISA de movimento ao redor.",
      "Mobile com sticky ocupando >40% da altura — o conteúdo útil some.",
    ],
    sensory_hierarchy: "midground",
    sensory_domain: "spatial",
    metaphor: "Um farol. O navio (conteúdo) se move, a costa muda, mas o farol está sempre no mesmo lugar. O usuário navega sem medo de se perder.",
  },
  "parallax-depth": {
    id: "parallax-depth",
    perceptual_effect: "O mundo tem profundidade. Camadas distantes se movem mais devagar — como olhar pela janela de um trem em movimento. O usuário sente o espaço.",
    emotional_quality: "Imersão + contemplação. Não é ação, é presença. O usuário HABITA o espaço.",
    creative_combinations: [
      { with: "animated-mesh-background", reasoning: "Mesh animado na camada mais distante (speed 0.1-0.2) + elementos na camada média (0.3-0.5) + conteúdo fixo na frente = o fundo respira enquanto o conteúdo é estável.", result_quality: "Vivência cinematográfica — a página respira como um ser vivo." },
      { with: "spotlight-cursor", reasoning: "Parallax no fundo cria profundidade espacial; spotlight do cursor adiciona profundidade ATENCIONAL. O usuário sente que pode TOCAR o espaço.", result_quality: "Experiência imersiva interativa — o olho e a mão exploram juntos." },
      { with: "smooth-scroll-lenis", reasoning: "Lenis suaviza o scroll (inércia), parallax responde ao scroll — juntos criam a FÍSICA do espaço. O scroll vira um movimento através de um meio denso.", result_quality: "Museu digital — cada movimento é deliberado, cada transição é suave." },
    ],
    noise_signals: [
      "Mais de 4 camadas parallax — em mobile vira lag, em desktop vira confusão visual.",
      "Velocidades muito próximas (0.3 e 0.35) — o olho não diferencia, parece bug.",
      "Parallax em cards de grid — cada card se movendo diferente desorienta. Parallax é para fundo e camadas amplas, não para micro-elementos.",
      "Sem fallback para prefers-reduced-motion — o usuário com sensibilidade vestibular sofre.",
    ],
    sensory_hierarchy: "background",
    sensory_domain: "spatial",
    metaphor: "Uma maquete tridimensional em vidro. Cada camada é uma folha de vidro com desenhos em distâncias diferentes. O usuário anda ao redor e vê o mundo se rearranjar.",
  },
  "magnetic-interaction": {
    id: "magnetic-interaction",
    perceptual_effect: "O elemento RESPONDE ao cursor como se fosse imantado. Antes do clique, já há diálogo. O usuário sente que a interface está VIVA.",
    emotional_quality: "Prazer tátil + agência. O usuário sente que está tocando algo real, não apenas clicando em pixels.",
    creative_combinations: [
      { with: "spotlight-cursor", reasoning: "Magnetic atrai o cursor (movimento físico) + spotlight ilumina onde o cursor está (movimento visual) = o cursor vira uma ferramenta de escultura digital.", result_quality: "Interface viva — cada movimento do mouse esculpe a luz e a posição." },
      { with: "tilt-hover", reasoning: "Magnetic no cursor + tilt no card = simbiose: o cursor puxa, o card inclina. Parece que o card está flutuando em óleo.", result_quality: "Materialidade digital — parece touch antes do toque." },
      { with: "kinetic-typography", reasoning: "Letras que se aproximam magneticamente quando o mouse passa — tipografia que reage à presença do usuário.", result_quality: "Tipografia viva — o texto não está impresso, está respirando." },
    ],
    noise_signals: [
      "Magnetic em EVERYTHING — se todo botão magnetiza, nada é especial. Use em CTAs primários e elementos-chave apenas.",
      "Força magnética >30px — o elemento parece fugir, não atrair.",
      "Magnetic + tilt no mesmo elemento com spring pesado — parece desgovernado, não fluido.",
    ],
    sensory_hierarchy: "interaction",
    sensory_domain: "tactile",
    metaphor: "Um ímã fraco sobre uma mesa de ferro. Você sente a resistência antes do contato — o objeto já está conversando com sua mão antes de você tocá-lo.",
  },
  "kinetic-typography": {
    id: "kinetic-typography",
    perceptual_effect: "As palavras GANHAM VIDA. Não são caracteres impressos — são entidades que chegam, se revelam, dançam. O usuário LÊ com os olhos e com o tempo.",
    emotional_quality: "Maravilha + surpresa. O texto deixa de ser informação e vira EVENTO.",
    creative_combinations: [
      { with: "scroll-reveal", reasoning: "Kinetic no hero (entrada automática) + scroll-reveal no resto (entrada por scroll) = hierarquia de atenção: o hero é espetáculo, o resto é descoberta.", result_quality: "Narrativa rítmica — o usuário sabe que o hero é especial porque chega diferente." },
      { with: "grain-texture-overlay", reasoning: "Kinetic revela as letras + grain texturiza a superfície = letras que parecem EMERGIR do papel, não flutuar no vácuo digital.", result_quality: "Tipografia artesanal — parece impressa, mas se move." },
      { with: "animated-mesh-background", reasoning: "Mesh no fundo (orgânico, fluido) + kinetic no texto (estruturado, coreografado) = contraste entre o caos do fundo e a precisão da tipografia.", result_quality: "Composição dramática — ordem versus entropia." },
    ],
    noise_signals: [
      "Kinetic em parágrafos inteiros — cansa. Uma ou duas palavras-chave, no máximo uma linha.",
      "Todas as letras revelando ao mesmo tempo — perde o escalonamento que dá o ritmo.",
      "Kinetic + parallax no mesmo elemento — o olho não sabe se deve acompanhar o movimento ou a revelação.",
      "Duration >1.5s por palavra — o usuário espera, não assiste.",
    ],
    sensory_hierarchy: "foreground",
    sensory_domain: "temporal",
    metaphor: "Um coreógrafo de tipografia. As letras não estão escritas — estão ensaiando uma dança. Cada palavra tem seu momento de entrar em cena.",
  },
  "spotlight-cursor": {
    id: "spotlight-cursor",
    perceptual_effect: "O cursor vira uma LANTERNA em um ambiente escuro. O que ele toca se ilumina; o resto permanece na penumbra. O usuário EXPLORA com o olhar.",
    emotional_quality: "Descoberta + intimidade. O usuário se sente em um espaço só seu — a interface responde à sua presença individual.",
    creative_combinations: [
      { with: "animated-mesh-background", reasoning: "Mesh se move no fundo (vida própria) + spotlight revela partes dele (vida compartilhada) = o fundo existe independente do usuário, mas o usuário o DESCOBRE.", result_quality: "Mundo vivo que reage à presença — como entrar em uma sala iluminada." },
      { with: "magnetic-interaction", reasoning: "Spotlight onde o cursor está + magnetic onde o cursor pode ir = a interface inteira vira um campo de forças visuais.", result_quality: "Experiência háptica sem toque — o olho guia a mão." },
      { with: "glassmorphism-layers", reasoning: "Spotlight através do glass = o vidro não é opaco, ele TRANSMITE a luz do cursor. O glass ganha profundidade porque a luz o atravessa.", result_quality: "Vidro vivo — não é um elemento plano, é uma lente." },
    ],
    noise_signals: [
      "Spotlight radius >500px — vira gradiente genérico, perde a sensação de lanterna.",
      "Spotlight em página com muito texto — o usuário precisa ler, não explorar.",
      "Sem fallback para touch — em mobile não tem cursor, o spotlight some e a página fica escura.",
      "Spotlight a 100% de opacidade no centro — queima a imagem. Use 20-40% no centro decayendo para 0%. ",
    ],
    sensory_hierarchy: "interaction",
    sensory_domain: "visual",
    metaphor: "Uma lanterna em uma galeria escura. Você só vê o que ilumina — e cada descoberta é pessoal, porque foi você quem escolheu onde olhar.",
  },
  "tilt-hover": {
    id: "tilt-hover",
    perceptual_effect: "O card INCLINA em 3D seguindo o cursor. O plano vira volume. O usuário sente que pode ver o objeto de diferentes ângulos.",
    emotional_quality: "Tangibilidade + ludicidade. O digital vira físico — algo que se pode segurar e virar.",
    creative_combinations: [
      { with: "magnetic-interaction", reasoning: "Tilt inclina o card (profundidade espacial) + magnetic atrai o cursor (profundidade física) = o card parece flutuar e se oferecer ao toque.", result_quality: "Objeto digital escultórico — parece que dá para pegar." },
      { with: "glassmorphism-layers", reasoning: "Tilt em glass = o vidro REFLETE a luz de forma diferente conforme inclina. O glass ganha índice de refração variável.", result_quality: "Vidro verdadeiro — como um prisma que muda com o ângulo." },
      { with: "spotlight-cursor", reasoning: "Tilt inclina + spotlight ilumina onde o cursor toca = profundidade ESPACIAL + profundidade LUMINOSA. O objeto existe no espaço E na luz.", result_quality: "Objeto de museu iluminado por holofote móvel." },
    ],
    noise_signals: [
      "Tilt em todos os cards de um grid de 12 — parece efeito de PowerPoint. Máximo 3-4 cards por grid.",
      "Perspective muito agressiva (>15deg) — o conteúdo fica ilegível.",
      "Tilt sem will-change: transform — o browser não otimiza e o movimento fica travado.",
      "Tilt em elementos que já têm hover state — os dois estilos competem.",
    ],
    sensory_hierarchy: "foreground",
    sensory_domain: "spatial",
    metaphor: "Uma vitrine inclinada de museu. O objeto está atrás do vidro, mas você pode ver seus lados conforme se aproxima — ele existe em três dimensões, não em duas.",
  },
  "count-up-metrics": {
    id: "count-up-metrics",
    perceptual_effect: "Números que CRESCEM diante dos olhos. O abstrato vira concreto — o usuário VÊ o impacto, não apenas lê sobre ele.",
    emotional_quality: "Credibilidade + impacto. Dados não são informados — são EXPERIENCIADOS.",
    creative_combinations: [
      { with: "scroll-reveal", reasoning: "Count-up dispara quando entra no viewport + scroll-reveal no contexto ao redor = o número chega no momento certo, com o suporte visual certo.", result_quality: "Storytelling de dados com ritmo — o usuário processa antes do próximo número." },
      { with: "sticky-stack", reasoning: "Sticky segura o headline 'Impacto' enquanto os números contam ao scrollar = o contexto permanece, a evidência se acumula.", result_quality: "Argumento visual — a tese fica, os dados se somam." },
      { with: "parallax-depth", reasoning: "Números na frente (count-up) + fundo com parallax = os dados são o presente, o contexto histórico respira atrás.", result_quality: "Profundidade temporal — o crescimento acontece no tempo (count-up) e no espaço (parallax)." },
    ],
    noise_signals: [
      "Todos os números contando ao mesmo tempo — o olho não sabe para onde olhar. Stagger com 0.2-0.3s entre cada um.",
      "Duration <1.5s — o número aparece pronto, não conta. O efeito é a JORNADA, não o destino.",
      "Números sem contexto — '2,847' não significa nada sozinho. Sempre acompanhe de 'usuários ativos' ou similar.",
    ],
    sensory_hierarchy: "foreground",
    sensory_domain: "temporal",
    metaphor: "Um hodômetro digital. O número não está lá — está CHEGANDO. Cada dígito que vira é uma conquista que o usuário testemunha.",
  },
  "infinite-marquee": {
    id: "infinite-marquee",
    perceptual_effect: "Uma corrente infinita de logos/textos que desliza sem começo nem fim. O usuário sente movimento perpétuo — a marca está VIVA, não estática.",
    emotional_quality: "Energia + pertencimento. O usuário vê que outras marcas/empresas confiam — é prova social em movimento.",
    creative_combinations: [
      { with: "smooth-scroll-lenis", reasoning: "Marquee desliza horizontalmente (perpétuo) + Lenis suaviza o scroll vertical (intencional) = duas velocidades, dois propósitos. O marquee é o rio, o scroll é a navegação.", result_quality: "Página com duas camadas de movimento — uma ambiental, uma intencional." },
      { with: "grain-texture-overlay", reasoning: "Marquee desliza SOB o grain = os logos aparecem e desaparecem na textura, como se estivessem emergindo de um material granulado.", result_quality: "Movimento industrial — logos que passam como créditos em filme antigo." },
    ],
    noise_signals: [
      "Velocidade muito alta — o usuário não consegue ler os logos, vira ruído visual.",
      "Marquee sem pausa ou lentidão — o movimento perpétuo cansa. Considere pausar no hover.",
      "Repetir o mesmo logo 3+ vezes no mesmo loop — parece falta de conteúdo.",
    ],
    sensory_hierarchy: "ambient",
    sensory_domain: "kinetic",
    metaphor: "Uma esteira de bagagem em um aeroporto de design. Os logos desfilam, provando que outras pessoas já passaram por aqui antes de você.",
  },
  "animated-mesh-background": {
    id: "animated-mesh-background",
    perceptual_effect: "O fundo está VIVO. Cores que se movem como névoa ou aurora — não é um gradiente estático, é um ambiente que respira.",
    emotional_quality: "Atmosfera + profundidade emocional. O fundo não compete com o conteúdo — ele o EMBALA.",
    creative_combinations: [
      { with: "spotlight-cursor", reasoning: "Mesh se move no fundo (vida própria) + spotlight revela o mesh onde o cursor passa (interação) = o fundo existe, mas o usuário o DESCOBRE com o movimento.", result_quality: "Mundo vivo que reage à presença." },
      { with: "liquid-blob-background", reasoning: "Mesh + liquid blobs no mesmo fundo = camadas de movimento orgânico. O mesh é a atmosfera, os blobs são as entidades dentro dela.", result_quality: "Fundo cinematográfico — como um céu com nuvens e aurora." },
      { with: "glassmorphism-layers", reasoning: "Mesh SEMPRE atrás do glass. Sem mesh, o glass não tem o que refletir — vira vidro sobre parede branca. Mesh + glass = vitrine de museu com luz natural.", result_quality: "A razão do glass existir: mostrar o que está atrás dele." },
    ],
    noise_signals: [
      "Mesh sem movimento — é só um gradiente genérico. A alma do mesh é a ANIMAÇÃO.",
      "Cores muito saturadas — mesh deve ser sutil (opacidade 20-40%), não berrante.",
      "Mesh em mobile sem degradê de performance — animação de fundo em 60fps no mobile consola bateria.",
    ],
    sensory_hierarchy: "background",
    sensory_domain: "ambient",
    metaphor: "Aurora boreal. Está sempre lá, se movendo devagar, criando atmosfera sem exigir atenção. Você só percebe quando para para olhar.",
  },
  "glassmorphism-layers": {
    id: "glassmorphism-layers",
    perceptual_effect: "O elemento parece VIDRO — translúcido, com reflexo, mostrando o que está atrás. Não é um painel opaco, é uma lente.",
    emotional_quality: "Profundidade + sofisticação. O digital vira material — algo com espessura e transparência.",
    creative_combinations: [
      { with: "animated-mesh-background", reasoning: "CRÍTICO: glass SÓ funciona sobre mesh/parallax/conteúdo animado. Sem nada atrás, glass é só um fundo cinza translúcido. O mesh DÁ O QUE REFLETIR ao glass.", result_quality: "A razão de ser do glass: mostrar a vida atrás dele." },
      { with: "spotlight-cursor", reasoning: "Spotlight através do glass = o vidro deixa PASSAR a luz. O glass não é uma barreira, é um filtro que a luz atravessa.", result_quality: "Vidro que conduz luz — como vitral iluminado por trás." },
      { with: "smooth-scroll-lenis", reasoning: "Glass fixo (nav) + Lenis suaviza o scroll do conteúdo atrás = o vidro está sempre à frente, mas o que está atrás se move suavemente, como se visto através de uma janela.", result_quality: "Janela digital — o mundo passa atrás do vidro." },
    ],
    noise_signals: [
      "Glass sobre fundo CHAPADO (branco, preto, cinza sólido) — não há o que refletir. O blur não tem o que mostrar.",
      "backdrop-blur sem bg semitransparente (bg-white/60 ou similar) — sem bg o blur some contra fundos claros.",
      "Glass em border-radius muito baixo — vidro precisa de bordas suaves para parecer orgânico.",
      "Glass em mais de 2 elementos na mesma tela — vira competição de transparência.",
    ],
    sensory_hierarchy: "midground",
    sensory_domain: "visual",
    metaphor: "Uma vitrine de loja na rua. Você vê o que está dentro através do vidro, mas o reflexo da rua se sobrepõe. O vidro CONECTA dois espaços.",
  },
  "grain-texture-overlay": {
    id: "grain-texture-overlay",
    perceptual_effect: "A superfície ganha TEXTURA. O digital perfeito demais vira material — papel, filme, tecido. O usuário QUER TOCAR.",
    emotional_quality: "Autenticidade + calor. O grain tira o excesso de polimento digital que faz parecer genérico.",
    creative_combinations: [
      { with: "kinetic-typography", reasoning: "Kinetic revela letras + grain texturiza a superfície = letras que parecem EMERGIR de um material, não planar sobre um fundo digital.", result_quality: "Tipografia artesanal — parece letterpress, não tela." },
      { with: "parallax-depth", reasoning: "Grain na camada MAIS FRENTE (z-index máximo) + parallax nas camadas de trás = o grain é a superfície do mundo, o parallax é a profundidade dele.", result_quality: "Textura cinematográfica — como filme analógico com profundidade de campo." },
      { with: "liquid-blob-background", reasoning: "Liquid blobs se movem no fundo + grain sobre TUDO = os blobs são vistos ATRAVÉS da textura, como se estivessem submersos em água granulada.", result_quality: "Profundidade orgânica — líquido + textura = material vivo." },
    ],
    noise_signals: [
      "Grain opacity >0.05 — parece sujeira na tela, não textura. 0.03-0.05 é o range mágico.",
      "Grain sem SVG filter — PNG grainy ocupa banda e não escala. Use SVG feTurbulence.",
      "Grain em elemento com muitas animações — a GPU processa grain + animações = queda de framerate em mobile.",
    ],
    sensory_hierarchy: "foreground",
    sensory_domain: "tactile",
    metaphor: "A textura do papel de um livro antigo. Você não precisa tocar para saber que não é uma tela lisa — seus olhos SENTEM a superfície.",
  },
  "smooth-scroll-lenis": {
    id: "smooth-scroll-lenis",
    perceptual_effect: "O scroll ganha INÉRCIA. Não é uma rolagem discreta (trrruimmm) — é um deslize contínuo. O usuário sente que está deslizando sobre um fluido.",
    emotional_quality: "Premium + contemplação. A pressa diminui. O usuário NAVEGA, não corre.",
    creative_combinations: [
      { with: "parallax-depth", reasoning: "Lenis suaviza o movimento do scroll + parallax responde ao scroll = a FÍSICA do movimento e a física da profundidade são a MESMA. O usuário sente que está se movendo através de um meio físico.", result_quality: "Experiência de museu — cada movimento tem peso e propósito." },
      { with: "sticky-stack", reasoning: "Lenis faz o scroll fluir + sticky ancora o contexto = fluidez com orientação. O melhor dos dois mundos: movimento prazeroso sem desorientação.", result_quality: "Narrativa líquida — o conteúdo flui mas a âncora permanece." },
      { with: "scroll-reveal", reasoning: "Scroll suave + reveal suave = tudo se move NA MESMA FÍSICA. O scroll não é um evento externo — é parte do design.", result_quality: "Coesão física total — tudo na página respeita as mesmas leis de movimento." },
    ],
    noise_signals: [
      "Lenis com duration <0.8 — muito rápido, parece scroll normal com easing estranho.",
      "Lenis com duration >1.5 — o usuário sente que o scroll está travando.",
      "Lenis sem prefers-reduced-motion check — usuários com sensibilidade vestibular passam mal.",
      "Lenis em página com infinite-marquee — dois sistemas de movimento inercial competem.",
    ],
    sensory_hierarchy: "ambient",
    sensory_domain: "kinetic",
    metaphor: "Deslizar sobre gelo fino — o movimento continua além do impulso inicial. Cada gesto tem consequência física.",
  },
  "section-tabs-visual": {
    id: "section-tabs-visual",
    perceptual_effect: "Múltiplas FACETAS de uma mesma ideia. O usuário não scrolla para ver mais — ele ESCOLHE o que ver.",
    emotional_quality: "Controle + descoberta direcionada. O usuário decide o caminho, mas o conteúdo guia a escolha.",
    creative_combinations: [
      { with: "animated-mesh-background", reasoning: "Cada tab muda o mesh de fundo — a cor/atmosfera se adapta ao conteúdo. A tab não é só texto, é uma TRANSIÇÃO DE AMBIENTE.", result_quality: "Mudança de cenário teatral — cada aba é um novo ato." },
      { with: "spotlight-cursor", reasoning: "Spotlight + tabs = o usuário escolhe com o olhar e confirma com o clique. A interface antecipa a intenção.", result_quality: "Navegação viva — o preview antecede a escolha." },
      { with: "scroll-reveal", reasoning: "Conteúdo da tab revela no scroll + tabs persistentes no topo = o usuário scrolla o conteúdo mas as tabs são a âncora de navegação.", result_quality: "Deep dive com mapa — o usuário explora fundo sem perder a visão geral." },
    ],
    noise_signals: [
      "Mais de 5 tabs — o usuário não lembra qual é qual. Máximo 4 para decisão rápida.",
      "Tab sem preview visual — só texto não justifica o custo cognitivo de escolher.",
      "Transição instantânea sem animação — a troca precisa ser VISÍVEL para o usuário processar.",
    ],
    sensory_hierarchy: "midground",
    sensory_domain: "spatial",
    metaphor: "Um mostrador de relógio antigo com várias janelas — cada janela mostra uma informação diferente, mas o mostrador (contexto) permanece o mesmo.",
  },
  "process-steps-scroll": {
    id: "process-steps-scroll",
    perceptual_effect: "O progresso é VISÍVEL. Cada passo é uma conquista — o usuário vê o caminho percorrido e o que falta.",
    emotional_quality: "Clareza + confiança. O usuário sabe exatamente onde está na jornada.",
    creative_combinations: [
      { with: "sticky-stack", reasoning: "Progressão dos steps no scroll + sticky com o número atual sempre visível = o usuário nunca perde a noção de progresso.", result_quality: "Jornada guiada — como um GPS que mostra o trajeto completo." },
      { with: "count-up-metrics", reasoning: "Steps progridem + contadores mostram o resultado de cada passo = CAUSA e EFEITO visíveis em tempo real.", result_quality: "Demonstração de valor — cada passo tem sua recompensa numérica." },
    ],
    noise_signals: [
      "Mais de 5 passos — o usuário esquece o primeiro antes de chegar ao último.",
      "Passos sem numeração visível — sem o número, o usuário não sente progresso.",
      "Steps com alturas muito diferentes — o ritmo visual quebra.",
    ],
    sensory_hierarchy: "midground",
    sensory_domain: "temporal",
    metaphor: "Uma trilha marcada em uma montanha. A cada curva, uma placa mostra o quanto você já andou — e o pico ao fundo mostra o destino.",
  },
  "logo-marquee-social-proof": {
    id: "logo-marquee-social-proof",
    perceptual_effect: "Marcas conhecidas desfilam — prova social em movimento. O usuário pensa 'se eles confiam, posso confiar'.",
    emotional_quality: "Confiança + pertencimento. O usuário não está sozinho — outros já escolheram este caminho.",
    creative_combinations: [
      { with: "infinite-marquee", reasoning: "Logos em loop infinito + marquee clássico = prova social contínua. O movimento sugere que a lista nunca acaba.", result_quality: "Adoção massiva — parece que TODO MUNDO usa." },
      { with: "grain-texture-overlay", reasoning: "Logos + grain = autenticidade. As marcas não parecem ads polidos — parecem recomendações genuínas em uma superfície texturizada.", result_quality: "Prova social artesanal — recomendações de verdade, não banner." },
    ],
    noise_signals: [
      "Logos em preto e branco sem variação de tom — parece grid de placeholder, não prova social.",
      "Logos muito pequenos ou muito grandes — sem escala consistente, parece desorganizado.",
      "Repetir os mesmos 3 logos em loop — falta de conteúdo fica evidente.",
    ],
    sensory_hierarchy: "ambient",
    sensory_domain: "visual",
    metaphor: "O mural de clientes na entrada de um restaurante. Você não precisa ler cada nome — a PAREDE INTEIRA prova que o lugar é bom.",
  },
  "interactive-demo-embed": {
    id: "interactive-demo-embed",
    perceptual_effect: "O usuário EXPERIMENTA antes de COMPRAR. Não é uma screenshot — é o produto real, ali na página.",
    emotional_quality: "Confiança + autonomia. O usuário não precisa acreditar na promessa — ele TESTA.",
    creative_combinations: [
      { with: "spotlight-cursor", reasoning: "Demo interativo + spotlight = o usuário EXPLORA o produto com a lanterna, descobrindo funcionalidades como se fosse uma caça ao tesouro.", result_quality: "Onboarding lúdico — aprender o produto é divertido." },
      { with: "kinetic-typography", reasoning: "Demo ao lado + tipografia kinetic no título = o texto anuncia o que o demo entrega. A palavra e a ação estão lado a lado.", result_quality: "Demonstração imediata — o usuário lê e testa no mesmo instante." },
    ],
    noise_signals: [
      "Demo que não carrega ou quebra — pior que não ter demo. Fallback obrigatório.",
      "Demo ocupando <30% do hero — muito pequeno para ser útil.",
      "Demo sem indicação de interatividade — o usuário não sabe que pode clicar.",
    ],
    sensory_hierarchy: "foreground",
    sensory_domain: "kinetic",
    metaphor: "Uma loja que deixa você experimentar o produto antes de comprar. Não tem vitrine — tem provador.",
  },
  "page-view-transition": {
    id: "page-view-transition",
    perceptual_effect: "A troca de página não é um CORTE — é uma TRANSFORMAÇÃO. O usuário vê a continuidade entre duas telas.",
    emotional_quality: "Coesão + fluidez. O usuário sente que está no mesmo espaço, apenas olhando para outra direção.",
    creative_combinations: [
      { with: "smooth-scroll-lenis", reasoning: "View transition na MUDANÇA de página + Lenis no scroll DENTRO da página = tudo flui. Não há cortes secos em lugar nenhum.", result_quality: "Experiência líquida — navegar vira um movimento contínuo." },
      { with: "animated-mesh-background", reasoning: "Mesh que MORFHA entre páginas — a cor/forma do mesh se transforma na transição, não corta. O fundo é contínuo, o conteúdo que muda.", result_quality: "Ambiente persistente — o mundo não reinicia a cada página." },
    ],
    noise_signals: [
      "View transition sem shared element — se não há um elemento que CONTINUA, a transição é só um fade, que não comunica continuidade.",
      "Duration >500ms — o usuário espera, não acompanha. 300-400ms é o ponto ideal.",
      "Transição diferente em cada direção sem motivo — inconsistência quebra a ilusão de espaço contínuo.",
    ],
    sensory_hierarchy: "ambient",
    sensory_domain: "temporal",
    metaphor: "Um teatro giratório. O palco (ambiente) permanece, o cenário (conteúdo) gira. O espectador sabe que está no mesmo teatro, apenas em outra cena.",
  },
  "liquid-blob-background": {
    id: "liquid-blob-background",
    perceptual_effect: "O fundo parece LÍQUIDO — formas orgânicas que se fundem, se separam, fluem. Não é geometria, é biologia.",
    emotional_quality: "Organicidade + estranhamento familiar. Parece vivo, mas não é nada que exista na natureza.",
    creative_combinations: [
      { with: "grain-texture-overlay", reasoning: "Liquid blobs se movem + grain texturiza a superfície = os blobs parecem AMEBAS vistas através de um microscópio com iluminação granulada.", result_quality: "Biologia digital — orgânico com textura de mundo real." },
      { with: "animated-mesh-background", reasoning: "Blobs como CAMADA 1 (formas definidas) + mesh como CAMADA 0 (atmosfera difusa) = profundidade orgânica em duas escalas diferentes.", result_quality: "Ecossistema visual — macro (blobs) e micro (mesh) no mesmo espaço." },
      { with: "glassmorphism-layers", reasoning: "Blobs atrás do glass = o vidro distorce as formas líquidas. O blob não está só atrás — está SENDO VISTO através de uma lente.", result_quality: "Aquário digital — líquido visto através de vidro." },
    ],
    noise_signals: [
      "Blobs sem gooey filter — são só círculos animados, perde a mágica do liquid.",
      "Blobs em mobile sem fallback — GPU de mobile sofre com filter:url(#goo).",
      "Cores muito contrastantes nos blobs — competem com o conteúdo.",
    ],
    sensory_hierarchy: "background",
    sensory_domain: "visual",
    metaphor: "Tinta a óleo na água. As formas se dissolvem e se recombinam sem nunca perder a sensação de fluido — você nunca vê a mesma forma duas vezes.",
  },
  "video-hero-background": {
    id: "video-hero-background",
    perceptual_effect: "O fundo GANHA VIDA REAL. Não é ilustração ou animação — é o mundo real, capturado. O produto em uso, a equipe em ação.",
    emotional_quality: "Realismo + aspiração. O usuário vê o que é POSSÍVEL — não o que foi desenhado.",
    creative_combinations: [
      { with: "parallax-depth", reasoning: "Vídeo no fundo + parallax em elementos do hero sobre o vídeo = o vídeo é a realidade, os elementos de UI interagem com ela.", result_quality: "Realidade aumentada leve — o digital sobre o real." },
      { with: "glassmorphism-layers", reasoning: "Glass sobre o vídeo = o vidro flutua SOBRE a realidade. O contraste entre vídeo real e glass digital é PODEROSO.", result_quality: "Ficção científica elegante — o digital tocando o real." },
    ],
    noise_signals: [
      "Vídeo sem mute por default — o usuário leva susto e sai.",
      "Vídeo com >10MB — não carrega em 3G, o hero fica vazio.",
      "Vídeo que não comunica o produto — belo mas irrelevante é pior que sem vídeo.",
      "Sem poster frame — o espaço fica preto até carregar.",
    ],
    sensory_hierarchy: "background",
    sensory_domain: "visual",
    metaphor: "Uma janela para outro lugar. Não é uma pintura da paisagem — é a paisagem real, em tempo real, com pessoas e movimento.",
  },
  "webgl-hero-light": {
    id: "webgl-hero-light",
    perceptual_effect: "LUZ 3D em tempo real — não é um gradiente animado, é uma cena tridimensional com iluminação computada. O usuário está em um ESPAÇO.",
    emotional_quality: "Maravilha + tecnologia. O usuário sente que está diante de algo COMPUTACIONALMENTE impressionante.",
    creative_combinations: [
      { with: "magnetic-interaction", reasoning: "WebGL renderiza luz em 3D + magnetic faz elementos 2D responderem ao cursor = o 3D e o 2D compartilham a mesma fonte de luz virtual.", result_quality: "Unificação física — luz 3D ilumina elementos 2D como se fossem do mesmo mundo." },
      { with: "spotlight-cursor", reasoning: "Spotlight no DOM (2D) + luz WebGL (3D) = dois sistemas de iluminação que se complementam. Um ilumina a interface, outro ilumina o espaço.", result_quality: "Dualidade luminosa — o espaço e a interface coexistem." },
      { with: "liquid-blob-background", reasoning: "WebGL + liquid blobs = orgânico COMPUTACIONAL. Blobs não são CSS — são geometria 3D com iluminação real.", result_quality: "Orgânico hiper-real — o que parece vivo É computado." },
    ],
    noise_signals: [
      "WebGL sem fallback — mobile sem WebGL suportado vê espaço vazio.",
      "Cena muito complexa (>100k polígonos) — queda de FPS em GPU integrada.",
      "WebGL que não se comunica com o resto da página — parece outro site embedado.",
    ],
    sensory_hierarchy: "background",
    sensory_domain: "spatial",
    metaphor: "Um holofote em um palco vazio. A luz não está apenas iluminando — ela ESTÁ CRIANDO o espaço. Sem ela, não há profundidade, só escuridão.",
  },
};

/** Sumário do conhecimento avançado para o prompt do sistema. */
export function buildTechniqueMasterySummary(): string {
  const lines: string[] = [
    "## 🎭 DOMÍNIO PERCEPTUAL DAS TÉCNICAS",
    "Cada técnica abaixo inclui: efeito perceptual, qualidade emocional, combinações criativas, quando vira ruído.",
    "Use este conhecimento para COMPOR, não para colar. Técnica sem intenção é ruído.",
    "",
  ];

  for (const mastery of Object.values(TECHNIQUE_MASTERY)) {
    const pairs = mastery.creative_combinations
      .slice(0, 2)
      .map((c) => `${c.with} — ${c.reasoning.slice(0, 120)}`)
      .join("\n      ");

    lines.push(
      `### ${mastery.id}`,
      `**Efeito:** ${mastery.perceptual_effect}`,
      `**Emoção:** ${mastery.emotional_quality}`,
      `**Domínio:** ${mastery.sensory_domain} | ${mastery.sensory_hierarchy}`,
      `**Metáfora:** ${mastery.metaphor}`,
      pairs ? `**Combinações:**\n      ${pairs}` : "",
      `**Ruído se:** ${mastery.noise_signals.slice(0, 2).join(" | ")}`,
      "",
    );
  }

  return lines.join("\n");
}
