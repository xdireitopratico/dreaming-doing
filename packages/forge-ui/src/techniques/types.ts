/**
 * Technique — unidade do "marketplace de design". Cada técnica é um CONCEITO
 * nomeado e componível (não um componente pronto pra plugar): o agente lê,
 * entende quando/quando-não usar, e ADAPTA a referência ao contexto do projeto.
 * É o que separa "montador que pluga componentes" de "designer que compõe".
 */
export interface Technique {
  id: string;
  name: string;
  /** O que é, em uma frase. */
  concept: string;
  /** Quando usar — orienta a escolha sem obrigar. */
  whenToUse: string;
  /** Técnicas que combinam (a simbiose que transforma simples → excepcional). */
  pairsWith: string[];
  /** Primitivas de @forge/ui que a referência usa. */
  primitives: string[];
  /** Snippet TSX completo e adaptável — leia, entenda, reescreva pro contexto. */
  reference: string;
}
