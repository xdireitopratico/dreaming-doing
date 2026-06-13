import { toast as sonnerToast, type ExternalToast } from "sonner";

const noop = (_message?: string, _options?: ExternalToast) => undefined;

type ShadcnToastOptions = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

function formatShadcnToastMessage({ title, description }: ShadcnToastOptions): string {
  if (title && description) return `${title}: ${description}`;
  return title || description || "";
}

/** Compat shadcn/use-toast — só erros são exibidos (política FORGE). */
function toastCompat(options: ShadcnToastOptions): void {
  const message = formatShadcnToastMessage(options);
  if (!message) return;
  if (options.variant === "destructive") {
    sonnerToast.error(message);
  }
}

/** Toast da plataforma — apenas erros são exibidos ao utilizador. */
export const toast = Object.assign(toastCompat, {
  error: sonnerToast.error.bind(sonnerToast),
  success: noop,
  info: noop,
  warning: noop,
  loading: noop,
  dismiss: sonnerToast.dismiss.bind(sonnerToast),
  promise: noop as unknown as typeof sonnerToast.promise,
});
