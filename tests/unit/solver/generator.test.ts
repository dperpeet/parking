import { describe, expect, it } from 'vitest';
import { validateLevel } from '../../../src/engine';
import { Level } from '../../../src/schema';
import { analyze } from '../../../src/solver/analyze';
import { generate } from '../../../src/solver/generator';
import { handleRequest } from '../../../src/solver/handle';
import { rules } from '../helpers';

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
