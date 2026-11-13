import { describe, expect, it } from 'vitest';
import { createRng, validateLevel } from '../../../src/engine';
import { cellKey, exitPath, vehicleCells } from '../../../src/engine/geometry';
import { resolveRules } from '../../../src/schema';
import type { Level, Ruleset } from '../../../src/schema';
import { analyze } from '../../../src/solver/analyze';
import { generate } from '../../../src/solver/generator';
import {
  arrowStats,
  arrowsHaveRole,
  chooseArrows,
  traceExit,
} from '../../../src/solver/generator-oneway';
import type { ArrowLayout } from '../../../src/solver/generator-oneway';
import type { GeneratorOptions } from '../../../src/solver/types';
import { world2Ruleset } from '../helpers';

/** Test-Ruleset wie world2, mit Abbiegepfeilen (die Welt-5-Datei folgt spaeter). */
const turnsRuleset: Ruleset = {
  ...world2Ruleset,
  id: 'world5-test',
  movement: { ...world2Ruleset.movement, model: 'turns' },
  special: { ...world2Ruleset.special, oneWay: true },
};
const turnsRules = resolveRules(turnsRuleset);
const world2 = resolveRules(world2Ruleset);
const SEEDS = [1, 2, 3, 4, 5, 6];

function opts(seed: number, extra: Partial<GeneratorOptions> = {}): GeneratorOptions {
  return {
    seed,
    width: 6,
    height: 6,
    vehicleCount: 8 + (seed % 3),
    colors: ['blue', 'orange', 'green', 'yellow'],
    ruleset: 'world5-test',
    maxAttempts: 40,
    maxStates: 60_000,
    oneWay: [2, 4],
    bollards: [0, 2],
    keys: [0, 1],
    ...extra,
  };
}

function layoutOf(level: Level): ArrowLayout {
  const arrows = level.grid.cells.flatMap((c) =>
    c.type === 'oneWay' && c.dir ? [{ x: c.x, y: c.y, dir: c.dir }] : [],
  );
  return {
    arrows,
    grid: level.grid,
    keys: new Set(arrows.map((a) => cellKey(a.x, a.y))),
    maxTurns: Number.POSITIVE_INFINITY,
  };
}

function cellsOf(level: Level): Array<{
  head: [number, number];
  dir: Level['vehicles'][0]['dir'];
  cells: Array<[number, number]>;
}> {
  return level.vehicles.map((v) => ({
    head: v.pos,
    dir: v.dir,
    cells: vehicleCells({
      x: v.pos[0],
      y: v.pos[1],
      dir: v.dir,
      length: turnsRules.vehicles.types[v.type]!.length,
    }),
  }));
}

describe('generator with turning arrows', () => {
  it('throws without the ruleset flags or together with requireHonk', () => {
    expect(() => generate(opts(1, { oneWay: 2 }), world2)).toThrow(/oneWay/);
    const noFlag = resolveRules({ ...turnsRuleset, special: world2Ruleset.special });
    expect(() => generate(opts(1, { oneWay: [0, 2] }), noFlag)).toThrow(/oneWay/);
    const straight = resolveRules({ ...turnsRuleset, movement: world2Ruleset.movement });
    expect(() => generate(opts(1, { oneWay: 1 }), straight)).toThrow(/turns/);
    expect(() => generate(opts(1, { requireHonk: true }), turnsRules)).toThrow(/requireHonk/);
  });

  it('stays bit-identical without arrows', () => {
    const base = { ...opts(7), oneWay: undefined };
    const plain = JSON.stringify(generate(base, world2).level);
    expect(JSON.stringify(generate(base, turnsRules).level)).toBe(plain);
    expect(JSON.stringify(generate({ ...base, oneWay: 0 }, turnsRules).level)).toBe(plain);
    expect(JSON.stringify(generate({ ...base, oneWay: [0, 0], maxTurns: 1 }, world2).level)).toBe(
      plain,
    );
  });

  it('is deterministic per seed', () => {
    const a = JSON.stringify(generate(opts(3), turnsRules).level);
    expect(JSON.stringify(generate(opts(3), turnsRules).level)).toBe(a);
    expect(JSON.stringify(generate(opts(4), turnsRules).level)).not.toBe(a);
  });

  it.each(SEEDS)('builds valid, solvable levels whose arrows matter (seed %i)', (seed) => {
    const g = generate(opts(seed, { maxTurns: 1 }), turnsRules);
    const level = g.level;
    expect(validateLevel(level, turnsRules)).toEqual([]);
    expect(analyze(level, turnsRules, { maxStates: 60_000 }).solvable).toBe(true);
    const layout = layoutOf(level);
    expect(layout.arrows.length).toBeGreaterThanOrEqual(2);
    expect(layout.arrows.length).toBeLessThanOrEqual(4);
    const vehicles = cellsOf(level);
    const fixed = level.grid.cells.filter((c) => c.type === 'fixed').map((c) => cellKey(c.x, c.y));
    for (const v of vehicles) {
      for (const [x, y] of v.cells) expect(layout.keys.has(cellKey(x, y))).toBe(false);
      const exit = exitPath({ x: v.head[0], y: v.head[1], dir: v.dir }, level.grid);
      expect(exit.wrongWay).toBeNull();
      expect(exit.loop).toBe(false);
      for (const [x, y] of exit.path) expect(fixed).not.toContain(cellKey(x, y));
    }
    for (const k of fixed) expect(layout.keys.has(k)).toBe(false);
    expect(arrowsHaveRole(layout, vehicles)).toBe(true);
    expect(arrowStats(level).maxTurns).toBeLessThanOrEqual(1);
  });

  it('places arrows as straight street pieces', () => {
    const g = generate(opts(5, { oneWay: 3, oneWayStreets: 3 }), turnsRules);
    const [a, b, c] = layoutOf(g.level).arrows;
    expect(new Set([a!.dir, b!.dir, c!.dir]).size).toBe(1);
    const step = [b!.x - a!.x, b!.y - a!.y];
    expect(Math.abs(step[0]!) + Math.abs(step[1]!)).toBe(1);
    expect([c!.x - b!.x, c!.y - b!.y]).toEqual(step);
  });
});

describe('arrow helpers', () => {
  const r = () => ({ state: createRng(9) });

  it('chooseArrows gives up when the grid is too small and avoids loops', () => {
    expect(chooseArrows(r(), 1, 1, 2, 1, [])).toBeNull();
    expect(chooseArrows(r(), 2, 2, 4, 1, [[0, 0]])).toBeNull();
    for (let s = 1; s <= 20; s++) {
      const layout = chooseArrows({ state: createRng(s) }, 3, 3, 6, [1, 2], [[1, 1]])!;
      expect(layout.arrows).toHaveLength(6);
      expect(layout.keys.has('1,1')).toBe(false);
      for (const a of layout.arrows) expect(exitPath(a, layout.grid).loop).toBe(false);
    }
  });

  it('traceExit counts turns and rejects wrong-way paths', () => {
    const layout = chooseArrows(r(), 5, 5, 0, 1, [])!;
    layout.arrows.push({ x: 3, y: 2, dir: 'S' }, { x: 3, y: 4, dir: 'W' });
    layout.grid = {
      width: 5,
      height: 5,
      cells: layout.arrows.map((a) => ({ ...a, type: 'oneWay' as const })),
    };
    const t = traceExit(layout, [1, 2], 'E')!;
    expect(t.turns).toBe(2);
    expect(t.path[t.bentFrom]).toEqual([3, 3]);
    expect(traceExit(layout, [3, 0], 'N')).toEqual({ path: [], turns: 0, bentFrom: 0 });
    expect(traceExit(layout, [4, 2], 'W')).not.toBeNull();
    expect(traceExit(layout, [3, 3], 'N')).toBeNull();
  });

  it('arrowsHaveRole needs a vehicle blocked behind a turn', () => {
    const layout = chooseArrows(r(), 5, 5, 0, 1, [])!;
    layout.arrows.push({ x: 3, y: 2, dir: 'S' });
    layout.grid = { width: 5, height: 5, cells: [{ x: 3, y: 2, type: 'oneWay', dir: 'S' }] };
    const turner = {
      head: [1, 2] as [number, number],
      dir: 'E' as const,
      cells: [[1, 2]] as Array<[number, number]>,
    };
    const below = {
      head: [3, 4] as [number, number],
      dir: 'E' as const,
      cells: [[3, 4]] as Array<[number, number]>,
    };
    const ahead = {
      head: [4, 1] as [number, number],
      dir: 'N' as const,
      cells: [[4, 2]] as Array<[number, number]>,
    };
    expect(arrowsHaveRole(layout, [turner, below])).toBe(true);
    expect(arrowsHaveRole(layout, [turner, ahead])).toBe(false);
  });

  it('arrowStats reports arrows and the longest turn count', () => {
    const g = generate(opts(2, { oneWay: 2 }), turnsRules);
    expect(arrowStats(g.level).arrows).toBe(2);
    expect(arrowStats({ ...g.level, grid: { ...g.level.grid, cells: [] } })).toEqual({
      arrows: 0,
      maxTurns: 0,
    });
  });
});
