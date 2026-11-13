import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import classic from '../../src/content/rulesets/classic.json';
import world2 from '../../src/content/rulesets/world2.json';
import world3 from '../../src/content/rulesets/world3.json';
import world4 from '../../src/content/rulesets/world4.json';
import { validateLevel } from '../../src/engine';
import { Level, PackIndex, Ruleset, resolveRules } from '../../src/schema';
import { analyze } from '../../src/solver/analyze';
import type { LevelAnalysis } from '../../src/solver/types';

const ROOT = 'src/content/levels';
/** Level dieses Rulesets sind nur mit Hupe loesbar. */
const HONK_RULESET = 'world3';
const RULESETS = new Map([classic, world2, world3, world4].map((r) => [r.id, Ruleset.parse(r)]));

function rulesetOf(level: Level): Ruleset {
  const ruleset = RULESETS.get(level.ruleset);
  if (!ruleset) throw new Error(`unknown ruleset ${level.ruleset}`);
  return ruleset;
}

function levelFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return levelFiles(p);
    return name.endsWith('.json') && name !== 'index.json' ? [p] : [];
  });
}

describe('level content', () => {
  const files = levelFiles(ROOT);

  it('has levels', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it.each(files)('%s is valid and solvable', (file) => {
    const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
    const rules = resolveRules(rulesetOf(level), level.overrides);
    expect(validateLevel(level, rules)).toEqual([]);
    const a = analyze(level, rules, { allowHonk: level.ruleset === HONK_RULESET });
    expect(a.truncated).toBe(false);
    expect(a.solvable).toBe(true);
  });

  it('index.json files reference existing levels', () => {
    const indexes = readdirSync(ROOT)
      .map((d) => join(ROOT, d, 'index.json'))
      .filter((p) => existsSync(p));
    expect(indexes.length).toBeGreaterThan(0);
    for (const index of indexes) {
      const { levels } = PackIndex.parse(JSON.parse(readFileSync(index, 'utf8')));
      expect(levels.length).toBeGreaterThan(0);
      for (const id of levels) expect(existsSync(join(index, '..', `${id}.json`))).toBe(true);
    }
    const worlds = indexes.map((p) => PackIndex.parse(JSON.parse(readFileSync(p, 'utf8'))).world);
    expect(new Set(worlds).size).toBe(worlds.length);
  });
});

const PACK = join(ROOT, 'pack-01');
const COUNT = 30;
const GROUP = 5;
const MAX_ANALYZE_MS = 2000;
const KEPT = 7;
/** Erlaubter Rueckschritt innerhalb einer Gruppe (007 ist ein fest vorgegebener Ausreisser). */
const GROUP_DROP_TOLERANCE = 0.45;

interface PackEntry {
  n: number;
  level: Level;
  a: LevelAnalysis;
  ms: number;
}

function loadPack(): PackEntry[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const n = i + 1;
    const file = join(PACK, `${String(n).padStart(3, '0')}.json`);
    const level = Level.parse(JSON.parse(readFileSync(file, 'utf8')));
    const rules = resolveRules(Ruleset.parse(classic), level.overrides);
    const t0 = performance.now();
    const a = analyze(level, rules);
    return { n, level, a, ms: performance.now() - t0 };
  });
}

describe('pack-01 curve', () => {
  const pack = loadPack();
  const at = (n: number): PackEntry => pack[n - 1]!;

  it('lists 001-030 in index.json with consistent ids, titles and meta', () => {
    const { levels } = JSON.parse(readFileSync(join(PACK, 'index.json'), 'utf8')) as {
      levels: string[];
    };
    expect(levels).toEqual(pack.map((e) => String(e.n).padStart(3, '0')));
    for (const { n, level, a } of pack) {
      expect(level.id).toBe(`w1-${String(n).padStart(2, '0')}`);
      if (n !== KEPT) {
        expect(level.meta?.difficulty).toBe(a.difficulty);
        expect(level.meta?.par?.moves).toBe(a.minMoves);
        expect(level.title).toEqual({ de: `Level ${n}`, en: `Level ${n}` });
        expect(level.meta?.author).toBe('generator');
      }
    }
  });

  it('analyzes every level quickly and completely', () => {
    for (const { a, ms } of pack) {
      expect(a.truncated).toBe(false);
      expect(a.solvable).toBe(true);
      expect(ms).toBeLessThan(MAX_ANALYZE_MS);
    }
  });

  it('uses the planned grids, colors, slots and visibility', () => {
    for (const { n, level } of pack) {
      const size = n <= 8 ? 5 : n <= 24 ? 6 : 7;
      if (n !== KEPT) expect(level.grid.width).toBe(size);
      if (n !== KEPT) expect(level.grid.height).toBe(size);
      const colors = new Set(level.passengers).size;
      expect(colors).toBeGreaterThanOrEqual(2);
      expect(colors).toBeLessThanOrEqual(5);
      const slots = level.overrides?.queue?.slots ?? 5;
      const visible = level.overrides?.passengers?.visible ?? 8;
      expect(slots).toBeGreaterThanOrEqual(5);
      expect(slots).toBeLessThanOrEqual(6);
      expect(visible).toBeGreaterThanOrEqual(5);
      expect(visible).toBeLessThanOrEqual(8);
    }
    expect(new Set(at(1).level.passengers).size).toBe(2);
    expect(new Set(at(30).level.passengers).size).toBe(5);
  });

  it('starts easy: 001-002 are near-trivial, 003 onwards are not', () => {
    expect(at(1).a.randomPlayWinProbability).toBeGreaterThanOrEqual(0.9);
    expect(at(2).a.randomPlayWinProbability).toBeGreaterThanOrEqual(0.9);
    for (let n = 3; n <= COUNT; n++) {
      if (n === KEPT) continue;
      expect(at(n).a.randomPlayWinProbability).toBeLessThanOrEqual(0.85);
    }
  });

  it('ramps from ~1.5 to ~6.5', () => {
    expect(at(1).a.difficulty).toBeLessThanOrEqual(2);
    expect(at(30).a.difficulty).toBeGreaterThanOrEqual(5.5);
    expect(at(30).a.difficulty).toBeLessThanOrEqual(7);
    expect(at(KEPT).a.difficulty).toBe(3.7);
  });

  it('is a sawtooth: rising inside groups of 5, a dip at each group start', () => {
    for (let g = 0; g < COUNT / GROUP; g++) {
      const first = at(g * GROUP + 1).a.difficulty;
      const last = at((g + 1) * GROUP).a.difficulty;
      expect(last).toBeGreaterThan(first);
      for (let k = 1; k < GROUP; k++) {
        const prev = at(g * GROUP + k).a.difficulty;
        const cur = at(g * GROUP + k + 1).a.difficulty;
        expect(cur).toBeGreaterThanOrEqual(prev - GROUP_DROP_TOLERANCE);
      }
      if (g > 0) expect(first).toBeLessThanOrEqual(at(g * GROUP).a.difficulty);
    }
  });

  it('shows mistakes late in 021-030 (dead states, deeper dead ends)', () => {
    for (let n = 21; n <= COUNT; n++) {
      expect(at(n).a.deadStates).toBeGreaterThan(0);
      expect(at(n).a.avgDeadEndDepth).toBeGreaterThanOrEqual(2);
    }
  });
});
