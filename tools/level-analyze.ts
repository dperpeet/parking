// CLI: pnpm level:analyze <file.json> [...]
import { readFileSync, readdirSync } from 'node:fs';
import { analyze } from '../src/solver/analyze';
import { Level, Ruleset, resolveRules } from '../src/schema';

const PERCENT = 100;

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

function pct(x: number): string {
  return `${(x * PERCENT).toFixed(2)} %`;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: pnpm level:analyze <file.json> [...]');
  process.exit(1);
}

const rulesets = loadRulesets();
for (const file of files) {
  const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
  const rules = resolveRules(rulesetById(rulesets, level.ruleset), level.overrides);
  const t0 = performance.now();
  const a = analyze(level, rules);
  const ms = performance.now() - t0;
  const rows: Array<[string, string]> = [
    ['level', `${level.id} (${file})`],
    ['solvable', String(a.solvable) + (a.truncated ? ' (truncated)' : '')],
    ['minMoves', String(a.minMoves)],
    ['solution', a.solution?.join(' ') ?? '-'],
    ['winningPaths', a.winningPaths],
    ['totalPaths', a.totalPaths],
    ['winRate', pct(a.winRate)],
    ['randomPlayWin', pct(a.randomPlayWinProbability)],
    ['statesExplored', String(a.statesExplored)],
    ['deadStates', String(a.deadStates)],
    ['avgDeadEndDepth', a.avgDeadEndDepth === null ? '-' : a.avgDeadEndDepth.toFixed(2)],
    ['maxQueueUsed', String(a.maxQueueUsedOnBestPath)],
    ['difficulty', a.difficulty.toFixed(1)],
    ['time', `${ms.toFixed(0)} ms`],
  ];
  for (const [k, v] of rows) console.log(`${k.padEnd(16)} ${v}`);
  console.log('first moves:');
  console.log(
    `  ${'vehicle'.padEnd(8)} ${'winning'.padStart(14)} ${'total'.padStart(14)}  share   dead`,
  );
  for (const m of a.firstMoves) {
    const share = Number(m.winningPaths) / Number(m.totalPaths);
    console.log(
      `  ${m.vehicleId.padEnd(8)} ${m.winningPaths.padStart(14)} ${m.totalPaths.padStart(14)}  ${pct(share).padStart(8)}  ${m.deadEnd ? 'yes' : ''}`,
    );
  }
  console.log('');
}
