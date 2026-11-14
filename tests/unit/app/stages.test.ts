import { describe, expect, it } from 'vitest';
import {
  DAILY_STAGE_BY_WEEKDAY,
  ENDLESS_LEVELS_PER_STAGE,
  STAGE_COUNT,
  STAGE_KEY_CHAIN_DEPTH,
  STAGE_VARIANTS,
  STAGE_VARIANT_RULES,
  clampStage,
  dailyStage,
  difficultyRange,
  endlessStage,
  stageForDifficulty,
  stageShape,
  stageVariant,
  stageVariants,
} from '../../../src/app/stages';
import type { StageVariantId } from '../../../src/app/stages';
import { localDateKey } from '../../../src/app/progress';
import { dailySeed, endlessSeed } from '../../../src/app/seed';

const STAGES = Array.from({ length: STAGE_COUNT }, (_, i) => i + 1);
const baseShapes = STAGES.map((s) => stageShape(s));

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
    expect(STAGE_VARIANTS).toHaveLength(STAGE_COUNT);
    for (let s = 2; s <= STAGE_COUNT; s++) {
      expect(stageShape(s).vehicleCount).toBeGreaterThanOrEqual(stageShape(s - 1).vehicleCount);
    }
    for (const shape of STAGES.flatMap((s) => stageVariants(s)))
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

describe('Stufen-Mechaniken', () => {
  const count = (c: number | [number, number]): [number, number] => (Array.isArray(c) ? c : [c, c]);

  it('Stufe 1-2 classic ohne Mechaniken, ab Stufe 3 world2', () => {
    expect(baseShapes.map((s) => s.ruleset)).toEqual([
      'classic',
      'classic',
      'world2',
      'world2',
      'world2',
      'world2',
    ]);
    for (const stage of [1, 2]) {
      expect(count(stageShape(stage).bollards)).toEqual([0, 0]);
      expect(count(stageShape(stage).keys)).toEqual([0, 0]);
    }
  });

  it('Poller ab Stufe 3 (1-2), Schluessel erst ab Stufe 5 (genau einer)', () => {
    for (const stage of [3, 4, 5, 6]) {
      const [lo, hi] = count(stageShape(stage).bollards);
      expect(lo).toBeGreaterThanOrEqual(1);
      expect(hi).toBeLessThanOrEqual(2);
    }
    expect(stageShape(4).bollards).toBe(2);
    expect(stageShape(3).keys).toBe(0);
    expect(stageShape(4).keys).toBe(0);
    expect(stageShape(5).keys).toBe(1);
    expect(stageShape(6).keys).toBe(1);
    expect(STAGE_KEY_CHAIN_DEPTH).toBe(1);
  });

  it('Fahrzeugzahl waechst nicht ueber die Stufen hinweg rueckwaerts', () => {
    const counts = baseShapes.map((s) => s.vehicleCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
});

describe('Mechanik-Varianten', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => endlessSeed(0xabc, i + 1));
  const picked = (stage: number): Set<StageVariantId> =>
    new Set(seeds.map((seed) => stageVariant(stage, seed).variant));

  it('Stufe 1-2 bleiben classic ohne neue Mechanik', () => {
    for (const stage of [1, 2]) {
      expect(stageVariants(stage).map((v) => v.variant)).toEqual(['classic']);
      expect(picked(stage)).toEqual(new Set(['classic']));
      const v = stageVariant(stage, 42);
      expect(v.requireHonk ?? v.mystery ?? v.oneWay).toBeUndefined();
    }
  });

  it('ab Stufe 3 kommen Pflicht-Hupe, Mystery und Abbiegepfeile vor', () => {
    for (const stage of [3, 4, 5, 6]) {
      expect(picked(stage)).toEqual(new Set(['world2', 'honk', 'mystery', 'turns']));
    }
  });

  it('die Grundvariante ist die erste und entspricht der alten Stufenform', () => {
    for (const stage of STAGES) {
      expect(stageVariants(stage)[0]).toEqual(stageShape(stage));
      expect(stageShape(stage).ruleset).toBe(stage <= 2 ? 'classic' : 'world2');
    }
  });

  it('Ruleset und Mechanik passen zur Variante', () => {
    for (const v of STAGES.flatMap((s) => stageVariants(s))) {
      expect(v.ruleset).toBe(STAGE_VARIANT_RULES[v.variant].ruleset);
      expect(v.requireHonk === true).toBe(v.variant === 'honk');
      expect(v.mystery !== undefined).toBe(v.variant === 'mystery');
      expect(v.oneWay !== undefined).toBe(v.variant === 'turns');
      expect(v.weight).toBeGreaterThan(0);
    }
    expect(stageVariants(3).find((v) => v.variant === 'honk')?.ruleset).toBe('world3');
    expect(stageVariants(3).find((v) => v.variant === 'mystery')?.ruleset).toBe('world4');
    expect(stageVariants(3).find((v) => v.variant === 'turns')?.ruleset).toBe('world5');
  });

  it('die Wahl ist deterministisch und folgt den Gewichten', () => {
    for (const stage of STAGES) {
      for (const seed of seeds.slice(0, 20))
        expect(stageVariant(stage, seed)).toEqual(stageVariant(stage, seed));
    }
    const share = seeds.filter((seed) => stageVariant(3, seed).variant === 'world2').length;
    // Stufe 3: Grundvariante mit Gewicht 2 von 5.
    expect(share / seeds.length).toBeGreaterThan(0.3);
    expect(share / seeds.length).toBeLessThan(0.5);
  });

  it('Tageslevel: die Variante wechselt von Woche zu Woche', () => {
    // 52 Sonntage (Stufe 6) ab dem 3. Januar 2027.
    const sundays = Array.from({ length: 52 }, (_, w) => {
      const d = new Date(2027, 0, 3 + 7 * w);
      return localDateKey(d);
    });
    expect(new Set(sundays.map((k) => stageVariant(6, dailySeed(k)).variant)).size).toBe(4);
  });
});
