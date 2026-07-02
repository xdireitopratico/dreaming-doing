/**
 * Inngest executor migrado para VM Hostinger (inngest/connect).
 * Este endpoint não executa functions — evita fallback acidental na Vercel.
 */
export default function inngestDisabled(req, res) {
  res.statusCode = 410;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      error: "inngest_executor_migrated",
      message:
        "Executor Inngest roda na VM (connect workers). /api/inngest na Vercel está desativado.",
      workers: "dp-dd-inngest-worker @ Hostinger VPS",
    }),
  );
}