// CLI: tsx tools/pack-report.ts [dir]  - Tabelle ueber alle Level eines Packs (Analyse + Zeit).
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
const dir = process.argv[2] ?? 'src/content/levels/pack-01';
const rulesets = loadRulesets();
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort();
console.log(
  'id      grid vehs cols boll keys slots vis  diff  rpw%    dead avgDepth  states   winningPaths  ms',
);
for (const f of files) {
  const level = Level.parse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  const rules = resolveRules(rulesetById(rulesets, level.ruleset), level.overrides);
  const t0 = performance.now();
  const a = analyze(level, rules);
  const ms = performance.now() - t0;
  const cols = new Set(level.passengers).size;
  console.log(
    [
      level.id.padEnd(7),
      `${level.grid.width}x${level.grid.height}`.padEnd(4),
      String(level.vehicles.length).padStart(4),
      String(cols).padStart(4),
      String(level.grid.cells.filter((c) => c.type === 'fixed').length).padStart(4),
      String(level.vehicles.filter((v) => v.locked).length).padStart(4),
      String(rules.queue.slots).padStart(5),
      String(rules.passengers.visible).padStart(3),
      a.difficulty.toFixed(1).padStart(5),
      (a.randomPlayWinProbability * PERCENT).toFixed(1).padStart(6),
      String(a.deadStates).padStart(7),
      (a.avgDeadEndDepth === null ? '-' : a.avgDeadEndDepth.toFixed(2)).padStart(8),
      String(a.statesExplored).padStart(7),
      a.winningPaths.padStart(16),
      ms.toFixed(0).padStart(5),
      a.truncated ? 'TRUNC' : '',
    ].join(' '),
  );
}
