// Bundle-Budget: summiert die gzip-Groesse des Initial-JS (nach `pnpm build`) und bricht bei Ueberschreitung ab.
// Initial-JS = Skripte, die dist/index.html per <script type="module"> und <link rel="modulepreload"> laedt.
// Lazy-Chunks (Spielfeld samt PixiJS, Editor, Solver-Worker, ...) werden nicht mitgezaehlt.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Budget in Bytes: 95 kB = 95 000 Bytes (wie in der Ausgabe von Vite, 1 kB = 1000 Bytes).
 * Ist-Stand etwa 78 kB, seit Spielfeld und PixiJS erst beim Levelstart geladen werden.
 */
const BUDGET_BYTES = 95_000;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error('dist/index.html fehlt: zuerst `pnpm build` ausfuehren.');
  process.exit(1);
}

/** Alle Tags der Form <tag ...> mit dem Attribut `attr` (Wert -> Pfad relativ zu dist). */
function urls(tag, filter, attr) {
  const out = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))) {
    if (!filter.test(m[0])) continue;
    const value = new RegExp(`\\b${attr}="([^"]+)"`).exec(m[0]);
    if (value?.[1]) out.push(value[1]);
  }
  return out;
}

const refs = [
  ...urls('script', /type="module"/, 'src'),
  ...urls('link', /rel="modulepreload"/, 'href'),
];
const files = [
  ...new Set(refs.map((u) => u.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\/+/, ''))),
];

const base = (process.env.VITE_BASE ?? '/').replace(/^\/+|\/+$/g, '');
const rows = [];
for (const f of files) {
  const rel = base && f.startsWith(`${base}/`) ? f.slice(base.length + 1) : f;
  let buf;
  try {
    buf = readFileSync(join(dist, rel));
  } catch {
    console.error(`Chunk fehlt: dist/${rel}`);
    process.exit(1);
  }
  rows.push({ file: rel, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length });
}
if (rows.length === 0) {
  console.error('Keine Initial-Skripte in dist/index.html gefunden.');
  process.exit(1);
}

const kb = (n) => `${(n / 1000).toFixed(2)} kB`;
const width = Math.max(...rows.map((r) => r.file.length), 'Datei'.length);
console.log(`${'Datei'.padEnd(width)}  ${'roh'.padStart(11)}  ${'gzip'.padStart(11)}`);
for (const r of rows) {
  console.log(`${r.file.padEnd(width)}  ${kb(r.raw).padStart(11)}  ${kb(r.gzip).padStart(11)}`);
}
const total = rows.reduce((s, r) => s + r.gzip, 0);
const totalRaw = rows.reduce((s, r) => s + r.raw, 0);
console.log(`${'Summe'.padEnd(width)}  ${kb(totalRaw).padStart(11)}  ${kb(total).padStart(11)}`);
console.log(`Budget: ${kb(BUDGET_BYTES)} gzip (Initial-JS)`);

if (total > BUDGET_BYTES) {
  console.error(`Bundle-Budget ueberschritten: ${kb(total)} > ${kb(BUDGET_BYTES)}.`);
  process.exit(1);
}
console.log('Bundle-Budget eingehalten.');
