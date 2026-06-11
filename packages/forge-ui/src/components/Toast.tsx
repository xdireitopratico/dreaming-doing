"use client";

import {
  Toaster as SonnerToaster,
  toast as sonnerToast,
  type ToastT,
  type ExternalToast,
} from "sonner";
import { cn } from "../utils";

type ToastType = "default" | "success" | "error" | "warning" | "info" | "loading";

interface ForgeToastOptions extends Omit<ExternalToast, "icon"> {
  type?: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const icons = {
  default: null,
  success: (
    <svg
      className="h-5 w-5 text-success"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg
      className="h-5 w-5 text-destructive"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg
      className="h-5 w-5 text-amber-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg
      className="h-5 w-5 text-brand-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  loading: (
    <svg
      className="h-5 w-5 animate-spin text-brand-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  ),
};

const toastStyles = {
  default: "bg-surface-2 border-border text-foreground",
  success: "bg-green-500/10 border-green-500/30 text-green-400",
  error: "bg-red-500/10 border-red-500/30 text-red-400",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  info: "bg-brand-500/10 border-brand-500/30 text-brand-400",
  loading: "bg-brand-500/10 border-brand-500/30 text-brand-400",
};

export function toast(message: string, options: ForgeToastOptions = {}) {
  const { type = "default", action, ...rest } = options;
  return sonnerToast(message, {
    ...rest,
    className: cn(toastStyles[type], rest.className),
    icon: icons[type],
    action: action ? { label: action.label, onClick: action.onClick } : undefined,
    duration: type === "loading" ? Infinity : 4000,
    style: {
      background: "var(--forge-surface-2)",
      border: "1px solid var(--forge-border)",
      borderRadius: "var(--forge-radius-lg)",
      boxShadow: "var(--forge-shadow-lg)",
    },
  });
}

toast.success = (message: string, options?: ForgeToastOptions) =>
  toast(message, { ...options, type: "success" });
toast.error = (message: string, options?: ForgeToastOptions) =>
  toast(message, { ...options, type: "error" });
toast.warning = (message: string, options?: ForgeToastOptions) =>
  toast(message, { ...options, type: "warning" });
toast.info = (message: string, options?: ForgeToastOptions) =>
  toast(message, { ...options, type: "info" });
toast.loading = (message: string, options?: ForgeToastOptions) =>
  toast(message, { ...options, type: "loading" });
toast.dismiss = sonnerToast.dismiss;
toast.promise = sonnerToast.promise;

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "group",
          description: "text-sm text-muted-foreground",
          actionButton: "bg-brand-500 text-brand-500-foreground hover:bg-brand-600",
          cancelButton: "bg-surface-3 hover:bg-surface-4",
        },
      }}
    />
  );
}

export { Toaster as ForgeToaster };
