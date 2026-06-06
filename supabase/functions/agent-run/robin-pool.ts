import type { ProviderConfig } from "./providers.ts";
import { buildProvider } from "./providers.ts";
import type { ChatParams, ChatResponse, LLMProvider } from "./types.ts";
import {
  friendlyLlmError,
  isConnectionError,
  isOverloadError,
  isRateLimitError,
  isRetryableLlmError,
  parseRetryAfterSec,
} from "./llm-errors.ts";
import { llmBackoffMs, MAX_LLM_RETRIES, sleepMs } from "./llm-retry.ts";

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
    // Todas em cooldown — retorna null para sinalizar que deve aguardar
    return null;
  }

  /** Tempo em ms até a próxima chave ficar disponível. */
  timeUntilNextAvailable(): number {
    const now = Date.now();
    let minWait = Infinity;
    for (const key of this.keys) {
      const until = this.cooldownUntil.get(key) ?? 0;
      if (until > now) {
        minWait = Math.min(minWait, until - now);
      }
    }
    return minWait === Infinity ? 0 : minWait;
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
    const poolSize = this.pool?.size ?? 1;
    const attempts = Math.max(poolSize, MAX_LLM_RETRIES);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      let apiKey = this.pool?.nextKey() ?? this.cfg.apiKey;

      if (!apiKey && this.pool) {
        const waitMs = this.pool.timeUntilNextAvailable();
        if (waitMs > 0 && waitMs < 60_000) {
          this.emit("robin_wait", {
            message: `Todas as chaves em cooldown. Aguardando ${Math.ceil(waitMs / 1000)}s para a próxima ficar disponível…`,
            waitMs,
          });
          await sleepMs(waitMs);
          apiKey = this.pool.nextKey() ?? this.cfg.apiKey;
        }
      }

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

        if (isRetryableLlmError(err) && attempt < attempts - 1) {
          const retryAfter = parseRetryAfterSec(err);
          const delay = llmBackoffMs(attempt, retryAfter ?? undefined);

          if (isRateLimitError(err) && this.pool) {
            this.pool.markRateLimited(apiKey);
            this.emit("rate_limit", {
              message: `Limite por minuto (${keyHint}). ROBIN troca para a próxima chave…`,
              attempt: attempt + 1,
              maxAttempts: attempts,
              provider: this.cfg.label,
              backoffMs: delay,
            });
            if (this.pool.size > 1) continue;
          } else if (isOverloadError(err)) {
            this.emit("rate_limit", {
              message: `Servidor sobrecarregado (529/503) — backoff ${Math.round(delay / 1000)}s…`,
              attempt: attempt + 1,
              maxAttempts: attempts,
              provider: this.cfg.label,
              backoffMs: delay,
            });
          } else if (isRateLimitError(err)) {
            this.emit("rate_limit", {
              message: `Rate limit — aguardando ${Math.round(delay / 1000)}s antes de retentar…`,
              attempt: attempt + 1,
              maxAttempts: attempts,
              provider: this.cfg.label,
              backoffMs: delay,
            });
          } else if (isConnectionError(err)) {
            this.emit("connection_retry", {
              message: "Conexão instável — tentando novamente em instantes…",
              attempt: attempt + 1,
              backoffMs: delay,
            });
          }

          await sleepMs(delay);
          continue;
        }

        const friendly = friendlyLlmError(err, !!this.pool);
        this.emit("error", {
          message: friendly,
          recoverable: isRetryableLlmError(err),
        });
        throw new Error(friendly);
      }
    }

    throw new Error(friendlyLlmError(lastErr, !!this.pool));
  }
}