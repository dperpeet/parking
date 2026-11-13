// CLI: pnpm level:analyze [--honk] <file.json> [...]  (--honk: Hupen gehoeren zum Zustandsraum)
import { readFileSync } from 'node:fs';
import { analyze } from '../src/solver/analyze';
import { blindAnalysis } from '../src/solver/blind';
import { Level, resolveRules } from '../src/schema';
import { loadRulesets, rulesetById } from './lib/rulesets';

const PERCENT = 100;

function pct(x: number): string {
  return `${(x * PERCENT).toFixed(2)} %`;
}

const allowHonk = process.argv.includes('--honk');
const files = process.argv.slice(2).filter((a) => a !== '--honk');
if (files.length === 0) {
  console.error('usage: pnpm level:analyze [--honk] <file.json> [...]');
  process.exit(1);
}

const rulesets = loadRulesets();
for (const file of files) {
  const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
  const rules = resolveRules(rulesetById(rulesets, level.ruleset), level.overrides);
  const t0 = performance.now();
  const a = analyze(level, rules, { allowHonk });
  const ms = performance.now() - t0;
  const mystery = level.vehicles.filter((v) => v.mystery).map((v) => v.id);
  const blind = mystery.length > 0 ? blindAnalysis(level, rules) : null;
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
    ['mystery', mystery.length > 0 ? `${mystery.length} (${mystery.join(' ')})` : '0'],
    ...(blind
      ? ([
          ['blindWin', pct(blind.blindWin)],
          ['informedWin', pct(blind.informedWin)],
        ] as Array<[string, string]>)
      : []),
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
