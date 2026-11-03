import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import world2 from '../../src/content/rulesets/world2.json';
import { validateLevel } from '../../src/engine';
import { Level, PackIndex, Ruleset, resolveRules } from '../../src/schema';
import { analyze } from '../../src/solver/analyze';
import type { LevelAnalysis } from '../../src/solver/types';

const PACK = 'src/content/levels/pack-02';
const COUNT = 24;
const GROUP = 4;
const MAX_ANALYZE_MS = 2000;
/** Erlaubter Rueckschritt innerhalb einer Gruppe. */
const GROUP_DROP_TOLERANCE = 0.45;
const FIRST_LOCKED_MIXED = 9;
const FIRST_DEAD_STATES = 13;
const FINAL_MIN = 7;
const FINAL_MAX = 8;
const EASY_MAX = 4;

interface PackEntry {
  n: number;
  level: Level;
  a: LevelAnalysis;
  ms: number;
  bollards: number;
  locks: number;
}

const ruleset = Ruleset.parse(world2);

function loadPack(): PackEntry[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const n = i + 1;
    const file = join(PACK, `${String(n).padStart(3, '0')}.json`);
    const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
    const rules = resolveRules(ruleset, level.overrides);
    const t0 = performance.now();
    const a = analyze(level, rules);
    return {
      n,
      level,
      a,
      ms: performance.now() - t0,
      bollards: level.grid.cells.filter((c) => c.type === 'fixed').length,
      locks: level.vehicles.filter((v) => v.locked).length,
    };
  });
}

describe('pack-02 curve', () => {
  const pack = loadPack();
  const at = (n: number): PackEntry => pack[n - 1]!;

  it('lists 001-024 in index.json with intros, ids, titles and meta', () => {
    const index = PackIndex.parse(JSON.parse(readFileSync(join(PACK, 'index.json'), 'utf8')));
    expect(index.world).toBe(2);
    expect(index.name).toEqual({ de: 'Poller & Schlüssel', en: 'Bollards & Keys' });
    expect(index.levels).toEqual(pack.map((e) => String(e.n).padStart(3, '0')));
    expect(index.intros).toEqual({ '001': 'bollards', '005': 'keys' });
    for (const { n, level, a } of pack) {
      expect(level.id).toBe(`w2-${String(n).padStart(2, '0')}`);
      expect(level.ruleset).toBe('world2');
      expect(level.title).toEqual({ de: `Level ${n}`, en: `Level ${n}` });
      expect(level.meta?.author).toBe('generator');
      expect(level.meta?.difficulty).toBe(a.difficulty);
      expect(level.meta?.par?.moves).toBe(a.minMoves);
    }
  });

  it('has valid, solvable levels that analyze quickly and completely', () => {
    for (const { level, a, ms } of pack) {
      expect(validateLevel(level, resolveRules(ruleset, level.overrides))).toEqual([]);
      expect(a.truncated).toBe(false);
      expect(a.solvable).toBe(true);
      expect(ms).toBeLessThan(MAX_ANALYZE_MS);
    }
  });

  it('introduces bollards first, then keys, then mixes both', () => {
    for (let n = 1; n <= GROUP; n++) {
      expect(at(n).locks).toBe(0);
      expect(at(n).bollards).toBeGreaterThanOrEqual(1);
    }
    expect(at(GROUP + 1).locks).toBe(1);
    for (let n = FIRST_LOCKED_MIXED; n <= COUNT; n++) {
      expect(at(n).bollards).toBeGreaterThanOrEqual(1);
      expect(at(n).locks).toBeGreaterThanOrEqual(1);
    }
  });

  it('starts easy and ends between 7 and 8', () => {
    expect(at(1).a.difficulty).toBeLessThanOrEqual(EASY_MAX);
    expect(at(COUNT).a.difficulty).toBeGreaterThanOrEqual(FINAL_MIN);
    expect(at(COUNT).a.difficulty).toBeLessThanOrEqual(FINAL_MAX);
  });

  it('is a sawtooth: rising inside groups of 4, each group starts below the previous end', () => {
    for (let g = 0; g < COUNT / GROUP; g++) {
      const first = at(g * GROUP + 1).a.difficulty;
      const last = at((g + 1) * GROUP).a.difficulty;
      expect(last).toBeGreaterThan(first);
      for (let k = 1; k < GROUP; k++) {
        const prev = at(g * GROUP + k).a.difficulty;
        const cur = at(g * GROUP + k + 1).a.difficulty;
        expect(cur).toBeGreaterThanOrEqual(prev - GROUP_DROP_TOLERANCE);
      }
      if (g > 0) expect(first).toBeLessThanOrEqual(at(g * GROUP).a.difficulty);
    }
  });

  it('shows mistakes from level 13 on (dead states)', () => {
    for (let n = FIRST_DEAD_STATES; n <= COUNT; n++) {
      expect(at(n).a.deadStates).toBeGreaterThan(0);
    }
  });
});
