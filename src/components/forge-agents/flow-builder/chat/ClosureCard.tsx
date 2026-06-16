import type { ClosureData } from '@/lib/vibe-agent-events';

interface ClosureCardProps {
  closure: ClosureData;
}

export function ClosureCard({ closure }: ClosureCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <h3 className="mb-2 text-sm font-medium">Resumo</h3>
      <p className="text-sm">{closure.summary}</p>

      {closure.remaining.length > 0 ? (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-medium text-yellow-600">Falta</h4>
          <ul className="list-disc pl-4 text-xs">
            {closure.remaining.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {closure.nextSteps.length > 0 ? (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-medium text-blue-600">Próximos passos</h4>
          <ul className="list-disc pl-4 text-xs">
            {closure.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {closure.artifacts.length > 0 ? (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-medium text-green-600">Artefatos</h4>
          <ul className="list-disc pl-4 text-xs">
            {closure.artifacts.map((artifact) => (
              <li key={artifact.id}>{artifact.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}