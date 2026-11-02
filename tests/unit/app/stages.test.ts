import { describe, expect, it } from 'vitest';
import {
  DAILY_STAGE_BY_WEEKDAY,
  ENDLESS_LEVELS_PER_STAGE,
  STAGE_COUNT,
  STAGE_SHAPES,
  clampStage,
  dailyStage,
  difficultyRange,
  endlessStage,
  stageForDifficulty,
  stageShape,
} from '../../../src/app/stages';

describe('stageForDifficulty', () => {
  it('entspricht clamp(1..6, ceil((d - 1) / 0.75))', () => {
    for (let d = 0; d <= 10; d += 0.05) {
      const expected = Math.min(6, Math.max(1, Math.ceil((d - 1) / 0.75 - 1e-9)));
      expect(stageForDifficulty(Number(d.toFixed(2)))).toBe(expected);
    }
  });

  it('kennt die Grenzen', () => {
    expect(stageForDifficulty(0)).toBe(1);
    expect(stageForDifficulty(1.4)).toBe(1);
    expect(stageForDifficulty(1.75)).toBe(1);
    expect(stageForDifficulty(1.76)).toBe(2);
    expect(stageForDifficulty(2.5)).toBe(2);
    expect(stageForDifficulty(3.3)).toBe(4);
    expect(stageForDifficulty(4.75)).toBe(5);
    expect(stageForDifficulty(4.8)).toBe(6);
    expect(stageForDifficulty(10)).toBe(6);
  });

  it('fehlende Schwierigkeit zaehlt als Stufe 1', () => {
    expect(stageForDifficulty(undefined)).toBe(1);
    expect(stageForDifficulty(Number.NaN)).toBe(1);
  });

  it('ist monoton', () => {
    let prev = 0;
    for (let d = 0; d <= 10; d += 0.1) {
      const s = stageForDifficulty(d);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('Zielbereiche und Formen', () => {
  it('Bereiche schliessen lueckenlos aneinander an', () => {
    for (let s = 1; s < STAGE_COUNT; s++) {
      expect(difficultyRange(s)[1]).toBe(difficultyRange(s + 1)[0]);
    }
    expect(difficultyRange(1)[0]).toBeLessThan(difficultyRange(1)[1]);
    expect(difficultyRange(6)[1]).toBeGreaterThan(difficultyRange(6)[0]);
  });

  it('die Mitte jedes Bereichs gehoert zur eigenen Stufe', () => {
    for (let s = 1; s <= STAGE_COUNT; s++) {
      const [lo, hi] = difficultyRange(s);
      expect(stageForDifficulty((lo + hi) / 2)).toBe(s);
    }
  });

  it('jede Stufe hat eine Form, die mit der Stufe waechst', () => {
    expect(STAGE_SHAPES).toHaveLength(STAGE_COUNT);
    for (let s = 2; s <= STAGE_COUNT; s++) {
      expect(stageShape(s).vehicleCount).toBeGreaterThanOrEqual(stageShape(s - 1).vehicleCount);
    }
    for (const shape of STAGE_SHAPES)
      expect(shape.colorCount).toBeLessThanOrEqual(shape.vehicleCount);
  });

  it('clampStage begrenzt auf 1..6', () => {
    expect(clampStage(0)).toBe(1);
    expect(clampStage(9)).toBe(6);
    expect(clampStage(3.4)).toBe(3);
  });
});

describe('Endlos und Tageslevel', () => {
  it('Endlos steigt alle N Level um eine Stufe bis 6', () => {
    expect(endlessStage(1)).toBe(1);
    expect(endlessStage(ENDLESS_LEVELS_PER_STAGE)).toBe(1);
    expect(endlessStage(ENDLESS_LEVELS_PER_STAGE + 1)).toBe(2);
    expect(endlessStage(500)).toBe(6);
  });

  it('Tageslevel: Montag leicht, Sonntag schwer', () => {
    const monday = new Date(2026, 10, 2); // Mo, 2. Nov 2026
    expect(monday.getDay()).toBe(1);
    expect(dailyStage(monday)).toBe(1);
    expect(dailyStage(new Date(2026, 10, 8))).toBe(6); // Sonntag
    expect(DAILY_STAGE_BY_WEEKDAY).toHaveLength(7);
    // Mo..So nicht fallend
    const week = [1, 2, 3, 4, 5, 6, 0].map((d) => DAILY_STAGE_BY_WEEKDAY[d] ?? 0);
    expect([...week].sort((a, b) => a - b)).toEqual(week);
  });
});
