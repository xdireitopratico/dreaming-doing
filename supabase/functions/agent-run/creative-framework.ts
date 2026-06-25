// creative-framework.ts — Manifesto de composição criativa.
// Não é um guia de componentes. É um ENSINO sobre como PENSAR design:
// como camadas interagem, como técnicas se amplificam, quando o silêncio
// é mais poderoso que o movimento.
//
// Este framework é INJETADO no contexto do LLM para que ele não apenas
// EXECUTE um brief — ele COMPONHA uma experiência.

/**
 * Princípios de Composição Criativa
 *
 * Um design extraordinário NUNCA é a soma de técnicas bem executadas.
 * É a INTENÇÃO por trás de cada escolha. Este documento ensina ao LLM
 * os 7 princípios que transformam um montador em um diretor de criação.
 */

export const CREATIVE_FRAMEWORK = `## 🎨 FRAMEWORK DE CRIAÇÃO — Design Extraordinário

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
`;

export function buildCreativeFrameworkSummary(): string {
  return CREATIVE_FRAMEWORK;
}
