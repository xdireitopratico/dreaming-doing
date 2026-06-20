/**
 * playwright-automation.ts — Script Playwright para extração completa de DesignDNA.
 *
 * Enviado ao sandbox E2B via prometheus-tool-executor.
 * Faz extração full-page: scroll completo, CSS computado, motion traces,
 * captura de screenshots multi-segmento.
 *
 * Retorna JSON com:
 *   - markdown: texto completo da página
 *   - css_computed: estilos computados do hero + componentes
 *   - motion_traces: animações e transições detectadas
 *   - screenshots: array de screenshots base64 (viewports sucessivos)
 */

export function buildPlaywrightScript(url: string): string {
  const escapedUrl = url.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  return `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    locale: 'en-US',
    extraHTTPHeaders: { 'User-Agent': 'AetherForge/1.0 (design-dna-extraction)' }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  // ── 1. Navegação ──────────────────────────────────────────────
  await page.goto('${escapedUrl}', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // ── 2. Espera conteúdo carregar ───────────────────────────────
  await page.waitForLoadState('domcontentloaded');

  // Espera fonts carregarem
  await page.evaluate(() => document.fonts.ready);

  // Espera imagens principais (hero, primeira section)
  await page.waitForTimeout(2000);

  // ── 3. Scroll completo para trigger lazy-load ─────────────────
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = 720;
  const scrollSteps = Math.min(Math.ceil(scrollHeight / viewportHeight) + 2, 30);

  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * viewportHeight);
    await page.waitForTimeout(400);
  }

  // Volta ao topo
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // ── 4. Extrai screenshots (segmentos de viewport) ─────────────
  const screenshots = [];
  for (let i = 0; i < scrollSteps; i += 2) {
    await page.evaluate((y) => window.scrollTo(0, y), i * viewportHeight);
    await page.waitForTimeout(200);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    screenshots.push(buf.toString('base64'));
  }

  // Volta ao topo
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // ── 5. Extrai texto completo ──────────────────────────────────
  const fullText = await page.evaluate(() => document.body.innerText || '');

  // ── 6. Extrai markdown enriquecido (headings, links, etc.) ────
  const enrichedMarkdown = await page.evaluate(() => {
    const parts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const tag = el.tagName?.toLowerCase();
      const text = el.textContent?.trim();
      if (!text) continue;
      if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
        parts.push('\\n' + '#'.repeat(parseInt(tag[1])) + ' ' + text + '\\n');
      } else if (tag === 'a') {
        const href = el.href;
        if (href) parts.push('[' + text + '](' + href + ')');
      } else if (tag === 'img') {
        const alt = el.alt;
        const src = el.src;
        if (src) parts.push('![${alt || 'image'}](' + src + ')');
      }
    }
    return parts.join('\\n').slice(0, 50000);
  });

  const combinedMarkdown = (enrichedMarkdown || fullText).slice(0, 50000);

  // ── 7. Extrai CSS computado (hero + sections principais) ──────
  const computedStyles = await page.evaluate(() => {
    const sections = document.querySelectorAll(
      'section, header, [class*="hero"], [class*="banner"], [class*="showcase"], ' +
      '[class*="feature"], [class*="testimonial"], [class*="cta"], [class*="footer"]'
    );
    if (sections.length === 0) {
      const cs = window.getComputedStyle(document.body);
      return JSON.stringify([{
        tag: 'body',
        styles: {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          color: cs.color,
          background: cs.background.slice(0, 500),
        }
      }], null, 2);
    }

    const data = [];
    sections.forEach((el, i) => {
      if (i >= 15) return;
      const cs = window.getComputedStyle(el);
      data.push({
        tag: el.tagName?.toLowerCase(),
        id: el.id || undefined,
        classes: (el.className && typeof el.className === 'string')
          ? el.className.split(/\\s+/).filter(Boolean).slice(0, 10) : [],
        styles: {
          display: cs.display,
          position: cs.position,
          gridTemplateColumns: cs.gridTemplateColumns || undefined,
          gridTemplateRows: cs.gridTemplateRows || undefined,
          gap: cs.gap || undefined,
          padding: cs.padding,
          margin: cs.margin,
          background: cs.background.slice(0, 500),
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          letterSpacing: cs.letterSpacing,
          lineHeight: cs.lineHeight,
          textTransform: cs.textTransform,
          color: cs.color,
          opacity: cs.opacity,
          transform: cs.transform,
          transition: cs.transition,
          animation: cs.animation.slice(0, 200),
          boxShadow: cs.boxShadow || undefined,
          backdropFilter: cs.backdropFilter || undefined,
        }
      });
    });
    return JSON.stringify(data, null, 2);
  });

  // ── 8. Extrai motion traces ───────────────────────────────────
  const motionData = await page.evaluate(() => {
    const els = document.querySelectorAll(
      '[class*="animate"], [class*="transition"], [class*="parallax"], ' +
      '[class*="reveal"], [class*="fade"], [class*="slide"], [class*="scale"], ' +
      '[class*="stagger"], [class*="magnetic"], [class*="hover"], [data-aos], ' +
      '[data-animation], [class*="motion"]'
    );
    const traces = [];
    els.forEach((el, i) => {
      if (i >= 20) return;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      traces.push({
        tag: el.tagName?.toLowerCase(),
        class: (el.className && typeof el.className === 'string')
          ? el.className.split(/\\s+/).filter(Boolean).slice(0, 5) : [],
        id: el.id || undefined,
        visible: rect.width > 0 && rect.height > 0,
        position: { x: Math.round(rect.x), y: Math.round(rect.y) },
        size: { w: Math.round(rect.width), h: Math.round(rect.height) },
        transition: cs.transition || undefined,
        animation: cs.animation.slice(0, 300) || undefined,
        animationDuration: cs.animationDuration || undefined,
        animationDelay: cs.animationDelay || undefined,
        transform: cs.transform || undefined,
        transformStyle: cs.transformStyle || undefined,
        perspective: cs.perspective || undefined,
        willChange: cs.willChange || undefined,
      });
    });
    return JSON.stringify(traces, null, 2);
  });

  // ── 9. Extrai cores dominantes (CSS custom properties + inline) ─
  const colorData = await page.evaluate(() => {
    const colors = {};

    // CSS custom properties
    const sheets = document.styleSheets;
    for (const sheet of sheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.selectorText === ':root' || rule.selectorText === 'html') {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                colors[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch {}
    }

    // Inline style colors no body e sections
    const bodyCS = window.getComputedStyle(document.body);
    colors['--bg-body'] = bodyCS.backgroundColor;
    colors['--text-body'] = bodyCS.color;

    return JSON.stringify(colors, null, 2);
  });

  await browser.close();

  process.stdout.write(JSON.stringify({
    markdown: combinedMarkdown,
    css_computed: '[' + computedStyles.slice(1, -1) + ']',
    motion_traces: motionData,
    color_scheme: colorData,
    screenshots: screenshots,
    screenshot_count: screenshots.length,
    page_height: scrollHeight,
  }));
})();
`;
}
