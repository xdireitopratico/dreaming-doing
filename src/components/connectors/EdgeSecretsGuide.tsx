import { ExternalLink, Server } from "lucide-react";

/** Onde configurar secrets de plataforma (E2B, fallback) no Supabase — não vão em API Keys do usuário. */
export function EdgeSecretsGuide() {
  const projectRef = "dpduljngdurfpmaclffa";
  const secretsUrl =
    `https://supabase.com/dashboard/project/${projectRef}/settings/functions`;
  const cliHint = `supabase secrets set --project-ref ${projectRef} XAI_API_KEY=... E2B_API_KEY=...`;

  return (
    <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/50 p-5">
      <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-2">
        <Server className="size-3.5 text-[var(--primary)]" />
        Secrets do projeto (Supabase)
      </h2>
      <p className="font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed mb-3">
        Algumas funções usam chaves <strong className="text-[var(--foreground)]">globais do projeto</strong>, não
        as suas em API Keys. No painel Supabase: <strong className="text-[var(--foreground)]">Project Settings</strong>
        {" → "}
        <strong className="text-[var(--foreground)]">Edge Functions</strong>
        {" → aba "}
        <strong className="text-[var(--foreground)]">Secrets</strong> (não é Database nem API do projeto).
      </p>
      <p className="font-mono text-[8px] text-[var(--text-ghost)] mb-4 break-all">
        CLI: <code className="text-[var(--text-dim)]">{cliHint}</code>
      </p>
      <ul className="space-y-2 mb-4 font-mono text-[10px] text-[var(--text-dim)]">
        <li>
          <span className="text-[var(--primary)]">E2B_API_KEY</span> — preview ao vivo (sandbox)
        </li>
        <li>
          <span className="text-[var(--primary)]">GROQ_API_KEY</span> /{" "}
          <span className="text-[var(--primary)]">XAI_API_KEY</span> — fallback de voz e agente se você não
          cadastrou em API Keys
        </li>
      </ul>
      <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
        Voz (STT): prefira cadastrar <strong className="text-[var(--foreground)]">xAI (Grok)</strong> ou{" "}
        <strong className="text-[var(--foreground)]">Groq</strong> abaixo — a função{" "}
        <code className="text-[var(--text-dim)]">voice-transcribe</code> usa sua chave primeiro.
      </p>
      <a
        href={secretsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] text-[var(--primary)] hover:underline"
      >
        Abrir Secrets no Supabase
        <ExternalLink className="size-3" />
      </a>
    </section>
  );
}