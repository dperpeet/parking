import { describe, expect, it } from 'vitest';
import { Level, Ruleset, resolveRules } from '../../src/schema';
import classic from '../../src/content/rulesets/classic.json';
import level007 from '../../src/content/levels/pack-01/007.json';

describe('content schemas', () => {
  it('classic ruleset is valid', () => {
    expect(() => Ruleset.parse(classic)).not.toThrow();
  });

  it('level 007 is valid and resolves overrides', () => {
    const level = Level.parse(level007);
    const rules = resolveRules(Ruleset.parse(classic), { queue: { slots: 4 } });
    expect(level.vehicles).toHaveLength(11);
    expect(rules.queue.slots).toBe(4);
    expect(rules.queue.fillPolicy).toBe('firstFree');
  });

  it('rejects invalid overrides', () => {
    expect(() => resolveRules(Ruleset.parse(classic), { queue: { slots: 0 } })).toThrow();
  });
});
