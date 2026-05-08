import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ELENA = path.join(ROOT, 'img/elena-webp');
const EVENTO = path.join(ROOT, 'img/evento-live');
const OUT = path.join(import.meta.dirname, 'img');

await mkdir(OUT, { recursive: true });

// Elena portrait/lifestyle — keep aspect, max 1400px long side, webp 85
const elenaPhotos = [
  { src: path.join(ELENA, 'IMG_9822.webp'), out: 'elena-01.webp' }, // squat laterale dynamic
  { src: path.join(ELENA, 'IMG_9820.webp'), out: 'elena-02.webp' }, // lifestyle libro
  { src: path.join(ELENA, 'IMG_9823.webp'), out: 'elena-03.webp' }, // curl back
  { src: path.join(ELENA, 'IMG_9183.webp'), out: 'elena-04.webp' }, // close-up smile
  { src: path.join(ELENA, 'IMG_9184.webp'), out: 'elena-05.webp' }, // close-up alt
  { src: path.join(ELENA, 'IMG_9824.webp'), out: 'elena-06.webp' }, // elastico rosa
  { src: path.join(ELENA, 'IMG_9821.webp'), out: 'elena-08.webp' }, // affondo manubrio
  { src: path.join(ELENA, 'IMG_9825.webp'), out: 'elena-09.webp' }, // manubrio alza energy
];

for (const { src, out } of elenaPhotos) {
  await sharp(src)
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(path.join(OUT, out));
  console.log(`✓ ${out}`);
}

// Event photos — square crop 1200×1200, webp 85, focus center
const eventoPhotos = [
  { src: path.join(EVENTO, 'DSC00024-Enhanced-NR.webp'), out: 'evento-01.webp' },
  { src: path.join(EVENTO, 'DSC00085-Enhanced-NR.webp'), out: 'evento-02.webp' },
  { src: path.join(EVENTO, 'DSC00100-Enhanced-NR.webp'), out: 'evento-03.webp' },
  { src: path.join(EVENTO, 'DSC00271-Enhanced-NR.webp'), out: 'evento-04.webp' },
];

for (const { src, out } of eventoPhotos) {
  await sharp(src)
    .resize({ width: 1200, height: 1200, fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toFile(path.join(OUT, out));
  console.log(`✓ ${out}`);
}

console.log(`\nDone. ${elenaPhotos.length + eventoPhotos.length} images written to ${OUT}`);
