#!/usr/bin/env node
/**
 * Render a ZipJeweler Instagram slide template to a 1080×1350 PNG.
 *
 * Usage:
 *   node templates/render.mjs <template.html> <data.json> <out.png>
 *
 * The template contains {{placeholder}} tokens; data.json supplies their values.
 * Values are HTML-escaped before substitution. Any {{token}} left without a data
 * key is replaced with an empty string. The frame element `.ig-frame` is captured
 * exactly, so the PNG is always 1080×1350 regardless of body chrome.
 *
 * Chromium: uses CHROMIUM_PATH or the pre-installed Playwright build.
 */
import { chromium } from "playwright-core";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXECUTABLE =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function main() {
  const [tplPath, dataPath, outPath] = process.argv.slice(2);
  if (!tplPath || !dataPath || !outPath) {
    console.error("usage: render.mjs <template.html> <data.json> <out.png>");
    process.exit(1);
  }

  let html = await readFile(tplPath, "utf8");
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  // Substitute provided keys (escaped), then blank any leftover tokens.
  for (const [k, v] of Object.entries(data)) {
    html = html.split(`{{${k}}}`).join(esc(v));
  }
  html = html.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, "");

  // Write the resolved HTML beside the template so ./assets/... still resolves.
  const tmp = path.join(path.dirname(path.resolve(tplPath)), ".render.tmp.html");
  await writeFile(tmp, html);

  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox", "--force-color-profile=srgb"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 2, // retina-crisp; IG downsamples fine
    });
    await page.goto("file://" + tmp);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const frame = await page.$(".ig-frame");
    await frame.screenshot({ path: outPath });
    console.log(`✓ rendered ${outPath}`);
  } finally {
    await browser.close();
    await unlink(tmp).catch(() => {});
  }
}

await main();
