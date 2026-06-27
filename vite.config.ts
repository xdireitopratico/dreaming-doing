// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercel = process.env.VERCEL === "1";

/**
 * Supabase Edge Functions use Deno-specific imports (npm: specifier) that
 * Vite/Rollup cannot resolve. The src/inngest/executor/design-dna-extraction
 * imports from supabase/functions/_shared/web-research-providers.ts which
 * in turn imports html-hygiene-edge.ts that uses npm:cheerio.
 * We must tell Rollup to ignore those files entirely.
 */
const SUPABASE_EXTERNAL_SSR = ["npm:cheerio@1.0.0-rc.12"];
const SUPABASE_EXTERNAL_ROLLUP = [
  /supabase\/functions\/.*\.ts$/,
  "npm:cheerio@1.0.0-rc.12",
];

export default defineConfig({
  cloudflare: isVercel ? false : undefined,
  tanstackStart: {
    server: { entry: isVercel ? "vercel-entry" : "server" },
  },
  vite: {
    ssr: {
      external: SUPABASE_EXTERNAL_SSR,
    },
    build: {
      rollupOptions: {
        external: SUPABASE_EXTERNAL_ROLLUP,
        onwarn(warning, warn) {
          if (warning.id?.includes("supabase/functions/")) return;
          if (warning.message?.includes("npm:cheerio")) return;
          warn(warning);
        },
      },
    },
  },
});
