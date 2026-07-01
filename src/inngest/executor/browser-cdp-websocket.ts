/**
 * browser-cdp-websocket — WebSocket CDP client for E2B Chromium sandbox.
 *
 * Connects directly to the Chrome DevTools WebSocket exposed by the E2B sandbox
 * at wss://9222-<sandboxId>.e2b.app. No polling, no E2B envd CDP relay.
 */

import { errorMessage } from "@/lib/error-utils";

const E2B_DOMAIN =
  (typeof process !== "undefined" ? process.env.E2B_DOMAIN : undefined) ||
  "e2b.app";
const CDP_PORT = 9222;
const CDP_TIMEOUT_MS = 60_000;

export type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export class CdpWebSocketClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private eventListeners = new Map<string, Array<(params: unknown) => void>>();
  private connectPromise: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly sandboxId: string,
    private readonly accessToken: string | null,
  ) {}

  private wsUrl(): string {
    const host = `${CDP_PORT}-${this.sandboxId}.${E2B_DOMAIN}`;
    return `wss://${host}/`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.accessToken) h["X-Access-Token"] = this.accessToken;
    return h;
  }

  async connect(): Promise<void> {
    if (this.closed) throw new Error("CDP client is closed");
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = this.wsUrl();
      const ws = new WebSocket(url, [], { headers: this.headers() });

      const connectTimer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP WebSocket connect timeout to ${url}`));
      }, CDP_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(connectTimer);
        this.ws = ws;
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as CdpMessage;
          this.handleMessage(msg);
        } catch (err) {
          console.warn("[cdp-ws] invalid message:", event.data, errorMessage(err));
        }
      };

      ws.onerror = (event) => {
        clearTimeout(connectTimer);
        const err = new Error(`CDP WebSocket error to ${url}`);
        if (this.ws === ws) this.ws = null;
        reject(err);
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        for (const [, { reject, timer }] of this.pending) {
          clearTimeout(timer);
          reject(new Error("CDP WebSocket closed unexpectedly"));
        }
        this.pending.clear();
      };
    });
  }

  private handleMessage(msg: CdpMessage): void {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const req = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(req.timer);
      if (msg.error) {
        req.reject(
          new Error(`CDP error ${msg.error.code}: ${msg.error.message}`),
        );
      } else {
        req.resolve(msg.result ?? {});
      }
    }

    if (msg.method) {
      const listeners = this.eventListeners.get(msg.method);
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(msg.params ?? {});
          } catch (err) {
            console.warn("[cdp-ws] event listener error:", errorMessage(err));
          }
        }
      }
    }
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.connect();
    const id = this.nextId++;
    const msg: CdpMessage = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, CDP_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  on(method: string, listener: (params: unknown) => void): () => void {
    const list = this.eventListeners.get(method) ?? [];
    list.push(listener);
    this.eventListeners.set(method, list);
    return () => {
      const filtered = (this.eventListeners.get(method) ?? []).filter(
        (l) => l !== listener,
      );
      this.eventListeners.set(method, filtered);
    };
  }

  async once(method: string, timeoutMs = CDP_TIMEOUT_MS): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`CDP event timeout waiting for ${method}`));
      }, timeoutMs);

      const cleanup = this.on(method, (params) => {
        clearTimeout(timer);
        cleanup();
        resolve(params);
      });
    });
  }

  close(): void {
    this.closed = true;
    for (const [, { reject, timer }] of this.pending) {
      clearTimeout(timer);
      reject(new Error("CDP client closed"));
    }
    this.pending.clear();
    this.eventListeners.clear();
    this.ws?.close();
    this.ws = null;
  }
}

let runtimeGlobalWs: CdpWebSocketClient | null = null;

export function getGlobalCdpClient(
  sandboxId: string,
  accessToken: string | null,
): CdpWebSocketClient {
  if (
    !runtimeGlobalWs ||
    runtimeGlobalWs["sandboxId"] !== sandboxId ||
    runtimeGlobalWs["accessToken"] !== accessToken
  ) {
    runtimeGlobalWs?.close();
    runtimeGlobalWs = new CdpWebSocketClient(sandboxId, accessToken);
  }
  return runtimeGlobalWs;
}

export async function withCdpSession<T>(
  sandboxId: string,
  accessToken: string | null,
  fn: (client: CdpWebSocketClient) => Promise<T>,
): Promise<T> {
  const client = new CdpWebSocketClient(sandboxId, accessToken);
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}
