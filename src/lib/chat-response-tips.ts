/** Dicas contextuais estilo Lovable — exibidas enquanto o agente processa. */
export const CHAT_RESPONSE_TIPS: readonly string[] = [
  "O preview atualiza automaticamente quando arquivos mudam.",
  "Use Plan para revisar um plano antes de construir.",
  "Peça alterações visuais no preview com o seletor de elementos.",
  "Anexe imagens ou PDFs para dar contexto ao agente.",
  "Mensagens na fila são enviadas assim que o agente liberar.",
  "Descreva o público e o estilo — o agente qualifica ideias vagas.",
  "Diga «mostra no preview» para sincronizar o sandbox E2B.",
];

export function pickChatResponseTip(seed: number): string {
  const idx = Math.abs(seed) % CHAT_RESPONSE_TIPS.length;
  return CHAT_RESPONSE_TIPS[idx]!;
}