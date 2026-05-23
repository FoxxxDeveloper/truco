/**
 * node scripts/audit-card-svg-sizes.mjs
 * Resume tamaño de SVG de cartas (diagnóstico paint).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../public/cartas');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));

let total = 0;
const rows = files.map((name) => {
  const bytes = fs.statSync(path.join(dir, name)).size;
  total += bytes;
  return { name, kb: Math.round((bytes / 1024) * 10) / 10 };
});
rows.sort((a, b) => b.kb - a.kb);

console.log('Cartas SVG:', files.length, 'archivos');
console.log('Total:', Math.round(total / 1024), 'KB (', Math.round(total / files.length), 'B promedio)');
console.log('Top 5 más pesados:');
for (const r of rows.slice(0, 5)) console.log(' ', r.name, r.kb, 'KB');
