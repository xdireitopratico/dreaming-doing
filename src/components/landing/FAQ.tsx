import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Sou dono do código que a IA gera?",
    a: "Sim, 100%. O código vive no seu Supabase e pode ser exportado para o seu GitHub a qualquer momento. Não há cláusula de exclusividade nem licença restritiva — é seu.",
  },
  {
    q: "Onde fica minha chave de IA?",
    a: "Você escolhe. Pode usar o gateway gerenciado (Lovable Cloud) ou conectar a sua própria chave da OpenAI / Anthropic / Google. Chaves próprias ficam cifradas no seu Supabase, nunca passam por nossos servidores.",
  },
  {
    q: "Meu banco de dados fica onde?",
    a: "No Supabase que você conecta — pode ser o gerenciado pela plataforma ou um Supabase self-hosted seu. Em qualquer um dos casos, você tem acesso direto ao SQL, às migrações e ao backup.",
  },
  {
    q: "Como exporto para o GitHub?",
    a: "Conecte sua conta na página de Conectores, autorize o repositório e qualquer mudança gerada pelo agente vira commit. Bidirecional: edita lá fora e o editor reflete aqui.",
  },
  {
    q: "O que é MCP e por que importa?",
    a: "Model Context Protocol é o padrão aberto de Anthropic para conectar ferramentas a agentes de IA. Suporte nativo a MCP significa que qualquer ferramenta (Notion, Linear, sua API interna) plugge em minutos — sem nós escrevermos integração proprietária para cada caso.",
  },
  {
    q: "Quanto custa?",
    a: "Beta privada gratuita por enquanto, com limite de uso por convite. Quando lançarmos público, será uma assinatura plana (não paga por token) com camada gratuita generosa para projetos pessoais.",
  },
];

export function FAQ() {
  return (
    <Accordion type="single" collapsible className="w-full divide-y divide-border">
      {faqs.map((f, i) => (
        <AccordionItem key={f.q} value={`item-${i}`} className="border-0 py-2">
          <AccordionTrigger className="text-left font-display text-[20px] md:text-[22px] hover:no-underline py-5">
            <span className="flex items-baseline gap-4">
              <span className="font-mono text-xs text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              {f.q}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed pl-10 pr-4">
            {f.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
