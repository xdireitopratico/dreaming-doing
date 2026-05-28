import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Eu preciso saber programar?",
    a: "Não. Se você consegue descrever em português o que quer, a gente cuida do resto. Conforme você cresce, o editor te mostra o código — e te ensina a ler junto.",
  },
  {
    q: "O código é mesmo meu?",
    a: "Sim, 100%. Ele vive no seu Supabase e pode ir pro seu GitHub a qualquer momento. Sem cláusula de exclusividade, sem licença restritiva. Você leva embora quando quiser.",
  },
  {
    q: "Onde fica minha chave de IA?",
    a: "Você escolhe. Pode usar o gateway gerenciado (mais fácil) ou conectar sua própria chave da Anthropic, OpenAI, Groq ou Google. Chaves próprias ficam cifradas no seu Supabase — nunca passam pelos nossos servidores.",
  },
  {
    q: "E se eu não tiver Supabase nem GitHub?",
    a: "A gente te ensina a criar, passo a passo, dentro da página de Conectores. Em menos de 5 minutos você tem tudo no ar, gratuito, sem cartão.",
  },
  {
    q: "Quanto vai custar de verdade?",
    a: "Beta privada gratuita por enquanto. Quando abrirmos, será uma assinatura plana baixa (cerca de R$ 29/mês) + o que você gastar de IA direto com o provedor. Sem markup, sem surpresa.",
  },
  {
    q: "Funciona em português?",
    a: "Nasceu em português. Agente, prompts internos e documentação foram pensados em PT-BR desde o início — nada de tradução automática esquisita.",
  },
];

export function FAQ() {
  return (
    <Accordion type="single" collapsible className="w-full divide-y divide-border">
      {faqs.map((f, i) => (
        <AccordionItem key={f.q} value={`item-${i}`} className="border-0 py-2">
          <AccordionTrigger className="text-left font-display text-[20px] md:text-[24px] hover:no-underline py-6">
            <span className="flex items-baseline gap-4">
              <span className="font-mono text-xs text-sun tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              {f.q}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-silver text-[15px] leading-relaxed pl-10 pr-4">
            {f.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
