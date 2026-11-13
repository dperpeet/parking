import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import world3 from '../../src/content/rulesets/world3.json';
import { createGame, step, validateLevel } from '../../src/engine';
import { Level, PackIndex, Ruleset, resolveRules } from '../../src/schema';
import { HONK_PREFIX, actionOf, analyze } from '../../src/solver/analyze';
import { hintMove } from '../../src/solver/hint';
import type { LevelAnalysis } from '../../src/solver/types';

const PACK = 'src/content/levels/pack-03';
const COUNT = 24;
/** Abschnitte der Rampe (erstes und letztes Level, jeweils inklusive). */
const SECTIONS: Array<[number, number]> = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 24],
];
const THREE_STARS = 3;
const MAX_ANALYZE_MS = 2000;
/** Erlaubter Rueckschritt der Schwierigkeit innerhalb eines Abschnitts. */
const SECTION_DROP_TOLERANCE = 0.6;
const FIRST_BOLLARD_LEVEL = 6;
const FIRST_KEY_LEVEL = 11;
/** Spaetabschnitt (016-024): groessere Raster, bis zu zwei Schluessel, Schwierigkeit 5,8-7,5. */
const LATE_FIRST = 16;
const LATE_MIN_DIFFICULTY = 5.8;
const LATE_MAX_DIFFICULTY = 7.5;
const LARGE_GRID = 7;
const MIN_LARGE_LEVELS = 4;
const MAX_LOCKS = 2;

interface PackEntry {
  n: number;
  level: Level;
  rules: ReturnType<typeof resolveRules>;
  tapOnly: LevelAnalysis;
  withHonk: LevelAnalysis;
  honkMs: number;
  bollards: number;
  locks: number;
}

const ruleset = Ruleset.parse(world3);

function loadPack(): PackEntry[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const n = i + 1;
    const file = join(PACK, `${String(n).padStart(3, '0')}.json`);
    const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
    const rules = resolveRules(ruleset, level.overrides);
    const tapOnly = analyze(level, rules);
    const t0 = performance.now();
    const withHonk = analyze(level, rules, { allowHonk: true });
    return {
      n,
      level,
      rules,
      tapOnly,
      withHonk,
      honkMs: performance.now() - t0,
      bollards: level.grid.cells.filter((c) => c.type === 'fixed').length,
      locks: level.vehicles.filter((v) => v.locked).length,
    };
  });
}

describe('pack-03 (Hupe)', () => {
  const pack = loadPack();
  const at = (n: number): PackEntry => pack[n - 1]!;

  it('lists 001-024 in index.json with intro, ids, titles and meta', () => {
    const index = PackIndex.parse(JSON.parse(readFileSync(join(PACK, 'index.json'), 'utf8')));
    expect(index.world).toBe(3);
    expect(index.name).toEqual({ de: 'Hupe', en: 'Honk' });
    expect(index.levels).toEqual(pack.map((e) => String(e.n).padStart(3, '0')));
    expect(index.intros).toEqual({ '001': 'honk' });
    for (const { n, level, withHonk } of pack) {
      expect(level.id).toBe(`w3-${String(n).padStart(2, '0')}`);
      expect(level.ruleset).toBe('world3');
      expect(level.title).toEqual({ de: `Level ${n}`, en: `Level ${n}` });
      expect(level.meta?.author).toBe('generator');
      expect(level.meta?.difficulty).toBe(withHonk.difficulty);
      expect(level.meta?.par?.moves).toBe(withHonk.minMoves);
    }
  });

  it('has valid levels', () => {
    for (const { level, rules } of pack) expect(validateLevel(level, rules)).toEqual([]);
  });

  it('is unsolvable with taps alone', () => {
    for (const { tapOnly } of pack) {
      expect(tapOnly.truncated).toBe(false);
      expect(tapOnly.solvable).toBe(false);
    }
  });

  it('is solvable with the horn and analyzes quickly', () => {
    for (const { n, withHonk, honkMs } of pack) {
      expect(withHonk.truncated).toBe(false);
      expect(withHonk.solvable).toBe(true);
      expect(honkMs, `level ${n}`).toBeLessThan(MAX_ANALYZE_MS);
    }
  });

  it('needs exactly one horn in the solution and wins with three stars', () => {
    for (const { n, level, rules, withHonk } of pack) {
      const solution = withHonk.solution ?? [];
      expect(solution.filter((id) => id.startsWith(HONK_PREFIX))).toHaveLength(1);
      expect(solution[0]?.startsWith(HONK_PREFIX), `level ${n}`).toBe(false);
      let state = createGame(level, rules);
      for (const id of solution) {
        const r = step(state, actionOf(id), rules);
        expect(r.events.some((e) => e.type === 'invalidAction')).toBe(false);
        state = r.state;
      }
      expect(state.status).toBe('won');
      expect(state.stars).toBe(THREE_STARS);
    }
  });

  it('gives a hint at the start of every level', () => {
    for (const { level, rules } of pack) {
      expect(hintMove(createGame(level, rules), rules)).not.toBeNull();
    }
  });

  it('introduces bollards from 006 and a key from 011', () => {
    for (const { n, bollards, locks } of pack) {
      expect(bollards > 0).toBe(n >= FIRST_BOLLARD_LEVEL);
      expect(locks > 0).toBe(n >= FIRST_KEY_LEVEL);
    }
  });

  it('rises in difficulty inside each section', () => {
    for (const [from, to] of SECTIONS) {
      expect(at(to).withHonk.difficulty).toBeGreaterThan(at(from).withHonk.difficulty);
      for (let n = from + 1; n <= to; n++) {
        const prev = at(n - 1).withHonk.difficulty;
        expect(at(n).withHonk.difficulty).toBeGreaterThanOrEqual(prev - SECTION_DROP_TOLERANCE);
      }
    }
    expect(SECTIONS.at(-1)?.[1]).toBe(COUNT);
  });

  it('ends with larger grids, up to two keys and difficulty 5.8-7.5', () => {
    const late = pack.filter((e) => e.n >= LATE_FIRST);
    for (const { n, level, withHonk, locks } of late) {
      expect(withHonk.difficulty, `level ${n}`).toBeGreaterThanOrEqual(LATE_MIN_DIFFICULTY);
      expect(withHonk.difficulty, `level ${n}`).toBeLessThanOrEqual(LATE_MAX_DIFFICULTY);
      expect(level.grid.width).toBeLessThanOrEqual(LARGE_GRID);
      expect(locks).toBeLessThanOrEqual(MAX_LOCKS);
    }
    const large = late.filter((e) => e.level.grid.width === LARGE_GRID);
    expect(large.length).toBeGreaterThanOrEqual(MIN_LARGE_LEVELS);
    expect(at(COUNT).level.grid.width).toBe(LARGE_GRID);
    expect(late.some((e) => e.locks === MAX_LOCKS)).toBe(true);
    expect(at(COUNT).withHonk.difficulty).toBe(Math.max(...pack.map((e) => e.withHonk.difficulty)));
  });
});
