#!/usr/bin/env python3
"""
sandbox-cdp-driver.py — browser hands inside E2B (localhost CDP only).

Invoked from VM worker via runInSandbox. Playwright connect_over_cdp to 127.0.0.1:9222.
Stdout: single JSON object.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import math
import sys
import urllib.request

from playwright.async_api import async_playwright

DEFAULT_CDP_PORT = 9222


def fetch_ws_url(cdp_port: int) -> str:
    with urllib.request.urlopen(
        f"http://127.0.0.1:{cdp_port}/json/version",
        timeout=8,
    ) as resp:
        data = json.loads(resp.read().decode())
    ws_url = data.get("webSocketDebuggerUrl")
    if not ws_url:
        raise RuntimeError(f"No webSocketDebuggerUrl: {json.dumps(data)}")
    return ws_url


async def with_page(cdp_port: int, fn):
    ws_url = fetch_ws_url(cdp_port)
    playwright = await async_playwright().start()
    browser = await playwright.chromium.connect_over_cdp(ws_url)
    try:
        context = browser.contexts[0] if browser.contexts else await browser.new_context(
            viewport={"width": 1280, "height": 720}
        )
        page = context.pages[0] if context.pages else await context.new_page()
        return await fn(page)
    finally:
        await browser.close()
        await playwright.stop()


async def run_action(payload: dict) -> dict:
    action = payload.get("action")
    cdp_port = int(payload.get("cdpPort", DEFAULT_CDP_PORT))

    if action == "navigate":
        url = payload["url"]
        timeout_ms = int(payload.get("timeoutMs", 60_000))

        async def do(page):
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            try:
                await page.wait_for_load_state("networkidle", timeout=10_000)
            except Exception:
                pass
            return {"success": True, "url": page.url}

        return await with_page(cdp_port, do)

    if action == "screenshot":
        # Viewport only — full page uses capture_page_segments (law L8).
        async def do(page):
            data = await page.screenshot(type="png", full_page=False)
            return {"base64": base64.b64encode(data).decode("ascii")}

        return await with_page(cdp_port, do)

    if action == "capture_page_segments":
        max_segments = int(payload.get("maxSegments", 50))

        async def do(page):
            metrics = await page.evaluate(
                """() => ({
                  scrollHeight: document.documentElement.scrollHeight,
                  viewportHeight: window.innerHeight,
                })"""
            )
            sh = int(metrics.get("scrollHeight") or 0)
            vh = max(int(metrics.get("viewportHeight") or 720), 1)
            num_segs = max(1, math.ceil(sh / vh))
            num_segs = min(num_segs, max_segments)

            segments = []
            step = sh // max(num_segs, 1)
            for i in range(num_segs):
                y = i * step
                await page.evaluate("(y) => window.scrollTo(0, y)", y)
                await asyncio.sleep(0.3)
                data = await page.screenshot(type="png", full_page=False)
                segments.append(
                    {
                        "segmentIndex": i,
                        "scrollY": y,
                        "base64": base64.b64encode(data).decode("ascii"),
                    }
                )

            await page.evaluate("() => window.scrollTo(0, 0)")
            await asyncio.sleep(0.2)

            return {
                "segments": segments,
                "scrollHeight": sh,
                "viewportHeight": vh,
                "segmentCount": len(segments),
            }

        return await with_page(cdp_port, do)

    if action == "get_url":

        async def do(page):
            return {"url": page.url}

        return await with_page(cdp_port, do)

    if action == "scroll":
        y = int(payload.get("y", 0))

        async def do(page):
            await page.evaluate("(y) => window.scrollTo(0, y)", y)
            return {"success": True}

        return await with_page(cdp_port, do)

    if action == "click":
        selector = payload["selector"]

        async def do(page):
            await page.click(selector, timeout=15_000)
            return {"success": True}

        return await with_page(cdp_port, do)

    if action == "type":
        selector = payload["selector"]
        text = payload["text"]

        async def do(page):
            await page.fill(selector, text, timeout=15_000)
            return {"success": True}

        return await with_page(cdp_port, do)

    if action == "evaluate":
        expression = payload["expression"]

        async def do(page):
            result = await page.evaluate(expression)
            return {"result": result}

        return await with_page(cdp_port, do)

    if action == "analyze":
        selector = payload["selector"]
        script = """
(selector) => {
  const el = document.querySelector(selector);
  if (!el) return { error: "Element not found: " + selector };
  return {
    tagName: el.tagName,
    text: (el.textContent || '').slice(0, 500),
    html: el.outerHTML.slice(0, 1000),
    rect: el.getBoundingClientRect(),
    styles: {
      color: getComputedStyle(el).color,
      fontSize: getComputedStyle(el).fontSize,
      fontFamily: getComputedStyle(el).fontFamily,
      backgroundColor: getComputedStyle(el).backgroundColor,
    },
  };
}
"""

        async def do(page):
            return await page.evaluate(script, selector)

        return await with_page(cdp_port, do)

    return {"error": f"unknown action: {action}"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True)
    args = parser.parse_args()
    payload = json.loads(args.payload)
    try:
        result = asyncio.run(run_action(payload))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()