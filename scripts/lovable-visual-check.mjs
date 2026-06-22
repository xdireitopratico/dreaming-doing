#!/usr/bin/env node
/**
 * Prova paridade Lovable no browser — screenshots de cada fixture vs prints.
 * Uso: node scripts/lovable-visual-check.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../.lovable-screenshots");
const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const FIXTURES = ["img4", "img5", "img8", "img9", "img14", "img15"];

const EXPECT = {
  img4: { jobCard: 1, working: 1, narration: 1, showMore: 1 },
  img5: { jobCard: 1, working: 1, edited: 1 },
  img8: { jobCard: 1, working: 1, edited: 1 },
  img9: { jobCard: 1, working: 1, runningCommand: 1, activeTask: 1 },
  img14: { jobCard: 0, planDock: 1, planDockCta: 1 },
  img15: { jobCard: 0, planDock: 1, userBubble: 1, showMore: 1 },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 440, height: 900 } });

  const failures = [];

  for (const id of FIXTURES) {
    await page.goto(`${BASE}/dev/lovable-chat`, { waitUntil: "networkidle" });
    await page.click(`[data-fixture="${id}"]`);
    await page.waitForTimeout(400);

    const counts = {
      jobCard: await page.locator("[data-testid=chat-job-card]").count(),
      working: await page.locator("[data-testid=chat-working-line]").count(),
      narration: await page.locator("[data-testid=chat-narration]").count(),
      edited: await page.locator(".forge-mini-card-badge--edited-tag").count(),
      runningCommand: await page.locator(".forge-mini-card-header-line--command").count(),
      planDock: await page.locator("[data-testid=chat-plan-dock-ready]").count(),
      planDockCta: await page.locator(".forge-plan-prompt-cta").count(),
      userBubble: await page.locator("[data-testid=chat-message-user]").count(),
      showMore: await page.locator(".forge-msg-user-show-more").count(),
      activeTask: await page.locator('.forge-task-item[data-status="active"]').count(),
    };

    const exp = EXPECT[id];
    for (const [key, want] of Object.entries(exp)) {
      if ((counts[key] ?? 0) !== want) {
        failures.push(`${id}: ${key} expected ${want}, got ${counts[key] ?? 0}`);
      }
    }

    await page.screenshot({ path: resolve(OUT, `${id}.png`), fullPage: true });
    console.log(`✓ screenshot ${id}.png`, counts);
  }

  await browser.close();

  if (failures.length) {
    console.error("\nFALHAS:");
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`\nOK — screenshots em ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});