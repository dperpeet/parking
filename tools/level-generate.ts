// CLI: pnpm level:generate [--pack 01] [--config tools/pack-01.config.json] [--only 3,5] [--dry]
//      [--out dir]  (Zielordner, Default src/content/levels/pack-<pack>; z. B. zum Vergleichen)
// Erzeugt ein Level-Pack deterministisch aus einer Konfigurationsdatei (feste Seeds pro Level).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generate } from '../src/solver/generator';
import { arrowStats } from '../src/solver/generator-oneway';
import { PackIndex } from '../src/schema';
import { levelJob, readPackConfig } from './lib/pack-config';
import { loadRulesets } from './lib/rulesets';

const PAD = 3;
const PERCENT = 100;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const pack = arg('pack', '01');
const configPath = arg('config', `tools/pack-${pack}.config.json`);
const only = arg('only', '').split(',').filter(Boolean).map(Number);
const dry = process.argv.includes('--dry');
const config = readPackConfig(configPath);
const dir = arg('out', `src/content/levels/pack-${pack}`);
const rulesets = loadRulesets();
const world = config.world ?? Number(pack);
mkdirSync(dir, { recursive: true });

const ids: string[] = [];
let failures = 0;
console.log(
  'n   veh col slots vis  target  diff   rpw%   dead depth  matched attempts  mys blind% info% arr trn',
);
config.levels.forEach((entry, index) => {
  const n = index + 1;
  const file = String(n).padStart(PAD, '0');
  ids.push(file);
  if (entry.keep || (only.length > 0 && !only.includes(n))) {
    console.log(`${String(n).padEnd(3)} kept ${file}`);
    return;
  }
  const { config: c, rules, params } = levelJob(config, n, rulesets);
  let g;
  try {
    g = generate(params, rules);
  } catch (e) {
    failures++;
    console.log(`${String(n).padEnd(3)} FAILED: ${(e as Error).message}`);
    return;
  }
  if (!g.matched) failures++;
  if (!dry) writeFileSync(`${dir}/${file}.json`, JSON.stringify(g.level, null, 2) + '\n');
  const a = g.analysis;
  const arrows = arrowStats(g.level);
  console.log(
    [
      String(n).padEnd(3),
      String(g.level.vehicles.length).padStart(3),
      String(c.colors).padStart(3),
      String(c.slots ?? rules.queue.slots).padStart(5),
      String(c.visible ?? rules.passengers.visible).padStart(3),
      c.target.toFixed(1).padStart(7),
      a.difficulty.toFixed(1).padStart(5),
      (a.randomPlayWinProbability * PERCENT).toFixed(1).padStart(6),
      String(a.deadStates).padStart(6),
      (a.avgDeadEndDepth === null ? '-' : a.avgDeadEndDepth.toFixed(2)).padStart(5),
      String(g.matched).padStart(8),
      String(g.attempts).padStart(8),
      String(g.mystery?.ids.length ?? 0).padStart(4),
      (g.mystery ? (g.mystery.blindWin * PERCENT).toFixed(0) : '-').padStart(6),
      (g.mystery ? (g.mystery.informedWin * PERCENT).toFixed(0) : '-').padStart(5),
      String(arrows.arrows).padStart(3),
      String(arrows.maxTurns).padStart(3),
    ].join(' '),
  );
});

/** Schreibt `levels` und laesst vorhandene Felder (world, name, intros) unveraendert. */
function writeIndex(): void {
  const path = `${dir}/index.json`;
  const existing = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as object)
    : { world, name: { de: `Welt ${world}`, en: `World ${world}` }, intros: {} };
  const merged = { ...existing, levels: ids };
  PackIndex.parse(merged);
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n');
}
if (!dry) writeIndex();
if (!dry) execFileSync('pnpm', ['exec', 'prettier', '--write', dir], { stdio: 'ignore' });
if (failures > 0) {
  console.error(`${failures} level(s) not matched`);
  process.exitCode = 1;
}
