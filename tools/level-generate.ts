// CLI: pnpm level:generate [--pack 01] [--config tools/pack-01.config.json] [--only 3,5] [--dry]
// Erzeugt ein Level-Pack deterministisch aus einer Konfigurationsdatei (feste Seeds pro Level).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { generate } from '../src/solver/generator';
import type { GeneratorOptions } from '../src/solver/types';
import { PackIndex, Ruleset, resolveRules } from '../src/schema';

const PAD = 3;
const PERCENT = 100;
const DEFAULT_TOLERANCE = 0.3;
const DEFAULT_MAX_STATES = 200_000;
const DEFAULT_MAX_ATTEMPTS = 120;
const DEFAULT_RULESET = 'classic';

const RULESET_DIR = 'src/content/rulesets';

/** Alle Rulesets unter src/content/rulesets, nach ID. */
function loadRulesets(): Map<string, Ruleset> {
  const map = new Map<string, Ruleset>();
  for (const f of readdirSync(RULESET_DIR).filter((n) => n.endsWith('.json'))) {
    const rs = Ruleset.parse(JSON.parse(readFileSync(`${RULESET_DIR}/${f}`, 'utf8')));
    map.set(rs.id, rs);
  }
  return map;
}

function rulesetById(map: Map<string, Ruleset>, id: string): Ruleset {
  const rs = map.get(id);
  if (!rs) throw new Error(`unknown ruleset "${id}" (known: ${[...map.keys()].join(', ')})`);
  return rs;
}

/** Eintrag pro Level; fehlende Felder kommen aus `defaults`. */
interface LevelConfig {
  /** Level unveraendert lassen (nur Zielkurve dokumentiert). */
  keep?: boolean;
  /** Basis-Seed des Generators; aendern, wenn kein Treffer gefunden wird. */
  seed: number;
  /** Kantenlaenge des quadratischen Rasters. */
  grid: number;
  vehicles: number;
  colors: number;
  /** Ziel-Schwierigkeit; Treffer, wenn |difficulty - target| <= tolerance. */
  target: number;
  tolerance?: number;
  slots?: number;
  /** Nur Darstellung (Solver kennt volle Information), siehe GeneratorTuning. */
  visible?: number;
  shuffleWindow?: number;
  blockiness?: number;
  typeWeights?: Record<string, number>;
  preferDeadEnds?: boolean;
  minDeadEndDepth?: number;
  maxRandomPlayWin?: number;
  maxAttempts?: number;
  /** Ruleset-ID (Datei unter src/content/rulesets), Default classic. */
  ruleset?: string;
  /** Poller: Zahl oder [min, max]. */
  bollards?: number | [number, number];
  /** Gesperrte Fahrzeuge: Zahl oder [min, max]. */
  keys?: number | [number, number];
  keyChainDepth?: number;
}

interface PackConfig {
  pack: string;
  /** Weltnummer fuer das Level-ID-Praefix `w<world>-` und index.json (Default: Pack-Nummer). */
  world?: number;
  maxStates?: number;
  maxAttempts?: number;
  defaults: Partial<LevelConfig>;
  levels: LevelConfig[];
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const pack = arg('pack', '01');
const configPath = arg('config', `tools/pack-${pack}.config.json`);
const only = arg('only', '').split(',').filter(Boolean).map(Number);
const dry = process.argv.includes('--dry');
const config = JSON.parse(readFileSync(configPath, 'utf8')) as PackConfig;
const dir = `src/content/levels/pack-${pack}`;
const rulesets = loadRulesets();
const world = config.world ?? Number(pack);
mkdirSync(dir, { recursive: true });

const ids: string[] = [];
let failures = 0;
console.log('n   veh col slots vis  target  diff   rpw%   dead depth  matched attempts');
config.levels.forEach((entry, index) => {
  const n = index + 1;
  const file = String(n).padStart(PAD, '0');
  ids.push(file);
  if (entry.keep || (only.length > 0 && !only.includes(n))) {
    console.log(`${String(n).padEnd(3)} kept ${file}`);
    return;
  }
  const c = { ...config.defaults, ...entry } as LevelConfig;
  const rules = resolveRules(rulesetById(rulesets, c.ruleset ?? DEFAULT_RULESET));
  const tol = c.tolerance ?? DEFAULT_TOLERANCE;
  const params: GeneratorOptions = {
    seed: c.seed,
    width: c.grid,
    height: c.grid,
    vehicleCount: c.vehicles,
    colors: rules.vehicles.colors.slice(0, c.colors),
    targetDifficulty: [c.target - tol, c.target + tol],
    maxAttempts: c.maxAttempts ?? config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    maxStates: config.maxStates ?? DEFAULT_MAX_STATES,
    id: `w${world}-${String(n).padStart(2, '0')}`,
    ruleset: rules.id,
    title: { de: `Level ${n}`, en: `Level ${n}` },
    ...(c.slots !== undefined && { slots: c.slots }),
    ...(c.visible !== undefined && { visiblePassengers: c.visible }),
    ...(c.shuffleWindow !== undefined && { shuffleWindow: c.shuffleWindow }),
    ...(c.blockiness !== undefined && { blockiness: c.blockiness }),
    ...(c.typeWeights !== undefined && { typeWeights: c.typeWeights }),
    ...(c.preferDeadEnds !== undefined && { preferDeadEnds: c.preferDeadEnds }),
    ...(c.minDeadEndDepth !== undefined && { minDeadEndDepth: c.minDeadEndDepth }),
    ...(c.maxRandomPlayWin !== undefined && { maxRandomPlayWin: c.maxRandomPlayWin }),
    ...(c.bollards !== undefined && { bollards: c.bollards }),
    ...(c.keys !== undefined && { keys: c.keys }),
    ...(c.keyChainDepth !== undefined && { keyChainDepth: c.keyChainDepth }),
  };
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
