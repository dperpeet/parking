// Echter Generator je Stufen-Variante: gueltige, loesbare Level mit der verlangten Mechanik.
import { describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import { hashString } from '../../../src/app/seed';
import { STAGE_COUNT, stageParams, stageVariants } from '../../../src/app/stages';
import type { StageVariant } from '../../../src/app/stages';
import { validateLevel } from '../../../src/engine';
import { analyze, generate } from '../../../src/solver';

const campaign = getCampaign();
const SEEDS = 2;
const range = (c: number | [number, number]): [number, number] => (Array.isArray(c) ? c : [c, c]);
const within = (n: number, c: number | [number, number]): boolean => {
  const [lo, hi] = range(c);
  return n >= lo && n <= hi;
};

const cases = Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).flatMap((stage) =>
  stageVariants(stage).map((variant) => ({ stage, variant, name: `${stage}/${variant.variant}` })),
);

function check(stage: number, variant: StageVariant, seed: number): void {
  const rules = campaign.rulesOf(variant.ruleset);
  const params = stageParams(stage, variant, rules.vehicles.colors, {
    seed,
    id: `test-${seed}`,
    title: 'Test',
  });
  const { level } = generate(params, rules);
  expect(level.ruleset).toBe(variant.ruleset);
  expect(validateLevel(level, rules)).toEqual([]);
  expect(level.vehicles).toHaveLength(variant.vehicleCount);
  const count = (type: string): number => level.grid.cells.filter((c) => c.type === type).length;
  expect(within(count('fixed'), variant.bollards)).toBe(true);
  expect(within(level.vehicles.filter((v) => v.locked).length, variant.keys)).toBe(true);
  expect(within(level.vehicles.filter((v) => v.mystery).length, variant.mystery ?? 0)).toBe(true);
  expect(within(count('oneWay'), variant.oneWay ?? 0)).toBe(true);
  const tapOnly = analyze(level, rules);
  if (variant.requireHonk) {
    // Wie Welt 3: mit Tipps allein unloesbar, mit der einen Hupe des Rulesets loesbar.
    expect(rules.powerups.honk.uses).toBe(1);
    expect(tapOnly.solvable || tapOnly.truncated).toBe(false);
    expect(analyze(level, rules, { allowHonk: true }).solvable).toBe(true);
  } else {
    expect(tapOnly.solvable).toBe(true);
  }
}

describe('Stufen-Varianten mit dem echten Generator', () => {
  it.each(cases)(
    '$name: gueltig, loesbar, Mechanik wie verlangt',
    ({ stage, variant }) => {
      for (let i = 0; i < SEEDS; i++)
        check(stage, variant, hashString(`variant-test:${stage}:${i}`));
    },
    60_000,
  );
});
