// Exploration: welche Generator-Parameter erzeugen tote Zustaende?
// Aufruf: pnpm exec tsx tools/explore-generator.ts [samples] [filter]
import { generate } from '../src/solver/generator';
import type { GeneratorOptions } from '../src/solver/types';
import { Ruleset, resolveRules } from '../src/schema';
import classic from '../src/content/rulesets/classic.json';

const PERCENT = 100;
const MAX_STATES = 200_000;
const samples = Number(process.argv[2] ?? '30');
const filter = process.argv[3] ?? '';
const rules = resolveRules(Ruleset.parse(classic));
const COLORS = rules.vehicles.colors;

interface Config {
  name: string;
  p: Omit<GeneratorOptions, 'seed'>;
}

const base = { width: 6, height: 6, vehicleCount: 10, colors: COLORS.slice(0, 4) };
const c5 = COLORS.slice(0, 5);
const g7 = { ...base, width: 7, height: 7 };
const configs: Config[] = [
  { name: 'X1 7x7 v12 c5 w5', p: { ...g7, vehicleCount: 12, colors: c5, shuffleWindow: 5 } },
  {
    name: 'X2 7x7 v13 c5 w4 s6',
    p: { ...g7, vehicleCount: 13, colors: c5, shuffleWindow: 4, slots: 6 },
  },
  { name: 'X3 6x6 v12 c5 w5', p: { ...base, vehicleCount: 12, colors: c5, shuffleWindow: 5 } },
  {
    name: 'X4 6x6 v12 c4 w5 blk1',
    p: { ...base, vehicleCount: 12, shuffleWindow: 5, blockiness: 1 },
  },
  { name: 'X5 6x6 v12 c6 w5', p: { ...base, vehicleCount: 12, colors: COLORS, shuffleWindow: 5 } },
  {
    name: 'X6 7x7 v12 c4 w5 long',
    p: { ...g7, vehicleCount: 12, shuffleWindow: 5, typeWeights: { s: 1, m: 1, l: 1 } },
  },
  { name: 'X7 7x7 v12 c4 w5 s4', p: { ...g7, vehicleCount: 12, shuffleWindow: 4, slots: 4 } },
  { name: 'X8 6x6 v10 c4 w3 s4', p: { ...base, shuffleWindow: 3, slots: 4 } },
  { name: 'X9 6x6 v10 c4 w3 s3', p: { ...base, shuffleWindow: 3, slots: 3 } },
  { name: 'X10 6x6 v10 c4 w3 s4 blk1', p: { ...base, shuffleWindow: 3, slots: 4, blockiness: 1 } },
  { name: 'base 6x6 v10 c4 s5 w3', p: base },
  { name: 'slots 6', p: { ...base, slots: 6 } },
  { name: 'slots 7', p: { ...base, slots: 7 } },
  { name: 'slots 6 c5', p: { ...base, slots: 6, colors: c5 } },
  { name: 'slots 7 c5', p: { ...base, slots: 7, colors: c5 } },
  { name: 'slots 7 c6', p: { ...base, slots: 7, colors: COLORS.slice(0, 6) } },
  { name: 'c3', p: { ...base, colors: COLORS.slice(0, 3) } },
  { name: 'c5', p: { ...base, colors: c5 } },
  { name: 'c6', p: { ...base, colors: COLORS.slice(0, 6) } },
  { name: 'window 1', p: { ...base, shuffleWindow: 1 } },
  { name: 'window 2', p: { ...base, shuffleWindow: 2 } },
  { name: 'window 4', p: { ...base, shuffleWindow: 4 } },
  { name: 'window 5', p: { ...base, shuffleWindow: 5 } },
  { name: 'slots 6 window 5', p: { ...base, slots: 6, shuffleWindow: 5 } },
  { name: 'slots 7 window 6', p: { ...base, slots: 7, shuffleWindow: 6 } },
  { name: 'long (l:6 m:3 s:1)', p: { ...base, typeWeights: { s: 1, m: 3, l: 6 } } },
  { name: 'mid (s:1 m:1 l:~0)', p: { ...base, typeWeights: { s: 1, m: 1, l: 0.0001 } } },
  { name: 'short only', p: { ...base, typeWeights: { s: 1, m: 0.0001, l: 0.0001 } } },
  { name: 'blockiness 0', p: { ...base, blockiness: 0 } },
  { name: 'blockiness 1', p: { ...base, blockiness: 1 } },
  { name: '7x7 v12', p: { ...base, width: 7, height: 7, vehicleCount: 12 } },
  {
    name: '7x7 v14 c5 s6',
    p: { ...base, width: 7, height: 7, vehicleCount: 14, slots: 6, colors: c5 },
  },
  { name: 'v8', p: { ...base, vehicleCount: 8 } },
  { name: 'v12', p: { ...base, vehicleCount: 12 } },
  { name: 'v14', p: { ...base, vehicleCount: 14 } },
  {
    name: 'v12 c5 s6 w4',
    p: { ...base, vehicleCount: 12, colors: c5, slots: 6, shuffleWindow: 4 },
  },
  {
    name: 'v12 c5 s6 w5 long',
    p: {
      ...base,
      vehicleCount: 12,
      colors: c5,
      slots: 6,
      shuffleWindow: 5,
      typeWeights: { s: 1, m: 2, l: 4 },
    },
  },
];

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

console.log(
  'config'.padEnd(26),
  'ok  dead>0%  dead2%  meanDead  meanDepth  diff   rpw%   states   ms',
);
for (const c of configs) {
  if (!c.name.includes(filter)) continue;
  const diff: number[] = [];
  const rpw: number[] = [];
  const dead: number[] = [];
  const depth: number[] = [];
  const states: number[] = [];
  let withDead = 0;
  let withDeep = 0;
  let ok = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= samples; seed++) {
    try {
      const a = generate({ ...c.p, seed, maxAttempts: 1, maxStates: MAX_STATES }, rules).analysis;
      ok++;
      diff.push(a.difficulty);
      rpw.push(a.randomPlayWinProbability * PERCENT);
      dead.push(a.deadStates);
      states.push(a.statesExplored);
      if (a.deadStates > 0) {
        withDead++;
        depth.push(a.avgDeadEndDepth ?? 0);
        if ((a.avgDeadEndDepth ?? 0) >= 2) withDeep++;
      }
    } catch {
      /* unloesbar oder zu gross */
    }
  }
  const ms = (performance.now() - t0) / samples;
  console.log(
    c.name.padEnd(26),
    String(ok).padStart(2),
    ((withDead / Math.max(1, ok)) * PERCENT).toFixed(0).padStart(7),
    ((withDeep / Math.max(1, ok)) * PERCENT).toFixed(0).padStart(7),
    mean(dead).toFixed(0).padStart(9),
    mean(depth).toFixed(2).padStart(10),
    mean(diff).toFixed(2).padStart(6),
    mean(rpw).toFixed(1).padStart(6),
    mean(states).toFixed(0).padStart(8),
    ms.toFixed(0).padStart(5),
  );
}
