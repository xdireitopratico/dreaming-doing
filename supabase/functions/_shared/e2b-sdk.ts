/** Lazy E2B SDK — import estático de npm:e2b derrubava o worker no boot da Edge Function. */

export type E2BSandboxInstance = {
  sandboxId: string;
  commands: {
    run: (
      command: string,
      opts?: { cwd?: string; timeoutMs?: number },
    ) => Promise<{ exitCode?: number; stdout?: string; stderr?: string }>;
  };
  files: {
    write: (payload: Array<{ path: string; data: string }>) => Promise<void>;
  };
  getHost: (port: number) => string;
  kill: () => Promise<void>;
};

export type E2BSandboxApi = {
  create: (
    template: string,
    opts: {
      apiKey: string;
      timeoutMs?: number;
      network?: { maskRequestHost?: string };
    },
  ) => Promise<E2BSandboxInstance>;
  connect: (sandboxId: string, opts: { apiKey: string }) => Promise<E2BSandboxInstance>;
};

let cached: E2BSandboxApi | null = null;

export async function getE2BSandboxApi(): Promise<E2BSandboxApi> {
  if (cached) return cached;
  const mod = await import("npm:e2b@2.14.1");
  cached = mod.Sandbox as E2BSandboxApi;
  return cached;
}