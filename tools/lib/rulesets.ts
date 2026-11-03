import { readFileSync, readdirSync } from 'node:fs';
import { Ruleset } from '../../src/schema';

export const RULESET_DIR = 'src/content/rulesets';

/** Alle Rulesets unter src/content/rulesets, nach ID. */
export function loadRulesets(): Map<string, Ruleset> {
  const map = new Map<string, Ruleset>();
  for (const f of readdirSync(RULESET_DIR).filter((n) => n.endsWith('.json'))) {
    const rs = Ruleset.parse(JSON.parse(readFileSync(`${RULESET_DIR}/${f}`, 'utf8')));
    map.set(rs.id, rs);
  }
  return map;
}

export function rulesetById(map: Map<string, Ruleset>, id: string): Ruleset {
  const rs = map.get(id);
  if (!rs) throw new Error(`unknown ruleset "${id}" (known: ${[...map.keys()].join(', ')})`);
  return rs;
}
