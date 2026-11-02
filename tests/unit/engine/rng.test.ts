import { describe, expect, it } from 'vitest';
import { createRng, nextRandom } from '../../../src/engine';

/** Referenzimplementierung von mulberry32. */
function reference(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rng', () => {
  it('createRng normalizes to uint32', () => {
    expect(createRng(5)).toBe(5);
    expect(createRng(2 ** 32 + 5)).toBe(5);
    expect(createRng(-1)).toBe(4294967295);
  });

  it('matches the mulberry32 reference and stays in [0, 1)', () => {
    const ref = reference(12345);
    let state = createRng(12345);
    for (let i = 0; i < 100; i++) {
      const [value, next] = nextRandom(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(ref());
      expect(Number.isInteger(next)).toBe(true);
      state = next;
    }
  });

  it('is pure', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextRandom(42)[1]).not.toBe(42);
  });
});
