/**
 * ChatEmptyState — Lovable-style 4 suggestion cards (Fase 2.5).
 *
 * Renderizado quando `showEmptyState && messages.length === 0`. Cada card
 * pré-popula o composer (via callback) com uma ideia de projeto. O usuário
 * clica, edita se quiser, e envia.
 *
 * A escolha de "4 cards" segue Lovable: 1) TODO app (intro ao estado), 2)
 * Landing page (visual rápido), 3) Auth (mostra integração), 4) DB (mostra
 * Supabase). Mantém simples e didático.
 */

import { CheckSquare, Layout, ShieldCheck, Database } from "lucide-react";
import type { ReactNode } from "react";

type ChatEmptyStateProps = {
  onPickSuggestion?: (prompt: string) => void;
};

type Suggestion = {
  icon: ReactNode;
  title: string;
  prompt: string;
};

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <CheckSquare className="size-4" />,
    title: "Build a TODO app",
    prompt: "Crie um app de lista de tarefas com React, persistência local e modo escuro.",
  },
  {
    icon: <Layout className="size-4" />,
    title: "Create a landing page",
    prompt: "Crie uma landing page moderna para um SaaS de gestão de projetos, com hero, features e CTA.",
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: "Add user authentication",
    prompt: "Adicione autenticação com Supabase Auth (email/senha) e proteção de rotas privadas.",
  },
  {
    icon: <Database className="size-4" />,
    title: "Connect to a database",
    prompt: "Conecte a aplicação ao Supabase: crie uma tabela, insira dados e exiba-os em uma lista.",
  },
];

export function ChatEmptyState({ onPickSuggestion }: ChatEmptyStateProps) {
  return (
    <div className="forge-chat-empty-state" data-testid="chat-empty-state">
      <p className="forge-chat-empty-headline">Vamos construir algo.</p>
      <p className="forge-chat-empty-subhead">
        Escolha um ponto de partida ou descreva o que você quer em linguagem natural.
      </p>
      <div className="forge-chat-empty-suggestions" data-testid="chat-empty-suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            className="forge-chat-empty-suggestion"
            onClick={() => onPickSuggestion?.(s.prompt)}
            data-testid="chat-empty-suggestion"
            data-suggestion-title={s.title}
          >
            <span className="forge-chat-empty-suggestion-icon">{s.icon}</span>
            <span className="forge-chat-empty-suggestion-title">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
