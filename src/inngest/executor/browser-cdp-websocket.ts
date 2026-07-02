/**
 * browser-cdp-websocket — WebSocket CDP client for E2B Chromium sandbox.
 *
 * Connects to wss://9222-<sandboxId>.e2b.app/ and attaches to a page target
 * via Target.attachToTarget (flatten) — required for Page.* / Runtime.* (G4).
 */

import { errorMessage } from "@/lib/error-utils";

const E2B_DOMAIN =
  (typeof process !== "undefined" ? process.env.E2B_DOMAIN : undefined) ||
  "e2b.app";
const CDP_PORT = 9222;
const CDP_TIMEOUT_MS = 60_000;

const BROWSER_LEVEL_PREFIXES = ["Target.", "Browser."];

export type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  sessionId?: string;
};

type CdpTarget = { id?: string; type?: string };

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
  private pageAttachPromise: Promise<void> | null = null;
  private pageSessionId: string | null = null;
  private closed = false;

  constructor(
    private readonly sandboxId: string,
    private readonly accessToken: string | null,
  ) {}

  private wsUrl(): string {
    const host = `${CDP_PORT}-${this.sandboxId}.${E2B_DOMAIN}`;
    return `wss://${host}/`;
  }

  private cdpHttpBase(): string {
    return `https://${CDP_PORT}-${this.sandboxId}.${E2B_DOMAIN}`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.accessToken) h["X-Access-Token"] = this.accessToken;
    return h;
  }

  private isBrowserLevel(method: string): boolean {
    return BROWSER_LEVEL_PREFIXES.some((prefix) => method.startsWith(prefix));
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

      ws.onerror = () => {
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

  private async fetchPageTargets(): Promise<CdpTarget[]> {
    try {
      const resp = await fetch(`${this.cdpHttpBase()}/json/list`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];
      const list = (await resp.json()) as CdpTarget[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /** Attach to an existing page target — mandatory before Page.* commands (G4). */
  async ensurePageAttached(): Promise<string> {
    if (this.pageSessionId) return this.pageSessionId;
    if (this.pageAttachPromise) return this.pageAttachPromise.then(() => this.pageSessionId!);

    this.pageAttachPromise = this.doAttachToPage();
    try {
      await this.pageAttachPromise;
      return this.pageSessionId!;
    } finally {
      this.pageAttachPromise = null;
    }
  }

  private async doAttachToPage(): Promise<void> {
    await this.connect();

    await this.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });

    const attachEvent = this.once("Target.attachedToTarget", 5_000).catch(() => null);

    const targets = await this.fetchPageTargets();
    for (const target of targets) {
      if (target.type !== "page" || !target.id) continue;
      try {
        const result = (await this.send("Target.attachToTarget", {
          targetId: target.id,
          flatten: true,
        })) as { sessionId?: string };
        if (result.sessionId) {
          this.pageSessionId = result.sessionId;
          break;
        }
      } catch {
        /* try next page target */
      }
    }

    if (!this.pageSessionId) {
      const params = (await attachEvent) as {
        sessionId?: string;
        targetInfo?: { type?: string };
      } | null;
      if (params?.sessionId && params.targetInfo?.type === "page") {
        this.pageSessionId = params.sessionId;
      }
    }

    if (!this.pageSessionId) {
      throw new Error(
        "CDP page attach failed — no page target session. Check Chrome is running in the sandbox.",
      );
    }

    await this.send("Page.enable", {}, this.pageSessionId);
    await this.send("Runtime.enable", {}, this.pageSessionId);
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<unknown> {
    await this.connect();
    const id = this.nextId++;
    const msg: CdpMessage = { id, method, params };

    const sid = sessionId ?? (this.isBrowserLevel(method) ? undefined : this.pageSessionId ?? undefined);
    if (sid) msg.sessionId = sid;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, CDP_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  /** Send a Page/Runtime command on the attached page session. */
  async sendOnPage(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const sessionId = await this.ensurePageAttached();
    return this.send(method, params, sessionId);
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

  getPageSessionId(): string | null {
    return this.pageSessionId;
  }

  close(): void {
    this.closed = true;
    this.pageSessionId = null;
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