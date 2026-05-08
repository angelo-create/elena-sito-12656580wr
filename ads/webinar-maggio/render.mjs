import puppeteer from 'puppeteer';
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = import.meta.dirname;
const OUT = path.join(ROOT, 'output');
await mkdir(OUT, { recursive: true });

const files = (await readdir(ROOT))
  .filter((f) => /^ad-\d+.*\.html$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('No ad-*.html files found.');
  process.exit(1);
}

console.log(`Rendering ${files.length} ads at 1080×1080 @2x...`);

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 1080, height: 1080, deviceScaleFactor: 2 },
});

const page = await browser.newPage();

const start = Date.now();
for (const file of files) {
  const t = Date.now();
  const url = pathToFileURL(path.join(ROOT, file)).href;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  // Small extra wait to ensure paint complete after fonts swap
  await new Promise((r) => setTimeout(r, 200));
  const outName = file.replace(/\.html$/, '.png');
  await page.screenshot({
    path: path.join(OUT, outName),
    type: 'png',
    clip: { x: 0, y: 0, width: 1080, height: 1080 },
  });
  console.log(`  ✓ ${outName}  (${Date.now() - t}ms)`);
}

await browser.close();
console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s. Output → ${OUT}`);
