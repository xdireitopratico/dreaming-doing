import { toast } from "@/lib/toast";

export async function copyToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed);
      return true;
    }
  } catch {
    /* fallback */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = trimmed;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    /* handled below */
  }

  toast.error("Não foi possível copiar — tente selecionar o texto manualmente.");
  return false;
}