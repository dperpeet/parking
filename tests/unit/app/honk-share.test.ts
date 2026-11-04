import { describe, expect, it } from 'vitest';
import { EDITOR_DEFAULT_RULESET, loadRulesets } from '../../../src/app/editor-rulesets';
import { fromLevel, overridesOf, toLevel } from '../../../src/app/editor-model';
import { decodeLevel, encodeLevel } from '../../../src/app/share';
import type { RulesLookup } from '../../../src/app/share';
import { createGame } from '../../../src/engine';
import { resolveRules } from '../../../src/schema';
import type { Level } from '../../../src/schema';
import { level as level007 } from '../helpers';

const rulesets = loadRulesets();
const byId = (id: string) => rulesets.find((r) => r.id === id)!;
const lookup: RulesLookup = (id, overrides) => {
  const ruleset = rulesets.find((r) => r.id === id);
  return ruleset ? resolveRules(ruleset, overrides) : null;
};

/** Level 007 ohne Overrides, auf ein Ruleset gesetzt. */
function levelOn(ruleset: string, overrides?: Level['overrides']): Level {
  const base: Level = { ...level007, ruleset };
  delete base.overrides;
  return overrides ? { ...base, overrides } : base;
}

function honkUses(level: Level): number {
  const rules = lookup(level.ruleset, level.overrides)!;
  return createGame(level, rules).powerUps.honk;
}

function roundTrip(level: Level): Level {
  const enc = encodeLevel(level, { unchecked: false });
  if (!enc.ok) throw new Error('encode failed');
  const dec = decodeLevel(enc.code, lookup);
  if (!dec.ok) throw new Error(`decode failed: ${dec.error}`);
  return dec.level;
}

describe('Hupe im Editor und beim Teilen', () => {
  it('bietet world3 im Editor-Rulesetmenue an (Standard zuerst)', () => {
    expect(rulesets[0]?.id).toBe(EDITOR_DEFAULT_RULESET);
    expect(rulesets.map((r) => r.id)).toContain('world3');
    expect(byId('world3').powerups.honk).toMatchObject({ enabled: true, uses: 1 });
  });

  it('behaelt die Hupe von world3 beim Teilen und Wiederimportieren', () => {
    const back = roundTrip(levelOn('world3'));
    expect(back.ruleset).toBe('world3');
    expect(honkUses(back)).toBe(1);
  });

  it('behaelt einen Hupen-Override auf classic im Share-Code', () => {
    const override = { powerups: { honk: { enabled: true, uses: 2 } } };
    const level = levelOn('classic', override);
    expect(honkUses(level)).toBe(2);
    const back = roundTrip(level);
    expect(back.overrides?.powerups?.honk).toEqual({ enabled: true, uses: 2 });
    expect(honkUses(back)).toBe(2);
  });

  it('Editor: ein importierter Hupen-Override ueberlebt fromLevel/toLevel', () => {
    const override = { powerups: { honk: { enabled: true, uses: 2 } } };
    const classic = byId('classic');
    const state = fromLevel(levelOn('classic', override), classic);
    expect(overridesOf(state, classic)?.powerups).toEqual(override.powerups);
    expect(honkUses(roundTrip(toLevel(state, classic)))).toBe(2);
  });

  it('Editor: world3 braucht keine Zusatz-Overrides', () => {
    const world3 = byId('world3');
    const state = fromLevel(levelOn('world3'), world3);
    expect(overridesOf(state, world3)).toBeUndefined();
  });
});
