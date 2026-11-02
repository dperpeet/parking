import classicJson from '../../src/content/rulesets/classic.json';
import level007 from '../../src/content/levels/pack-01/007.json';
import { Level, Ruleset, resolveRules } from '../../src/schema';
import type { ResolvedRules } from '../../src/schema';

export const level = Level.parse(level007);
export const rules: ResolvedRules = resolveRules(Ruleset.parse(classicJson), level.overrides);

export const WIN_ORDER = ['v1', 'v2', 'v3', 'v4', 'v5', 'v8', 'v7', 'v9', 'v10', 'v11', 'v6'];
export const LOSE_ORDER = ['v1', 'v2', 'v4', 'v5', 'v6', 'v8', 'v7'];
