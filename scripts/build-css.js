#!/usr/bin/env node
/**
 * Concatena i file CSS sorgente in css/main.css.
 *
 * Il sito è servito come HTML statico e ogni pagina linka solo css/main.css.
 * I file veri vivono in css/ (variables.css, base.css) e css/components/.
 * Questo script formalizza il bundling manuale per evitare drift tra i sorgenti
 * e il file generato.
 *
 * Uso:
 *   node scripts/build-css.js           # sovrascrive css/main.css
 *   node scripts/build-css.js --check   # non scrive, exit 1 se drift
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'css');
const OUT = path.join(CSS_DIR, 'main.css');

// Ordine del bundle. Corrisponde all'ordine storico di css/main.css.
// Modifica QUI per aggiungere/riordinare file.
const MANIFEST = [
  'variables.css',
  'base.css',
  'components/navigation.css',
  'components/buttons.css',
  'components/hero.css',
  'components/letter.css',
  'components/team.css',
  'components/method.css',
  'components/programs.css',
  'components/transformations.css',
  'components/faq.css',
  'components/social.css',
  'components/video.css',
  'components/press.css',
  'components/footer.css',
  'components/modal.css',
  'components/pages.css',
  'components/react-mobile-header.css',
  'components/react-mobile-hero.css',
  'components/dark-immersive.css',
  'components/landing.css',
  'components/shop.css',
  'components/webinar-coach.css',
  'components/newsletter-popup.css',
];

function build() {
  const checkOnly = process.argv.includes('--check');

  const parts = ['/* Elena Giordani - Bundled CSS */\n'];

  for (const rel of MANIFEST) {
    const full = path.join(CSS_DIR, rel);
    if (!fs.existsSync(full)) {
      console.error(`[build-css] Missing source file: ${rel}`);
      process.exit(1);
    }
    const content = fs.readFileSync(full, 'utf8');
    parts.push(`\n/* === ${rel} === */\n${content}`);
  }

  const output = parts.join('');
  const sizeKB = (Buffer.byteLength(output) / 1024).toFixed(1);

  if (checkOnly) {
    const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (existing === output) {
      console.log(`[build-css] OK: css/main.css is in sync (${sizeKB} KB)`);
      return;
    }
    console.error(`[build-css] DRIFT: css/main.css does not match concatenation of sources.`);
    console.error('[build-css] Run `npm run build:css` to regenerate (verifica la resa visiva dopo!).');
    process.exit(1);
  }

  fs.writeFileSync(OUT, output);
  console.log(`[build-css] Wrote ${OUT} (${MANIFEST.length} files, ${sizeKB} KB)`);
}

build();
