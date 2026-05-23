/**
 * Convierte SVG de cartas a WebP optimizado.
 *
 * Uso:
 *   npm install -D sharp
 *   node scripts/optimize-card-images.mjs
 *
 * Origen:  front/public/cartas/*.svg
 * Destino: front/public/cartas-webp/*.webp
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '../public/cartas');
const OUT_DIR = path.join(__dirname, '../public/cartas-webp');

const WIDTH = Number(process.env.CARD_WEBP_WIDTH) || 360;
const QUALITY = Number(process.env.CARD_WEBP_QUALITY) || 82;

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Falta sharp. Ejecutá: npm install -D sharp');
  process.exit(1);
}

if (!fs.existsSync(SRC_DIR)) {
  console.error('No existe:', SRC_DIR);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const svgFiles = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.svg'));
if (!svgFiles.length) {
  console.error('No hay SVG en', SRC_DIR);
  process.exit(1);
}

const report = [];
let totalBefore = 0;
let totalAfter = 0;

for (const name of svgFiles) {
  const inputPath = path.join(SRC_DIR, name);
  const outName = name.replace(/\.svg$/i, '.webp');
  const outputPath = path.join(OUT_DIR, outName);
  const before = fs.statSync(inputPath).size;

  await sharp(inputPath, { density: 120 })
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4 })
    .toFile(outputPath);

  const after = fs.statSync(outputPath).size;
  totalBefore += before;
  totalAfter += after;
  const pct = before > 0 ? Math.round((1 - after / before) * 1000) / 10 : 0;
  report.push({
    file: name,
    beforeKb: Math.round((before / 1024) * 10) / 10,
    afterKb: Math.round((after / 1024) * 10) / 10,
    pct,
  });
}

report.sort((a, b) => b.beforeKb - a.beforeKb);

console.log('\n=== Optimización cartas SVG → WebP ===');
console.log('Origen:', SRC_DIR);
console.log('Destino:', OUT_DIR);
console.log(`Ancho máx: ${WIDTH}px | Calidad WebP: ${QUALITY}`);
console.log('Archivos:', svgFiles.length);
console.log(
  'Total antes:',
  Math.round(totalBefore / 1024),
  'KB → después:',
  Math.round(totalAfter / 1024),
  'KB',
  `(${Math.round((1 - totalAfter / totalBefore) * 1000) / 10}% reducción)`,
);
console.log('Promedio optimizado:', Math.round(totalAfter / svgFiles.length / 1024 * 10) / 10, 'KB/carta');
console.log('\nTop 10 reducciones (por peso original):');
for (const r of report.slice(0, 10)) {
  console.log(
    `  ${r.file}: ${r.beforeKb} KB → ${r.afterKb} KB (-${r.pct}%)`,
  );
}
const back = report.find((r) => r.file === 'card_back.svg');
if (back) {
  console.log(`\nDorso: ${back.beforeKb} KB → ${back.afterKb} KB`);
}
