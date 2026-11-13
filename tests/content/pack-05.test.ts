import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import world5 from '../../src/content/rulesets/world5.json';
import { createGame, step, validateLevel } from '../../src/engine';
import { cellKey, exitPath, vehicleCells } from '../../src/engine/geometry';
import { Level, PackIndex, Ruleset, resolveRules } from '../../src/schema';
import type { Dir } from '../../src/schema';
import { actionOf, analyze } from '../../src/solver/analyze';
import { generate } from '../../src/solver/generator';
import { arrowStats, arrowsHaveRole } from '../../src/solver/generator-oneway';
import type { ArrowLayout } from '../../src/solver/generator-oneway';
import { hintMove } from '../../src/solver/hint';
import type { LevelAnalysis } from '../../src/solver/types';
import { levelJob, readPackConfig } from '../../tools/lib/pack-config';
import { loadRulesets } from '../../tools/lib/rulesets';

const PACK = 'src/content/levels/pack-05';
const CONFIG = 'tools/pack-05.config.json';
const COUNT = 24;
/** Abschnitte der Rampe (erstes und letztes Level, inklusive). */
const SECTIONS: Array<{
  from: number;
  to: number;
  grid: number;
  arrows: [number, number];
  maxTurns: number;
}> = [
  { from: 1, to: 2, grid: 5, arrows: [1, 1], maxTurns: 1 },
  { from: 3, to: 8, grid: 5, arrows: [2, 2], maxTurns: 1 },
  { from: 9, to: 11, grid: 6, arrows: [3, 3], maxTurns: 2 },
  { from: 12, to: 17, grid: 6, arrows: [4, 4], maxTurns: 2 },
  { from: 18, to: 20, grid: 7, arrows: [5, 5], maxTurns: 2 },
  { from: 21, to: 24, grid: 7, arrows: [5, 6], maxTurns: 2 },
];
const THREE_STARS = 3;
const MAX_ANALYZE_MS = 2000;
/** Erlaubter Rueckschritt der Schwierigkeit von Level zu Level. */
const DROP_TOLERANCE = 0.3;
const FIRST_BOLLARD_LEVEL = 5;
const FIRST_KEY_LEVEL = 9;
const FINAL_ARROWS = 6;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 7.8;
/** Spaetabschnitt (021-024): Schwierigkeit ab 6,5. */
const LATE_FIRST = 21;
const LATE_MIN_DIFFICULTY = 6.5;
/** Level 001: der abbiegende Wagen wird schon im zweiten Zug der kuerzesten Loesung frei. */
const INTRO_TURN_STEP = 2;
/** Stichprobe fuer die Reproduzierbarkeit: Intro, Poller, 6x6 mit Strassen, 7x7 mit Schluesselkette. */
const REGENERATE = [1, 7, 13, 21];
const REGENERATE_TIMEOUT_MS = 60_000;

interface PackEntry {
  n: number;
  level: Level;
  rules: ReturnType<typeof resolveRules>;
  a: LevelAnalysis;
  ms: number;
  arrows: number;
  maxTurns: number;
  bollards: number;
  locks: number;
}

const ruleset = Ruleset.parse(world5);
const fileOf = (n: number): string => join(PACK, `${String(n).padStart(3, '0')}.json`);

function loadPack(): PackEntry[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const n = i + 1;
    const level = Level.parse(JSON.parse(readFileSync(fileOf(n), 'utf8')));
    const rules = resolveRules(ruleset, level.overrides);
    const t0 = performance.now();
    const a = analyze(level, rules);
    const stats = arrowStats(level);
    return {
      n,
      level,
      rules,
      a,
      ms: performance.now() - t0,
      arrows: stats.arrows,
      maxTurns: stats.maxTurns,
      bollards: level.grid.cells.filter((c) => c.type === 'fixed').length,
      locks: level.vehicles.filter((v) => v.locked).length,
    };
  });
}

/** Zellen eines Fahrzeugs im Level (Kopf zuerst). */
function cellsOf(
  v: Level['vehicles'][number],
  rules: ReturnType<typeof resolveRules>,
): Array<[number, number]> {
  const length = rules.vehicles.types[v.type]?.length ?? 0;
  return vehicleCells({ x: v.pos[0], y: v.pos[1], dir: v.dir, length });
}

function layoutOf(level: Level): ArrowLayout {
  const arrows = level.grid.cells.flatMap((c) =>
    c.type === 'oneWay' && c.dir !== undefined ? [{ x: c.x, y: c.y, dir: c.dir as Dir }] : [],
  );
  return {
    arrows,
    grid: level.grid,
    keys: new Set(arrows.map((a) => cellKey(a.x, a.y))),
    maxTurns: Number.POSITIVE_INFINITY,
  };
}

describe('pack-05 (Einbahn)', () => {
  const pack = loadPack();
  const at = (n: number): PackEntry => pack[n - 1]!;

  it('lists 001-024 in index.json with intro, ids, titles and meta', () => {
    const index = PackIndex.parse(JSON.parse(readFileSync(join(PACK, 'index.json'), 'utf8')));
    expect(index.world).toBe(5);
    expect(index.name).toEqual({ de: 'Einbahn', en: 'One-way' });
    expect(index.levels).toEqual(pack.map((e) => String(e.n).padStart(3, '0')));
    expect(index.intros).toEqual({ '001': 'oneWay' });
    for (const { n, level, a } of pack) {
      expect(level.id).toBe(`w5-${String(n).padStart(2, '0')}`);
      expect(level.ruleset).toBe('world5');
      expect(level.title).toEqual({ de: `Level ${n}`, en: `Level ${n}` });
      expect(level.meta?.author).toBe('generator');
      expect(level.meta?.difficulty).toBe(a.difficulty);
      expect(level.meta?.par?.moves).toBe(a.minMoves);
    }
  });

  it('enables turning arrows in the ruleset, without mystery vehicles', () => {
    expect(ruleset.movement.model).toBe('turns');
    expect(ruleset.special.oneWay).toBe(true);
    expect(ruleset.special.mysteryVehicles).toBe(false);
    expect(ruleset.powerups.honk).toEqual({ enabled: true, uses: 1 });
    for (const { n, level } of pack) {
      expect(
        level.vehicles.some((v) => v.mystery),
        `level ${n}`,
      ).toBe(false);
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

  it('never parks a vehicle on an arrow', () => {
    for (const { n, level, rules } of pack) {
      const arrows = new Set(layoutOf(level).arrows.map((c) => cellKey(c.x, c.y)));
      for (const v of level.vehicles) {
        for (const [x, y] of cellsOf(v, rules)) {
          expect(arrows.has(cellKey(x, y)), `level ${n} ${v.id}`).toBe(false);
        }
      }
    }
  });

  it('has an arrow in every level that redirects a blocked path', () => {
    for (const { n, level, rules } of pack) {
      const vehicles = level.vehicles.map((v) => ({
        head: v.pos,
        dir: v.dir,
        cells: cellsOf(v, rules),
      }));
      expect(arrowsHaveRole(layoutOf(level), vehicles), `level ${n}`).toBe(true);
    }
  });

  it('ramps arrows, grid and turns by section', () => {
    for (const { from, to, grid, arrows, maxTurns } of SECTIONS) {
      for (let n = from; n <= to; n++) {
        const e = at(n);
        expect(e.level.grid.width, `level ${n}`).toBe(grid);
        expect(e.arrows, `level ${n}`).toBeGreaterThanOrEqual(arrows[0]);
        expect(e.arrows, `level ${n}`).toBeLessThanOrEqual(arrows[1]);
        expect(e.maxTurns, `level ${n}`).toBeGreaterThanOrEqual(1);
        expect(e.maxTurns, `level ${n}`).toBeLessThanOrEqual(maxTurns);
      }
    }
    for (let n = 2; n <= COUNT; n++) {
      expect(at(n).arrows, `level ${n}`).toBeGreaterThanOrEqual(at(n - 1).arrows);
    }
    expect(at(COUNT).arrows).toBe(FINAL_ARROWS);
    expect(SECTIONS.at(-1)?.to).toBe(COUNT);
  });

  it('adds bollards from 005 and keys from 009', () => {
    for (const { n, bollards, locks } of pack) {
      expect(bollards > 0, `level ${n}`).toBe(n >= FIRST_BOLLARD_LEVEL);
      expect(locks > 0, `level ${n}`).toBe(n >= FIRST_KEY_LEVEL);
    }
  });

  it('opens gently: one arrow, and the turning vehicle is freed by the first move', () => {
    const { level, rules, a, arrows, bollards, locks } = at(1);
    expect(level.grid.width).toBe(SECTIONS[0]?.grid);
    expect(arrows).toBe(1);
    expect(bollards + locks).toBe(0);
    const solution = a.solution ?? [];
    const turning = level.vehicles.filter(
      (v) => exitPath({ x: v.pos[0], y: v.pos[1], dir: v.dir }, level.grid).exitDir !== v.dir,
    );
    expect(turning.length).toBeGreaterThanOrEqual(1);
    const firstTurn = Math.min(...turning.map((v) => solution.indexOf(v.id) + 1));
    expect(firstTurn).toBe(INTRO_TURN_STEP);
    // Vor dem ersten Zug ist der abbiegende Wagen blockiert, danach faehrt er.
    const state = createGame(level, rules);
    const first = turning.find((v) => solution.indexOf(v.id) + 1 === INTRO_TURN_STEP)!;
    const blocked = step(state, actionOf(first.id), rules);
    expect(blocked.events.some((e) => e.type === 'vehicleBlocked')).toBe(true);
    const freed = step(step(state, actionOf(solution[0]!), rules).state, actionOf(first.id), rules);
    expect(freed.events.some((e) => e.type === 'vehicleExited' && e.exitDir !== undefined)).toBe(
      true,
    );
  });

  it('rises in difficulty (nearly monotone) and stays in range', () => {
    for (let n = 2; n <= COUNT; n++) {
      const prev = at(n - 1).a.difficulty;
      expect(at(n).a.difficulty, `level ${n}`).toBeGreaterThanOrEqual(prev - DROP_TOLERANCE);
    }
    for (const { n, a } of pack) {
      expect(a.difficulty, `level ${n}`).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(a.difficulty, `level ${n}`).toBeLessThanOrEqual(MAX_DIFFICULTY);
      if (n >= LATE_FIRST) {
        expect(a.difficulty, `level ${n}`).toBeGreaterThanOrEqual(LATE_MIN_DIFFICULTY);
      }
    }
    expect(at(COUNT).a.difficulty).toBe(Math.max(...pack.map((e) => e.a.difficulty)));
    expect(at(1).a.difficulty).toBe(Math.min(...pack.map((e) => e.a.difficulty)));
  });

  it('has 24 distinct boards', () => {
    const boards = new Set(pack.map((e) => JSON.stringify([e.level.grid, e.level.vehicles])));
    expect(boards.size).toBe(COUNT);
  });

  it(
    'is reproducible from tools/pack-05.config.json (sample)',
    () => {
      const config = readPackConfig(CONFIG);
      expect(config.levels).toHaveLength(COUNT);
      const rulesets = loadRulesets();
      for (const n of REGENERATE) {
        const { params, rules } = levelJob(config, n, rulesets);
        const g = generate(params, rules);
        expect(g.matched, `level ${n}`).toBe(true);
        expect(g.level, `level ${n}`).toEqual(at(n).level);
      }
    },
    REGENERATE_TIMEOUT_MS,
  );
});
