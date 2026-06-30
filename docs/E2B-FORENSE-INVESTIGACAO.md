# Investigação Forense E2B — Design DNA Deep Extraction

**Data:** 2026-06-28  
**Propósito:** Base de conhecimento para arquitetura do Browser Full Manager  
**Status:** Completo — verificado contra documentação oficial E2B

---

## 0. A descoberta mais importante

A E2B tem um template pronto chamado **`kernel-browser`** que já vem com:

```
- Kernel SDK (cloud browser)
- Playwright
- Browser Use (pip install browser-use)
- Chromium (via Playwright)
```

Isso significa que **não precisamos construir um template customizado** para ter Browser Use + Playwright na sandbox. O template `kernel-browser` já tem.

A única coisa que precisamos fazer é:
1. Criar sandbox com template `kernel-browser`
2. Instalar Chromium: `npx playwright install chromium` (já tem Playwright, só baixar o browser)
3. Iniciar Chrome: `chromium --remote-debugging-port=9222 --no-sandbox` em background
4. Rodar o agente de extração

---

## 1. Processos persistentes em background

### 1.1 Como funciona

A E2B tem API nativa para processos background:

```python
from e2b import Sandbox

sandbox = Sandbox.create()

# Inicia Chrome em background — retorna imediatamente, Chrome continua rodando
process = sandbox.commands.run(
    "chromium --remote-debugging-port=9222 --no-sandbox --headless",
    background=True,
)
# process pode ser matado depois: process.kill()
```

### 1.2 Como usar na prática (no nosso código)

**Problema:** Nosso código atual (`e2b-client.ts`) usa uma API REST própria (`/bin/bash -c "comando"`) que é blocking — espera o comando terminar. Para Chrome persistente, precisamos do SDK oficial ou de um mecanismo de background.

**Opção A — SDK E2B oficial (recomendado):**
```typescript
import { Sandbox } from 'e2b';

const sandbox = await Sandbox.connect(sandboxId, { apiKey });
await sandbox.commands.run(
  'chromium --remote-debugging-port=9222 --no-sandbox --headless',
  { background: true }
);
```

**Opção B — API REST atual + `&` no shell:**
```bash
# Usando a API atual (runInSandbox) com nohup
nohup chromium --remote-debugging-port=9222 --no-sandbox --headless > /tmp/chrome.log 2>&1 &
```
Mas isso tem problema: o processo pode morrer quando o shell session termina.

**Opção C — Template com start command:**
```python
# Durante BUILD do template:
template.set_start_cmd(
    "chromium --remote-debugging-port=9222 --headless --no-sandbox",
    wait_for_port(9222)
)
# Quando sandbox é criada, Chrome JÁ ESTÁ RODANDO
```
Mas o start command roda durante o BUILD e é snapshotado. Env vars passadas via `Sandbox.create({envs})` NÃO estão disponíveis pro start command. Isso limita onde podemos injetar chaves de API.

**Veredito:** Opção A (SDK oficial) é a mais limpa. Mas nosso código atual usa API REST própria. Precisamos migrar para o SDK ou adaptar a API REST para suportar background.

### 1.3 Comandos no sandbox (SDK oficial)

```typescript
// SDK oficial (e2b npm package)
const sandbox = await Sandbox.create('kernel-browser', {
  envs: { LLM_API_KEY: '...' },
  timeoutMs: 600_000, // 10 min
  lifecycle: { onTimeout: 'pause', autoResume: true },
});

// Background (não bloqueia)
const chrome = await sandbox.commands.run(
  'chromium --remote-debugging-port=9222 --headless --no-sandbox',
  { background: true }
);

// Blocking (espera terminar)
const result = await sandbox.commands.run('python3 /tmp/extract.py', {
  timeoutMs: 300_000,
  envs: { TARGET_URL: 'https://livekit.com' },
});
console.log(result.stdout);

// Matar processo
await chrome.kill();
```

### 1.4 Como injetar env vars na sandbox

Três níveis:

| Nível | Escopo | Como fazer |
|-------|--------|------------|
| **Global** | Todas as execuções | `Sandbox.create({ envs: { KEY: "val" } })` |
| **Por comando** | Apenas aquele `run()` | `sandbox.commands.run("cmd", { envs: { KEY: "val" } })` |
| **Template build** | Durante build (snapshotado) | `template.set_envs({ KEY: "val" })` — mas não vê envs do create |

**Recomendação:** Passar chaves LLM via `Sandbox.create({ envs })`. Isso fica disponível para TODAS as execuções dentro da sandbox, inclusive scripts Python/Node.

```python
# Dentro da sandbox, o script Python lê:
import os
llm_api_key = os.environ["LLM_API_KEY"]
target_url = os.environ["TARGET_URL"]
```

---

## 2. Template `kernel-browser` — o que vem instalado

### 2.1 Pacotes pré-instalados

| Pacote | Versão | Uso |
|--------|--------|-----|
| `browser-use` | latest | Agent loop Python para controle de browser |
| `playwright` | latest | Browser automation (Node.js) |
| `kernel` (SDK) | latest | Cloud browser Kernel (opcional) |
| `chromium` | via playwright | Binary do Chrome |

### 2.2 O template NÃO inicia Chrome automaticamente

O template `kernel-browser` está configurado para usar **Kernel cloud browser** (browser roda na infra da Kernel, fora da sandbox). Se quisermos Chrome local, precisamos:

```
1. Sandbox cria com template kernel-browser
2. playwright install chromium  (se não vier, instala)
3. chromium --remote-debugging-port=9222 --no-sandbox --headless &
4. wait-for-port 9222
5. Conecta agente ao CDP local (connect_over_cdp)
```

### 2.3 Alternativa: só usar Kernel cloud browser

Kernel já resolve:
- Browser gerenciado (não precisa instalar/startar Chrome)
- Live view URL nativa (`browser.browser_live_view_url`)
- CAPTCHA solving
- Residential proxies
- Sessões persistentes (pause/resume via Kernel)

Mas a desvantagem:
- Requer `KERNEL_API_KEY` (mais um serviço)
- Browser roda fora da sandbox (latência de rede)
- Custo adicional

**Decisão a tomar:** Chrome local (self-managed) vs. Kernel cloud browser. O usuário disse "Browser Full Manager" e quer controle total. Chrome local é mais alinhado. Kernel é um atalho tentador mas adiciona dependência externa.

---

## 3. Auto-pause/resume com Chrome rodando

### 3.1 O que a E2B diz oficialmente

> "When you pause a sandbox, both the sandbox's filesystem and memory state will be saved. This includes all the files in the sandbox's filesystem and **all the running processes, loaded variables, data, etc.** "

Isso significa: se Chrome está rodando quando a sandbox pausa, quando resume, Chrome **volta a rodar** no mesmo estado.

### 3.2 Bug conhecido (#884) — filesystem persistence

Issue #884 (agosto 2025, fechado): **Mudanças no filesystem NÃO persistem após o SEGUNDO ciclo pause/resume.**

- 1º pause → resume: ✅ arquivos persistem
- 2º pause → resume: ❌ mudanças sumiram

**Impacto:** Se instalarmos pacotes (pip install, npm install) e depois a sandbox pausar/resumir duas vezes, os pacotes podem sumir.

**Mitigações possíveis:**
1. **Usar snapshots** (`sandbox.createSnapshot()`) depois de instalar tudo — snapshot é persistente. Criar sandbox a partir do snapshot.
2. **Volumes E2B** (private beta) — armazenamento persistente independente do ciclo de vida da sandbox.
3. **Instalar tudo sempre no início** (aceitar 2-3min de setup) — simples, funciona, só perde tempo se a sandbox pausar.
4. **Criar template customizado** — instalar durante o build (snapshotado para sempre).

### 3.3 Recomendação

**Usar template customizado.** Criar um template `dreaming-doing-deep-extract` que:
```
FROM ubuntu:22.04
RUN apt install -y python3 nodejs npm
RUN pip install browser-use playwright
RUN npx playwright install chromium
```

Build uma vez, snapshotado. Quando sandbox cria, já tem tudo instalado. Só precisa:
1. `chromium --remote-debugging-port=9222 --no-sandbox --headless &` (background)
2. Esperar porta 9222
3. Rodar agente

Isso elimina o bug #884 porque os pacotes estão no snapshot do template, não em mudanças pós-criação.

---

## 4. Browser Use — conexão CDP

### 4.1 Conectar a Chrome existente

```python
from browser_use import Browser

# Conecta a Chrome já rodando na porta 9222
browser = Browser(cdp_url="http://localhost:9222")
```

### 4.2 Agent loop

```python
from browser_use import Agent
from langchain_openai import ChatOpenAI

agent = Agent(
    task="Extract design system DNA from the page...",
    llm=ChatOpenAI(model="gpt-4o", api_key="..."),
    browser=browser,
    max_steps=30,
)
result = await agent.run()
# result.extracted() tem os dados estruturados
```

### 4.3 O que o Agent faz internamente

```
Loop do Browser Use:
  → 1. Tira screenshot da página atual
  → 2. Envia para o LLM com a task
  → 3. LLM decide: click, scroll, type, extract, ou done
  → 4. Executa a ação no browser via CDP
  → 5. Volta ao passo 1
  → Até max_steps ou LLM decide "done"
```

Isso é IDEAL para extração de DNA — o agente pode:
- Scrollar a página (trigger lazy loading)
- Clicar em tabs para ver diferentes estados
- Hover em elementos para ver interações
- Abrir DevTools para inspecionar CSS
- Extrair computed styles

### 4.4 Por que NÃO usar o Browser Use Agent para extrair CSS

O agent loop do Browser Use é bom para navegação e interação, mas para extrair CSS computed, motion traces, e design tokens, um script direto com Playwright é mais eficiente:

```python
# 1. Agent navega e interage (Browser Use)
await agent.run()  # max 10 steps para navegação

# 2. Extração técnica direta (Playwright)
from playwright.async_api import async_playwright

async with async_playwright() as p:
    browser = await p.chromium.connect_over_cdp("http://localhost:9222")
    page = browser.contexts[0].pages[0]
    
    # Extrai CSS custom properties
    css_vars = await page.evaluate("""() => {
        const styles = getComputedStyle(document.documentElement);
        const vars = {};
        for (let i = 0; i < styles.length; i++) {
            const prop = styles[i];
            if (prop.startsWith('--')) vars[prop] = styles.getPropertyValue(prop);
        }
        return vars;
    }""")
    
    # Extrai font faces
    fonts = await page.evaluate("""() => {
        return [...document.fonts].map(f => ({
            family: f.family,
            style: f.style,
            weight: f.weight,
        }));
    }""")
```

**Arquitetura final:**
1. Browser Use agent navega, interage, prepara a página
2. Playwright script extrai dados técnicos (CSS, motion, cores)
3. LLM processa e estrutura o DNA

---

## 5. Stagehand — conexão CDP

### 5.1 Conectar a Chrome existente (local)

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: {
    cdpUrl: "ws://localhost:9222",  // Conecta a Chrome já rodando
    viewport: { width: 1280, height: 720 },
  },
});
await stagehand.init();
```

### 5.2 Extract schema-driven

```typescript
import { z } from "zod";

const DNASchema = z.object({
  colors: z.array(z.object({
    hex: z.string(),
    role: z.string(),
  })),
  typography: z.object({
    fontStack: z.string(),
    scale: z.string(),
  }),
});

const result = await stagehand.extract({
  url: "https://livekit.com",
  schema: DNASchema,
  instructions: ["Extract design tokens from CSS"],
});
```

### 5.3 Connect URL (compartilhar browser entre Stagehand e Playwright)

```typescript
// Stagehand inicia
const stagehand = new Stagehand({ env: "LOCAL", ... });
await stagehand.init();

// Playwright se conecta ao mesmo browser via CDP
const browser = await chromium.connectOverCDP({
  wsEndpoint: stagehand.connectURL(),
});
```

### 5.4 Stagehand vs Browser Use — quando usar

| Critério | Browser Use (Python) | Stagehand (Node.js) |
|----------|---------------------|---------------------|
| Agent loop | ✅ Nativo (agent.run) | ✅ agent() method |
| Extract schema | ❌ Manual | ✅ Schema-driven (zod) |
| CDP connect | ✅ cdp_url param | ✅ cdpUrl/cdpUrl param |
| Live preview | ❌ (via Kernel) | ✅ (Browserbase Live View) |
| Runtime | Python | Node.js (nosso stack) |
| Maturação | Alta (23k stars) | Alta (22k stars) |
| Ideal para | Navegação complexa | Extração estruturada |

---

## 6. Coleta de resultado do agente

### 6.1 Método: stdout do comando

```typescript
// Edge function (Inngest)
const result = await sandbox.commands.run('python3 /tmp/extract.py', {
  timeoutMs: 300_000,
  envs: { ... }
});
const dna = JSON.parse(result.stdout); // Agente imprime JSON no stdout
```

**Vantagens:** Simples, direto, já funciona com nossa API atual.
**Desvantagens:** Payload limitado (stdout tem limite de tamanho).

### 6.2 Método: arquivo no filesystem

```python
# Dentro do agente na sandbox
import json
with open("/tmp/dna_result.json", "w") as f:
    json.dump(dna, f)
print("DONE")  # Sinaliza fim
```

```typescript
// Edge function lê o arquivo
const result = await sandbox.commands.run('cat /tmp/dna_result.json');
const dna = JSON.parse(result.stdout);
```

**Vantagens:** Sem limite de tamanho de stdout.
**Desvantagens:** Dois comandos (um pra executar, um pra ler).

### 6.3 Método: download via SDK

```typescript
// SDK oficial
const url = await sandbox.downloadUrl('/tmp/dna_result.json');
const response = await fetch(url);
const dna = await response.json();
```

**Vantagens:** Mais limpo.
**Desvantagens:** Requer SDK oficial, não nossa API REST atual.

### 6.4 Recomendação

Usar **stdout** para o primeiro protótipo (mais simples, compatível com API atual). Se o payload for grande (>100KB), migrar para **arquivo filesystem + leitura posterior**.

---

## 7. O que muda no código atual

### 7.1 `e2b-client.ts` — API REST vs SDK

**Hoje:** API REST própria com Connect protocol (286 linhas).
- Faz `/bin/bash -c "comando"` via chamada HTTP + WebSocket gRPC-ish
- Não suporta background nativamente
- Complexo, propenso a erros

**Depois:** Usar SDK oficial `e2b` npm package.
```typescript
import { Sandbox } from 'e2b';
const sandbox = await Sandbox.connect(sandboxId, { apiKey });
// background: true nativo
// files.read/write nativo
// downloadUrl nativo
```

**Risco:** SDK oficial pode não estar disponível no runtime Deno (Edge Functions). Verificar compatibilidade.

### 7.2 `run-design-dna.ts` — Orquestrador

**Mudança principal:**
```
ANTES:
  createSandbox → install Chromium (~2min) → execPlaywrightScript → llmExtractDNA

DEPOIS:
  createSandbox(kernel-browser) [template já tem tudo]
  → startChrome em background [5s]
  → waitForPort(9222) [3s]
  → writeAgentScript ao filesystem
  → runAgentScript(envs: {TARGET_URL, LLM_API_KEY}) [~180s]
  → readResult do stdout
  → save to design_system_library
```

### 7.3 `design-dna-extraction.ts` — Simplificação radical

```
ANTES: 933 linhas
  - loadWebSecrets
  - resolveLLMConfig
  - scrapeWebPage (Jina/HTTP)
  - execPlaywrightInSandbox
  - llmExtractDNA (openAiChat, anthropicChat, geminiChat)
  - buildFallbackDna
  - content hygiene

DEPOIS: ~150 linhas (só deep)
  - createAndRunAgentOnSandbox
  - parseResultAndSave
```

Shallow permanece separado (respeita config do usuário).

---

## 8. Riscos identificados na investigação

| # | Risco | Severidade | Evidência | Mitigação |
|---|-------|-----------|-----------|-----------|
| R1 | Bug #884: filesystem não persiste após 2º pause/resume | ALTA | Issue reportada e fechada, mas relato de reincidência em comentários | Template customizado (snapshot único, sem mudanças pós-criação) OU instalar tudo sempre (aceitar 2-3min) |
| R2 | SDK oficial `e2b` pode não funcionar no runtime Deno da Edge Function | MÉDIA | Deno não é Node.js; pode faltar APIs nativas | Verificar compatibilidade; alternativa: continuar com API REST + adaptar para background |
| R3 | Chrome `--headless` não renderiza WebGL/Canvas features | BAIXA | Chrome headless tem limitações de renderização | Usar `--headless=new` (modo mais completo, disponível desde Chrome 112) |
| R4 | Browser Use agent loop é lento (30 steps pode levar 5min) | ALTA | Cada step requer LLM call (round-trip ~2-6s) | Limitar `max_steps=15` para navegação; extração técnica via Playwright direto |
| R5 | LLM API key trafega pela sandbox (segurança) | MÉDIA | Env vars ficam visíveis dentro da sandbox | Sandbox é isolada por VM; key só visível para o processo do agente. Mesmo nível de segurança que código de usuário. |
| R6 | Template `kernel-browser` pode não ter Python/Node atualizados | BAIXA | Template versionado por tag | Testar com tag específica; build próprio se necessário |

---

## 9. Decisões arquiteturais a tomar

### Decisão 1: Template base

| Opção | Prós | Contras |
|-------|------|---------|
| **`kernel-browser`** (existente) | Já tem Browser Use + Playwright, zero build | Pode ter versões desatualizadas; Kernel SDK não usado |
| Template customizado | Controle total, snapshot imutável (sem bug #884) | Precisa BUILDAR e manter |
| `code-interpreter-v1` (atual) | Já usamos | Não tem nada instalado, ~2min de setup toda vez |

**Recomendação:** Template customizado `dreaming-doing-deep-extract`. Build único, snapshot permanente, sem bug #884.

### Decisão 2: Browser engine

| Opção | Prós | Contras |
|-------|------|---------|
| **Chrome local** (self-managed) | Controle total, sem dependência externa | Precisa instalar + iniciar |
| Kernel cloud browser | Gerenciado, live view, CAPTCHA | API key extra, latência, custo |

**Recomendação:** Chrome local. O usuário quer "Browser Full Manager" — controle total.

### Decisão 3: Agent framework

| Opção | Prós | Contras |
|-------|------|---------|
| **Browser Use** (Python) | Agent loop maduro, navegação inteligente | Python runtime, pip install |
| Stagehand (Node.js) | Extract schema-driven, nosso stack JS | Agent loop menos maduro que Browser Use |

**Recomendação:** Browser Use como primário. Stagehand como alternativa configurável pelo usuário.

### Decisão 4: SDK de comunicação

| Opção | Prós | Contras |
|-------|------|---------|
| **SDK oficial e2b** | background nativo, filesystem API, download URL | Pode não rodar em Deno |
| API REST atual (adaptada) | Já funciona, compatível Deno | Background precisa ser implementado |

**Recomendação:** Manter API REST atual por enquanto (já funciona). Adicionar suporte a background via `nohup` + shell script. Migrar para SDK oficial quando confirmar compatibilidade Deno.

---

## 10. Plano de ação (próximos passos concretos)

### 10.1 Prova de conceito (antes de qualquer código no repo)

1. **Testar template `kernel-browser` manualmente:**
   ```bash
   # Criar sandbox via CLI
   e2b sandbox create kernel-browser
   # Conectar via SSH
   e2b sandbox ssh <sandbox_id>
   # Verificar o que está instalado
   python3 -c "import browser_use; print(browser_use.__version__)"
   npx playwright --version
   ```

2. **Testar Chrome persistente com background:**
   ```bash
   # Dentro da sandbox
   chromium --remote-debugging-port=9222 --no-sandbox --headless &
   sleep 2
   curl http://localhost:9222/json/version
   # Verificar que CDP responde
   ```

3. **Testar Browser Use + CDP local:**
   ```python
   # Dentro da sandbox
   from browser_use import Browser
   browser = Browser(cdp_url="http://localhost:9222")
   # Navegar e extrair
   ```

4. **Validar auto-pause/resume:**
   ```
   Pausar sandbox → esperar 30s → resumir → verificar que Chrome ainda está rodando
   ```

### 10.2 Se PoC passar

5. **Criar template customizado** `dreaming-doing-deep-extract`
6. **Adaptar `e2b-client.ts`** para suportar background commands
7. **Reescrever `run-design-dna.ts`** com Browser Full Manager
8. **Criar agente Python de extração**

### 10.3 Se template customizado não for viável

Usar `code-interpreter-v1` + instalar tudo sempre. Aceitar 2-3min de setup a cada execução. A sandbox com auto-pause/resume reduz esse custo (instala uma vez, pause/resume mantém).

---

## 11. Referências

- [E2B Docs — Background Commands](https://e2b.mintlify.app/docs/commands/background)
- [E2B Docs — Environment Variables](https://e2b.mintlify.app/docs/sandbox/environment-variables)
- [E2B Docs — Template Start Command](https://e2b.mintlify.app/docs/template/start-ready-command)
- [E2B Docs — Public URL](https://e2b.mintlify.app/docs/network/public-url)
- [E2B Docs — Persistence](https://e2b.mintlify.app/docs/sandbox/persistence)
- [E2B Docs — Cloud Browser (Kernel)](https://e2b.mintlify.app/docs/use-cases/remote-browser)
- [Bug #884 — Persistence issue](https://github.com/e2b-dev/E2B/issues/884)
- [Browser Use — CDP Browser](https://www.mintlify.com/browser-use/browser-use/concepts/browser)
- [Stagehand — CDP Configuration](https://docs.stagehand.dev/v3/configuration/browser)
- [Playwright — connectOverCDP](https://playwright.dev/python/docs/api/class-browsertype)
