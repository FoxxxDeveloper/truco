/**
 * node scripts/audit-card-optimized-sizes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../public/cartas-webp');

if (!fs.existsSync(dir)) {
  console.error('No existe', dir, '— corré: node scripts/optimize-card-images.mjs');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'));
let total = 0;
const rows = files.map((name) => {
  const bytes = fs.statSync(path.join(dir, name)).size;
  total += bytes;
  return { name, kb: Math.round((bytes / 1024) * 10) / 10 };
});
rows.sort((a, b) => b.kb - a.kb);

console.log('Cartas WebP:', files.length, 'archivos');
console.log('Total:', Math.round(total / 1024), 'KB');
console.log('Promedio:', Math.round((total / files.length / 1024) * 10) / 10, 'KB');
const back = rows.find((r) => r.name === 'card_back.webp');
if (back) console.log('Dorso:', back.kb, 'KB');
console.log('Top 5 más pesados:');
for (const r of rows.slice(0, 5)) console.log(' ', r.name, r.kb, 'KB');
