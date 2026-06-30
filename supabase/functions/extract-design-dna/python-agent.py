"""
python-agent.py — Deep Design DNA extraction agent.

Connects to Chrome via CDP (port 9222, already running from template start command).
Extracts CSS, animations, screenshots, and page content.
Outputs JSON to stdout.

Usage (inside E2B sandbox):
  python3.11 /path/to/python-agent.py --url https://example.com [--cdp-port 9222] [--timeout 60]

Depends on: playwright (Python package, pre-installed in template)
"""

import argparse
import asyncio
import base64
import json
import os
import sys
import traceback
from urllib.parse import urlparse

from playwright.async_api import async_playwright


EXTRACTION_CATEGORIES = [
    "color",
    "typography",
    "components",
    "motion",
    "interactions",
    "hero",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Deep Design DNA extraction agent")
    parser.add_argument("--url", required=True, help="Target URL to extract design from")
    parser.add_argument("--cdp-port", type=int, default=9222, help="Chrome DevTools Protocol port")
    parser.add_argument("--timeout", type=int, default=120, help="Navigation timeout in seconds")
    parser.add_argument("--output-file", help="Write JSON output to file instead of stdout")
    return parser.parse_args()


async def get_ws_endpoint(cdp_port: int) -> str:
    """Get WebSocket debug URL from Chrome DevTools Protocol."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"http://127.0.0.1:{cdp_port}/json/version", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        ws_url = data.get("webSocketDebuggerUrl")
        if not ws_url:
            raise RuntimeError(f"No webSocketDebuggerUrl in CDP response: {json.dumps(data, indent=2)}")
        return ws_url


def css_var_name_to_js(name: str) -> str:
    """Convert CSS custom property name to valid JS property name."""
    return name.replace("--", "").replace("-", "_")


def build_element_sampler_js() -> str:
    """Build JavaScript that samples design-relevant elements and returns their computed styles."""
    return """
() => {
  const results = {
    colors: {},
    typography: {},
    spacing: {},
    css_custom_properties: {},
    animations: [],
    transitions: [],
    layout_classes: [],
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      scrollHeight: document.documentElement.scrollHeight,
    }
  };

  // Collect CSS custom properties from :root
  const rootStyle = getComputedStyle(document.documentElement);
  for (let i = 0; i < rootStyle.length; i++) {
    const name = rootStyle[i];
    if (name.startsWith('--')) {
      results.css_custom_properties[name] = rootStyle.getPropertyValue(name).trim();
    }
  }

  // Sample design-relevant elements
  const selectors = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'a', 'button', '.btn', '.button', '[class*="btn"]',
    'nav', 'header', 'footer', 'section', 'main', 'article',
    'img', 'svg', 'video', 'canvas',
    '[class*="hero"]', '[class*="banner"]', '[class*="card"]',
    '[class*="container"]', '[class*="wrapper"]',
    'input', 'select', 'textarea', 'label',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  ];

  const sampled = new Set();

  for (const sel of selectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      if (sampled.has(el) || !el.isConnected) continue;
      sampled.add(el);

      const cs = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const cls = el.className ? el.className.slice(0, 120) : '';
      const id = el.id || '';
      const key = `${tag}${id ? '#'+id : ''}${cls ? '.'+cls.replace(/\\s+/g, '.') : ''}`;

      if (!results.colors[tag]) {
        results.colors[tag] = {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          borderColor: cs.borderColor,
          fill: cs.fill,
          stroke: cs.stroke,
        };
      }

      if (!results.typography[tag]) {
        results.typography[tag] = {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          textTransform: cs.textTransform,
          textDecoration: cs.textDecoration,
        };
      }

      if (!results.spacing[tag]) {
        results.spacing[tag] = {
          margin: cs.margin,
          padding: cs.padding,
          gap: cs.gap,
        };
      }
    }
  }

  // Extract layout classes from key structural elements
  const layoutSelectors = ['body > *', 'main', 'section', 'div[class*="grid"]', 'div[class*="flex"]'];
  for (const sel of layoutSelectors) {
    try {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const cs = getComputedStyle(el);
        results.layout_classes.push({
          tag: el.tagName.toLowerCase(),
          classes: (el.className || '').slice(0, 200),
          display: cs.display,
          gridTemplateColumns: cs.gridTemplateColumns,
          gridTemplateRows: cs.gridTemplateRows,
          gap: cs.gap,
          flexDirection: cs.flexDirection,
          flexWrap: cs.flexWrap,
          justifyContent: cs.justifyContent,
          alignItems: cs.alignItems,
          width: cs.width,
          maxWidth: cs.maxWidth,
        });
      }
    } catch(e) {}
  }

  // Collect all animation rules from stylesheets
  try {
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            results.animations.push({
              name: rule.name,
              keyframes: Array.from(rule.cssRules).map(kf => ({
                key: kf.keyText,
                style: kf.style.cssText
              }))
            });
          }
          if (rule.type === CSSRule.STYLE_RULE && rule.style) {
            const anim = rule.style.animationName || '';
            const trans = rule.style.transitionProperty || '';
            if (anim && anim !== 'none') {
              results.animations.push({
                selector: rule.selectorText,
                animationName: anim,
                animationDuration: rule.style.animationDuration,
                animationTimingFunction: rule.style.animationTimingFunction,
                animationIterationCount: rule.style.animationIterationCount,
              });
            }
            if (trans && trans !== 'none') {
              results.transitions.push({
                selector: rule.selectorText,
                transitionProperty: trans,
                transitionDuration: rule.style.transitionDuration,
                transitionTimingFunction: rule.style.transitionTimingFunction,
                transitionDelay: rule.style.transitionDelay,
              });
            }
          }
        }
      } catch(e) { /* CORS-blocked stylesheet */ }
    }
  } catch(e) {}

  return results;
}
"""


async def extract_page_markdown(page) -> str:
    """Extract visible page text as markdown-like content."""
    return await page.evaluate("""
() => {
  function walk(node, depth = 0) {
    if (!node || node.nodeType === Node.COMMENT_NODE) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      return text ? text + ' ' : '';
    }
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    let result = '';

    if (tag === 'script' || tag === 'style' || tag === 'noscript') return '';
    if (['br', 'hr'].includes(tag)) return '\\n';

    if (node.classList && (node.classList.contains('hidden') || node.hidden)) return '';

    const style = node.style || {};
    if (style.display === 'none' || style.visibility === 'hidden') return '';

    for (const child of node.childNodes) {
      result += walk(child, depth + 1);
    }

    if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
      return '\\n' + '#'.repeat(parseInt(tag[1])) + ' ' + result.trim() + '\\n\\n';
    }
    if (tag === 'p') return result.trim() + '\\n\\n';
    if (tag === 'li') return '- ' + result.trim() + '\\n';
    if (['ul', 'ol'].includes(tag)) return '\\n' + result + '\\n';
    if (tag === 'a') {
      const href = node.href || '';
      return href ? `[${result.trim()}](${href}) ` : result;
    }
    if (tag === 'img') {
      const alt = node.alt || '';
      const src = node.src || '';
      return src ? `![${alt}](${src}) ` : '';
    }
    if (tag === 'blockquote') return '> ' + result.trim() + '\\n\\n';
    if (tag === 'code') return '`' + result.trim() + '`';
    if (tag === 'pre') return '```\\n' + result.trim() + '\\n```\\n\\n';
    if (tag === 'strong' || tag === 'b') return '**' + result.trim() + '**';
    if (tag === 'em' || tag === 'i') return '*' + result.trim() + '*';

    return result;
  }

  const bodyText = walk(document.body);
  return bodyText.replace(/\\n{3,}/g, '\\n\\n').trim();
}
""")


async def extract_design_dna(url: str, cdp_port: int, timeout_secs: int) -> dict:
    """Main extraction function."""
    ws_endpoint = await get_ws_endpoint(cdp_port)
    print(f"[agent] Connected to CDP: {ws_endpoint[:80]}...", file=sys.stderr)

    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(ws_endpoint)
        context = browser.contexts[0] if browser.contexts else await browser.new_context(
            viewport={"width": 1280, "height": 720},
            device_scale_factor=2,
            locale="en-US",
            extra_http_headers={"User-Agent": "AetherForge/1.0 (design-dna-extraction)"},
        )
        page = context.pages[0] if context.pages else await context.new_page()
        page.set_default_timeout(timeout_secs * 1000)

        print(f"[agent] Navigating to {url}", file=sys.stderr)
        await page.goto(url, wait_until="networkidle", timeout=timeout_secs * 1000)
        await page.wait_for_load_state("domcontentloaded")
        await page.evaluate("document.fonts.ready")
        await asyncio.sleep(2)

        # Scroll to lazy-load content
        print(f"[agent] Scrolling to trigger lazy loading", file=sys.stderr)
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1)
        await page.evaluate("window.scrollTo(0, 0)")
        await asyncio.sleep(0.5)

        extracted = {
            "url": url,
            "extracted_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }

        # 1. Markdown from page
        print(f"[agent] Extracting page markdown", file=sys.stderr)
        extracted["markdown"] = await extract_page_markdown(page)

        # 2. Element samples (colors, typography, spacing)
        print(f"[agent] Sampling elements", file=sys.stderr)
        sampler_js = build_element_sampler_js()
        samples = await page.evaluate(sampler_js)
        extracted["colors"] = samples.get("colors", {})
        extracted["typography"] = samples.get("typography", {})
        extracted["spacing"] = samples.get("spacing", {})
        extracted["css_custom_properties"] = samples.get("css_custom_properties", {})
        extracted["animations"] = samples.get("animations", [])
        extracted["transitions"] = samples.get("transitions", [])
        extracted["layout_classes"] = samples.get("layout_classes", [])
        extracted["viewport"] = samples.get("viewport", {})

        # 3. Screenshots
        print(f"[agent] Taking screenshots", file=sys.stderr)
        viewport_screenshot = await page.screenshot(full_page=False, type="png")
        extracted["screenshot_base64"] = base64.b64encode(viewport_screenshot).decode("utf-8")

        fullpage_screenshot = await page.screenshot(full_page=True, type="png")
        extracted["screenshot_full_base64"] = base64.b64encode(fullpage_screenshot).decode("utf-8")

        # 4. Segment screenshots (scroll segments for high-res capture)
        print(f"[agent] Taking segment screenshots", file=sys.stderr)
        viewport_height = extracted["viewport"].get("height", 720)
        scroll_height = extracted["viewport"].get("scrollHeight", viewport_height)
        segments = []
        num_segments = min(5, max(1, scroll_height // viewport_height))
        segment_height = scroll_height // num_segments

        for i in range(num_segments):
            y = i * segment_height
            await page.evaluate(f"window.scrollTo(0, {y})")
            await asyncio.sleep(0.3)
            seg_bytes = await page.screenshot(full_page=False, type="png", clip={
                "x": 0, "y": 0,
                "width": min(1280, extracted["viewport"].get("width", 1280)),
                "height": min(segment_height, viewport_height),
            })
            segments.append(base64.b64encode(seg_bytes).decode("utf-8"))

        extracted["screenshots"] = segments

        print(f"[agent] Extraction complete", file=sys.stderr)
        return extracted


async def main():
    args = parse_args()
    try:
        data = await extract_design_dna(args.url, args.cdp_port, args.timeout)
        output = json.dumps(data, indent=2, ensure_ascii=False)
        if args.output_file:
            with open(args.output_file, "w") as f:
                f.write(output)
            print(json.dumps({"status": "ok", "output_file": args.output_file}))
        else:
            print(output)
    except Exception as e:
        error_info = {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc(),
        }
        print(json.dumps(error_info), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
