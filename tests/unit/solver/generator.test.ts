import { describe, expect, it } from 'vitest';
import { validateLevel } from '../../../src/engine';
import { Level } from '../../../src/schema';
import { analyze } from '../../../src/solver/analyze';
import { generate } from '../../../src/solver/generator';
import { handleRequest } from '../../../src/solver/handle';
import { rules } from '../helpers';
import { rulesFor } from './fixtures';

const params = {
  width: 5,
  height: 5,
  vehicleCount: 7,
  colors: ['blue', 'orange', 'green'],
  maxAttempts: 10,
};

describe('generator', () => {
  it('is deterministic per seed', () => {
    const a = generate({ ...params, seed: 42 }, rules);
    const b = generate({ ...params, seed: 42 }, rules);
    expect(JSON.stringify(a.level)).toBe(JSON.stringify(b.level));
    const c = generate({ ...params, seed: 43 }, rules);
    expect(JSON.stringify(c.level)).not.toBe(JSON.stringify(a.level));
  });

  it.each([1, 2, 3, 4])('produces a valid, solvable level for seed %i', (seed) => {
    const g = generate({ ...params, seed, targetDifficulty: [2, 4] }, rules);
    expect(() => Level.parse(g.level)).not.toThrow();
    expect(validateLevel(g.level, rules)).toEqual([]);
    expect(g.level.vehicles).toHaveLength(params.vehicleCount);
    const a = analyze(g.level, rules);
    expect(a.solvable).toBe(true);
    expect(g.level.meta?.par?.moves).toBe(a.minMoves);
    expect(g.level.meta?.difficulty).toBe(a.difficulty);
  });

  describe('tuning params', () => {
    const tuned = {
      ...params,
      vehicleCount: 8,
      colors: ['blue', 'orange', 'green', 'yellow'],
      slots: 6,
      visiblePassengers: 5,
      shuffleWindow: 5,
      maxAttempts: 6,
      maxStates: 100_000,
    };

    it('writes overrides and analyses with them', () => {
      const g = generate({ ...tuned, seed: 11 }, rules);
      expect(g.level.overrides).toEqual({ queue: { slots: 6 }, passengers: { visible: 5 } });
      const again = analyze(g.level, rulesFor(g.level));
      expect(again.difficulty).toBe(g.analysis.difficulty);
      expect(again.statesExplored).toBe(g.analysis.statesExplored);
      expect(g.level.meta?.difficulty).toBe(again.difficulty);
    });

    it('is deterministic with the new params', () => {
      const a = generate({ ...tuned, seed: 12, preferDeadEnds: true }, rules);
      const b = generate({ ...tuned, seed: 12, preferDeadEnds: true }, rules);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('leaves overrides out without tuning params (compatible default)', () => {
      const g = generate({ ...params, seed: 13 }, rules);
      expect(g.level.overrides).toBeUndefined();
    });

    it('supports 7x7 grids', () => {
      const g = generate({ ...tuned, width: 7, height: 7, seed: 14 }, rules);
      expect(g.level.grid).toMatchObject({ width: 7, height: 7 });
      expect(validateLevel(g.level, rulesFor(g.level))).toEqual([]);
    });

    it('preferDeadEnds only matches levels with dead states', () => {
      const g = generate(
        {
          ...tuned,
          vehicleCount: 10,
          shuffleWindow: 5,
          seed: 15,
          preferDeadEnds: true,
          maxAttempts: 40,
        },
        rules,
      );
      expect(g.matched).toBe(true);
      expect(g.analysis.deadStates).toBeGreaterThan(0);
    });

    it('maxRandomPlayWin rejects easy candidates', () => {
      const g = generate(
        { ...tuned, seed: 16, maxRandomPlayWin: 0.8, targetDifficulty: [1, 10], maxAttempts: 40 },
        rules,
      );
      expect(g.matched).toBe(true);
      expect(g.analysis.randomPlayWinProbability).toBeLessThanOrEqual(0.8);
    });
  });

  it('handles worker requests', () => {
    const res = handleRequest({ id: 7, kind: 'generate', params: { ...params, seed: 5 }, rules });
    expect(res.id).toBe(7);
    expect(res.ok).toBe(true);
    const bad = handleRequest({
      id: 8,
      kind: 'generate',
      params: { ...params, seed: 5, vehicleCount: 60, width: 3, height: 3 },
      rules,
    });
    expect(bad.ok).toBe(false);
  });
});
