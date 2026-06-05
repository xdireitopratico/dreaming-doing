import type { ProviderConfig } from "./providers.ts";
import { buildProvider } from "./providers.ts";
import type { ChatParams, ChatResponse, LLMProvider } from "./types.ts";
import { friendlyLlmError, isConnectionError, isRateLimitError } from "./llm-errors.ts";

export type StreamEmit = (type: string, data: Record<string, unknown>) => void;

/** Pool ROBIN: rotação de chave a cada requisição LLM + retry em rate limit. */
export class RobinKeyPool {
  private keys: string[];
  private cursor = 0;
  private cooldownUntil = new Map<string, number>();
  private readonly cooldownMs: number;

  constructor(keys: string[], cooldownMs = 60_000) {
    this.keys = [...new Set(keys.filter((k) => k.trim().length > 0))];
    this.cooldownMs = cooldownMs;
  }

  get size(): number {
    return this.keys.length;
  }

  /** Próxima chave (round-robin), pulando keys em cooldown de rate limit. */
  nextKey(): string | null {
    if (this.keys.length === 0) return null;
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.cursor + i) % this.keys.length;
      const key = this.keys[idx]!;
      const until = this.cooldownUntil.get(key) ?? 0;
      if (until <= now) {
        this.cursor = (idx + 1) % this.keys.length;
        return key;
      }
    }
    // Todas em cooldown — usa a que expira primeiro
    let best = this.keys[0]!;
    let bestUntil = this.cooldownUntil.get(best) ?? 0;
    for (const k of this.keys) {
      const u = this.cooldownUntil.get(k) ?? 0;
      if (u < bestUntil) {
        best = k;
        bestUntil = u;
      }
    }
    return best;
  }

  markRateLimited(key: string): void {
    this.cooldownUntil.set(key, Date.now() + this.cooldownMs);
  }
}

/** LLM com retry ROBIN: troca de chave por requisição e em 429. */
export class ResilientLLM implements LLMProvider {
  private requestCount = 0;

  constructor(
    private cfg: ProviderConfig,
    private pool: RobinKeyPool | null,
    private emit: StreamEmit = () => {},
    private robinLabel = "ROBIN",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const attempts = Math.max(1, this.pool?.size ?? 1);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const apiKey = this.pool?.nextKey() ?? this.cfg.apiKey;
      if (!apiKey) throw new Error("Nenhuma chave API no pool ROBIN. Adicione chaves em /api.");

      this.requestCount++;
      const keyHint = this.pool && this.pool.size > 1
        ? `chave ${((this.requestCount - 1) % this.pool.size) + 1}/${this.pool.size}`
        : "chave única";

      if (this.pool && this.pool.size > 1) {
        this.emit("robin_rotate", {
          message: `ROBIN: requisição #${this.requestCount} usando ${keyHint}`,
          requestIndex: this.requestCount,
          poolSize: this.pool.size,
        });
      }

      const llm = buildProvider({ ...this.cfg, apiKey });

      try {
        return await llm.chat(params);
      } catch (err) {
        lastErr = err;

        if (isRateLimitError(err) && this.pool && attempt < attempts - 1) {
          this.pool.markRateLimited(apiKey);
          this.emit("rate_limit", {
            message: `Limite por minuto (${keyHint}). ROBIN troca para a próxima chave…`,
            attempt: attempt + 1,
            maxAttempts: attempts,
            provider: this.cfg.label,
          });
          continue;
        }

        if (isConnectionError(err) && attempt < attempts - 1) {
          this.emit("connection_retry", {
            message: "Conexão instável — tentando novamente em instantes…",
            attempt: attempt + 1,
          });
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }

        const friendly = friendlyLlmError(err, !!this.pool);
        this.emit("error", { message: friendly, recoverable: isConnectionError(err) || isRateLimitError(err) });
        throw new Error(friendly);
      }
    }

    throw new Error(friendlyLlmError(lastErr, !!this.pool));
  }
}