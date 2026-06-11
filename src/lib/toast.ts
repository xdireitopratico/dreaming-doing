import { toast as sonnerToast, type ExternalToast } from "sonner";

const noop = (_message?: string, _options?: ExternalToast) => undefined;

/** Toast da plataforma — apenas erros são exibidos ao utilizador. */
export const toast = {
  error: sonnerToast.error.bind(sonnerToast),
  success: noop,
  info: noop,
  warning: noop,
  loading: noop,
  dismiss: sonnerToast.dismiss.bind(sonnerToast),
  promise: noop as unknown as typeof sonnerToast.promise,
};
