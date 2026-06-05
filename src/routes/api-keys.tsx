import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legado: /api-keys redireciona para /api */
export const Route = createFileRoute("/api-keys")({
  beforeLoad: () => {
    throw redirect({ to: "/api" });
  },
});