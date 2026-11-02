import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import classic from '../../src/content/rulesets/classic.json';
import { validateLevel } from '../../src/engine';
import { Level, Ruleset, resolveRules } from '../../src/schema';
import { analyze } from '../../src/solver/analyze';

const ROOT = 'src/content/levels';

function levelFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return levelFiles(p);
    return name.endsWith('.json') && name !== 'index.json' ? [p] : [];
  });
}

describe('level content', () => {
  const files = levelFiles(ROOT);

  it('has levels', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it.each(files)('%s is valid and solvable', (file) => {
    const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
    const rules = resolveRules(Ruleset.parse(classic), level.overrides);
    expect(validateLevel(level, rules)).toEqual([]);
    const a = analyze(level, rules);
    expect(a.truncated).toBe(false);
    expect(a.solvable).toBe(true);
  });

  it('index.json files reference existing levels', () => {
    const indexes = readdirSync(ROOT)
      .map((d) => join(ROOT, d, 'index.json'))
      .filter((p) => existsSync(p));
    expect(indexes.length).toBeGreaterThan(0);
    for (const index of indexes) {
      const { levels } = JSON.parse(readFileSync(index, 'utf8')) as { levels: string[] };
      expect(levels.length).toBeGreaterThan(0);
      for (const id of levels) expect(existsSync(join(index, '..', `${id}.json`))).toBe(true);
    }
  });
});
