/**
 * PII Masking — Mascara dados pessoais em logs
 * 
 * Mascara CPF, telefone, email ANTES de logar.
 * Usado em console.log para compliance LGPD.
 * 
 * @version 1.0.0
 */

/**
 * Mascara dados pessoais em texto para logs seguros.
 * CPF: 123.456.789-00 → ***.***. 789-**
 * Email: user@domain.com → u***@domain.com
 * Telefone: (11) 98765-4321 → (11) 9****-****
 * Telefone internacional: +5511987654321 → +55119****4321
 */
export function maskPII(text: string): string {
  if (!text || typeof text !== "string") return text;

  return text
    // CPF: 123.456.789-00 → ***.***.789-**
    .replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/g, "***.***.***-**")
    // CPF sem formatação: 12345678900 (11 dígitos seguidos)
    .replace(/\b(\d{3})(\d{3})(\d{3})(\d{2})\b/g, "***********")
    // Email: user@domain.com → u***@domain.com
    .replace(/([a-zA-Z0-9])[a-zA-Z0-9._+-]+@([a-zA-Z0-9.-]+)/g, "$1***@$2")
    // Telefone BR formatado: (11) 98765-4321 → (11) 9****-****
    .replace(/(\(\d{2}\)\s?)(\d)(\d{3,4})-(\d{4})/g, "$1$2****-****")
    // Telefone internacional: +5511987654321
    .replace(/(\+\d{2,4})(\d)(\d{3,4})(\d{4})/g, "$1$2****$4");
}

/**
 * Console.log seguro que mascara PII automaticamente.
 * Uso: safeLog("[V2 Router] Msg:", messageContent);
 */
export function safeLog(prefix: string, ...args: any[]): void {
  const masked = args.map(arg => {
    if (typeof arg === "string") return maskPII(arg);
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.parse(maskPII(JSON.stringify(arg)));
      } catch {
        return arg;
      }
    }
    return arg;
  });
  console.log(prefix, ...masked);
}
