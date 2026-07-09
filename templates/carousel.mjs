#!/usr/bin/env node
/**
 * Render a whole ZipJeweler carousel (or single slide set) to numbered PNGs.
 *
 * Usage:
 *   node templates/carousel.mjs <carousel.json> <outDir> [prefix]
 *
 * carousel.json: { "slides": [ { "template": "slide-cover.html", "data": {…} }, … ] }
 * Produces <outDir>/<prefix>-1.png … -N.png (prefix defaults to the json basename).
 * Prints a JSON array of the written paths on the last line (for the poster).
 *
 * One Chromium launch for the whole set. Templates resolve ./assets/* and
 * ../media/* relative to the templates/ dir, so slides render with fonts + real
 * screenshots. Chromium: CHROMIUM_PATH or the pre-installed Playwright build.
 */
import { chromium } from "playwright-core";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXECUTABLE =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TPL_DIR = path.dirname(new URL(import.meta.url).pathname);

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fill(html, data) {
  for (const [k, v] of Object.entries(data || {})) {
    html = html.split(`{{${k}}}`).join(esc(v));
  }
  return html.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, "");
}

async function main() {
  const [defPath, outDir, prefixArg] = process.argv.slice(2);
  if (!defPath || !outDir) {
    console.error("usage: carousel.mjs <carousel.json> <outDir> [prefix]");
    process.exit(1);
  }
  const def = JSON.parse(await readFile(defPath, "utf8"));
  const prefix = prefixArg || path.basename(defPath, ".json");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox", "--force-color-profile=srgb"],
  });
  const written = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 2,
    });
    for (let i = 0; i < def.slides.length; i++) {
      const slide = def.slides[i];
      const tpl = await readFile(path.join(TPL_DIR, slide.template), "utf8");
      const html = fill(tpl, slide.data);
      const tmp = path.join(TPL_DIR, ".render.tmp.html");
      await writeFile(tmp, html);
      await page.goto("file://" + tmp);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const out = path.join(outDir, `${prefix}-${i + 1}.png`);
      await (await page.$(".ig-frame")).screenshot({ path: out });
      written.push(out);
      await unlink(tmp).catch(() => {});
      console.error(`✓ slide ${i + 1}/${def.slides.length} → ${out}`);
    }
  } finally {
    await browser.close();
  }
  // Machine-readable result on stdout (last line).
  console.log(JSON.stringify(written));
}

await main();
