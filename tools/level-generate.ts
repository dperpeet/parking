// CLI: pnpm level:generate --pack 01 --count 30 --seed 1
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { generate } from '../src/solver/generator';
import { Ruleset, resolveRules } from '../src/schema';
import classic from '../src/content/rulesets/classic.json';

const GROUP_SIZE = 5;
const BASE_DIFFICULTY = 1.4;
const GROUP_STEP = 0.7;
const POS_STEP = 0.18;
const TOLERANCE = 0.4;
const SMALL_GRID = 5;
const BIG_GRID = 6;
const SMALL_GRID_LEVELS = 8;
const MIN_VEHICLES = 5;
const MAX_VEHICLES = 14;
const MIN_COLORS = 2;
const MAX_COLORS = 5;
const MAX_ATTEMPTS = 80;
const SEED_STRIDE = 1000;
const PAD = 3;
const SKIP_EXISTING = ['007'];

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const pack = arg('pack', '01');
const count = Number(arg('count', '30'));
const seed = Number(arg('seed', '1'));
const dir = `src/content/levels/pack-${pack}`;
const rules = resolveRules(Ruleset.parse(classic));
mkdirSync(dir, { recursive: true });

/** Saegezahn: je 5 Level steigend, danach kleiner Rueckschritt. */
function targetFor(n: number): [number, number] {
  const group = Math.floor((n - 1) / GROUP_SIZE);
  const pos = (n - 1) % GROUP_SIZE;
  const t = BASE_DIFFICULTY + group * GROUP_STEP + pos * POS_STEP;
  return [t - TOLERANCE, t + TOLERANCE];
}

function lerp(n: number, a: number, b: number): number {
  return Math.round(a + ((n - 1) * (b - a)) / Math.max(1, count - 1));
}

const ids: string[] = [];
for (let n = 1; n <= count; n++) {
  const file = String(n).padStart(PAD, '0');
  ids.push(file);
  if (SKIP_EXISTING.includes(file)) {
    console.log(`${file}: kept existing`);
    continue;
  }
  const size = n <= SMALL_GRID_LEVELS ? SMALL_GRID : BIG_GRID;
  const g = generate(
    {
      seed: seed * SEED_STRIDE + n,
      width: size,
      height: size,
      vehicleCount: lerp(n, MIN_VEHICLES, MAX_VEHICLES),
      colors: rules.vehicles.colors.slice(0, lerp(n, MIN_COLORS, MAX_COLORS)),
      targetDifficulty: targetFor(n),
      maxAttempts: MAX_ATTEMPTS,
      id: `w${Number(pack)}-${String(n).padStart(2, '0')}`,
      title: { de: `Level ${n}`, en: `Level ${n}` },
    },
    rules,
  );
  writeFileSync(`${dir}/${file}.json`, JSON.stringify(g.level, null, 2) + '\n');
  const a = g.analysis;
  console.log(
    `${file}: veh=${g.level.vehicles.length} diff=${a.difficulty} target=${targetFor(n)
      .map((x) => x.toFixed(2))
      .join('-')} ` +
      `matched=${g.matched} attempts=${g.attempts} rw=${a.randomPlayWinProbability.toFixed(3)}`,
  );
}
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/index.json`, JSON.stringify({ levels: ids }, null, 2) + '\n');
