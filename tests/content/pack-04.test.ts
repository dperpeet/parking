import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import world4 from '../../src/content/rulesets/world4.json';
import { createGame, step, validateLevel } from '../../src/engine';
import { Level, PackIndex, Ruleset, resolveRules } from '../../src/schema';
import { actionOf, analyze } from '../../src/solver/analyze';
import { blindWinRate } from '../../src/solver/blind';
import { generate } from '../../src/solver/generator';
import { DEFAULT_MYSTERY_MIN_BLIND_WIN, revealSchedule } from '../../src/solver/generator-mystery';
import { hintMove } from '../../src/solver/hint';
import type { LevelAnalysis } from '../../src/solver/types';
import { levelJob, readPackConfig } from '../../tools/lib/pack-config';
import { loadRulesets } from '../../tools/lib/rulesets';

const PACK = 'src/content/levels/pack-04';
const CONFIG = 'tools/pack-04.config.json';
const COUNT = 24;
/** Abschnitte der Rampe (erstes und letztes Level, inklusive) mit erlaubter Mystery-Zahl. */
const SECTIONS: Array<{ from: number; to: number; mystery: [number, number] }> = [
  { from: 1, to: 4, mystery: [1, 1] },
  { from: 5, to: 8, mystery: [1, 2] },
  { from: 9, to: 12, mystery: [2, 3] },
  { from: 13, to: 18, mystery: [2, 3] },
  { from: 19, to: 24, mystery: [3, 4] },
];
const THREE_STARS = 3;
const MAX_ANALYZE_MS = 2000;
/** Erlaubter Rueckschritt der Schwierigkeit innerhalb eines Abschnitts. */
const SECTION_DROP_TOLERANCE = 0.6;
const FIRST_KEY_LEVEL = 5;
const FINAL_MYSTERY = 4;
const LARGE_GRID = 7;
const MIN_LARGE_LEVELS = 5;
/** Spaetabschnitt (019-024): Schwierigkeit 6,0-7,8. */
const LATE_FIRST = 19;
const LATE_MIN_DIFFICULTY = 6;
const LATE_MAX_DIFFICULTY = 7.8;
/** Level 001 deckt sein Mystery-Fahrzeug schon nach dem ersten Zug der kuerzesten Loesung auf. */
const INTRO_REVEAL_STEP = 1;
/** Stichprobe fuer die Reproduzierbarkeit (alle 24 dauern ca. 18 s): Intro, 7x7, Spaetabschnitt. */
const REGENERATE = [1, 8, 18, 21];
const REGENERATE_TIMEOUT_MS = 60_000;

interface PackEntry {
  n: number;
  level: Level;
  rules: ReturnType<typeof resolveRules>;
  a: LevelAnalysis;
  ms: number;
  bollards: number;
  locks: number;
  mystery: string[];
}

const ruleset = Ruleset.parse(world4);
const fileOf = (n: number): string => join(PACK, `${String(n).padStart(3, '0')}.json`);

function loadPack(): PackEntry[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const n = i + 1;
    const level = Level.parse(JSON.parse(readFileSync(fileOf(n), 'utf8')));
    const rules = resolveRules(ruleset, level.overrides);
    const t0 = performance.now();
    const a = analyze(level, rules);
    return {
      n,
      level,
      rules,
      a,
      ms: performance.now() - t0,
      bollards: level.grid.cells.filter((c) => c.type === 'fixed').length,
      locks: level.vehicles.filter((v) => v.locked).length,
      mystery: level.vehicles.filter((v) => v.mystery).map((v) => v.id),
    };
  });
}

describe('pack-04 (Mystery)', () => {
  const pack = loadPack();
  const at = (n: number): PackEntry => pack[n - 1]!;

  it('lists 001-024 in index.json with intro, ids, titles and meta', () => {
    const index = PackIndex.parse(JSON.parse(readFileSync(join(PACK, 'index.json'), 'utf8')));
    expect(index.world).toBe(4);
    expect(index.name).toEqual({ de: 'Mystery', en: 'Mystery' });
    expect(index.levels).toEqual(pack.map((e) => String(e.n).padStart(3, '0')));
    expect(index.intros).toEqual({ '001': 'mystery' });
    for (const { n, level, a } of pack) {
      expect(level.id).toBe(`w4-${String(n).padStart(2, '0')}`);
      expect(level.ruleset).toBe('world4');
      expect(level.title).toEqual({ de: `Level ${n}`, en: `Level ${n}` });
      expect(level.meta?.author).toBe('generator');
      expect(level.meta?.difficulty).toBe(a.difficulty);
      expect(level.meta?.par?.moves).toBe(a.minMoves);
    }
  });

  it('has valid, solvable levels that analyze quickly and completely', () => {
    for (const { n, level, rules, a, ms } of pack) {
      expect(validateLevel(level, rules)).toEqual([]);
      expect(a.truncated).toBe(false);
      expect(a.solvable).toBe(true);
      expect(ms, `level ${n}`).toBeLessThan(MAX_ANALYZE_MS);
      expect(hintMove(createGame(level, rules), rules)).not.toBeNull();
    }
  });

  it('wins with three stars along the shortest solution', () => {
    for (const { n, level, rules, a } of pack) {
      let state = createGame(level, rules);
      for (const id of a.solution ?? []) {
        const r = step(state, actionOf(id), rules);
        expect(
          r.events.some((e) => e.type === 'invalidAction'),
          `level ${n}`,
        ).toBe(false);
        state = r.state;
      }
      expect(state.status).toBe('won');
      expect(state.stars).toBe(THREE_STARS);
    }
  });

  it('starts every mystery vehicle hidden', () => {
    for (const { n, level, rules, mystery } of pack) {
      expect(mystery.length, `level ${n}`).toBeGreaterThanOrEqual(1);
      const hidden = createGame(level, rules)
        .vehicles.filter((v) => v.hidden)
        .map((v) => v.id);
      expect(hidden).toEqual(mystery);
    }
  });

  it('ramps the number of mystery vehicles from 1 to 4', () => {
    for (const {
      from,
      to,
      mystery: [min, max],
    } of SECTIONS) {
      for (let n = from; n <= to; n++) {
        expect(at(n).mystery.length, `level ${n}`).toBeGreaterThanOrEqual(min);
        expect(at(n).mystery.length, `level ${n}`).toBeLessThanOrEqual(max);
      }
    }
    for (let n = 2; n <= COUNT; n++) {
      expect(at(n).mystery.length).toBeGreaterThanOrEqual(at(n - 1).mystery.length);
    }
    expect(at(COUNT).mystery.length).toBe(FINAL_MYSTERY);
    expect(SECTIONS.at(-1)?.to).toBe(COUNT);
  });

  it('passes the fairness filter (blind win rate)', () => {
    for (const { n, level, rules } of pack) {
      expect(blindWinRate(level, rules), `level ${n}`).toBeGreaterThanOrEqual(
        DEFAULT_MYSTERY_MIN_BLIND_WIN,
      );
    }
  });

  it('opens gently: one mystery vehicle revealed by the first move, no keys', () => {
    const { level, rules, a, mystery, bollards, locks } = at(1);
    expect(mystery).toHaveLength(1);
    const schedule = revealSchedule(level, rules, a.solution ?? []);
    expect(schedule.find((s) => s.id === mystery[0])?.step).toBe(INTRO_REVEAL_STEP);
    expect(bollards).toBeLessThanOrEqual(1);
    expect(locks).toBe(0);
  });

  it('keeps bollards throughout and adds keys from 005', () => {
    for (const { n, bollards, locks } of pack) {
      expect(bollards, `level ${n}`).toBeGreaterThanOrEqual(1);
      expect(locks > 0, `level ${n}`).toBe(n >= FIRST_KEY_LEVEL);
    }
  });

  it('rises in difficulty inside each section and ends hardest', () => {
    for (const { from, to } of SECTIONS) {
      expect(at(to).a.difficulty).toBeGreaterThan(at(from).a.difficulty);
      for (let n = from + 1; n <= to; n++) {
        const prev = at(n - 1).a.difficulty;
        expect(at(n).a.difficulty, `level ${n}`).toBeGreaterThanOrEqual(
          prev - SECTION_DROP_TOLERANCE,
        );
      }
    }
    for (const { n, a } of pack.filter((e) => e.n >= LATE_FIRST)) {
      expect(a.difficulty, `level ${n}`).toBeGreaterThanOrEqual(LATE_MIN_DIFFICULTY);
      expect(a.difficulty, `level ${n}`).toBeLessThanOrEqual(LATE_MAX_DIFFICULTY);
    }
    expect(at(COUNT).a.difficulty).toBe(Math.max(...pack.map((e) => e.a.difficulty)));
  });

  it('uses 7x7 grids in at least five levels, including the last', () => {
    const large = pack.filter((e) => e.level.grid.width === LARGE_GRID);
    expect(large.length).toBeGreaterThanOrEqual(MIN_LARGE_LEVELS);
    expect(at(COUNT).level.grid.width).toBe(LARGE_GRID);
  });

  it(
    'is reproducible from tools/pack-04.config.json (sample)',
    () => {
      const config = readPackConfig(CONFIG);
      expect(config.levels).toHaveLength(COUNT);
      const rulesets = loadRulesets();
      for (const n of REGENERATE) {
        const { params, rules } = levelJob(config, n, rulesets);
        const g = generate(params, rules);
        expect(g.matched, `level ${n}`).toBe(true);
        expect(g.mystery?.fair, `level ${n}`).toBe(true);
        expect(g.level, `level ${n}`).toEqual(at(n).level);
      }
    },
    REGENERATE_TIMEOUT_MS,
  );
});
