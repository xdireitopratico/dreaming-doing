-- Remove App.tsx mockup (HeroSignature/Bento seed) de projetos existentes.
-- Força re-sync do preview E2B na próxima abertura (meta preview limpo).

UPDATE public.project_files
SET
  content = $seed$
export default function App() {
  return (
    <main className="min-h-dvh bg-background text-foreground font-body flex items-center justify-center p-8">
      <p className="text-muted-foreground text-center max-w-md text-sm leading-relaxed">
        Canvas vazio — descreva o app no chat do FORGE para gerar a interface aqui.
      </p>
    </main>
  );
}
$seed$,
  updated_at = now()
WHERE path IN ('src/App.tsx', '/src/App.tsx')
  AND (
    content LIKE '%HeroSignature%'
    OR content LIKE '%seed com @forge/ui embutido%'
    OR content LIKE '%BentoGrid%'
  );

UPDATE public.projects p
SET meta = COALESCE(p.meta, '{}'::jsonb)
  - 'previewUrl'
  - 'previewSandboxId'
  - 'previewReady'
  - 'previewExpiresAt'
WHERE EXISTS (
  SELECT 1
  FROM public.project_files pf
  WHERE pf.project_id = p.id
    AND pf.path IN ('src/App.tsx', '/src/App.tsx')
    AND pf.content LIKE '%Canvas vazio — descreva o app no chat do FORGE%'
    AND pf.updated_at >= now() - interval '5 minutes'
);