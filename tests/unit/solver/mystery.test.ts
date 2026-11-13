import { describe, expect, it } from 'vitest';
import { createGame, validateLevel } from '../../../src/engine';
import { Level, resolveRules } from '../../../src/schema';
import type { Ruleset } from '../../../src/schema';
import { analyze } from '../../../src/solver/analyze';
import { blindAnalysis, blindWinRate } from '../../../src/solver/blind';
import { generate } from '../../../src/solver/generator';
import {
  MYSTERY_SUBSET_TRIES,
  applyMystery,
  mysterySubsets,
  revealSchedule,
  withMystery,
} from '../../../src/solver/generator-mystery';
import { classicRuleset, rules as classicRules, world2Ruleset } from '../helpers';

/** Test-Ruleset wie world2, mit Mystery-Fahrzeugen (die Welt-4-Datei folgt spaeter). */
const mysteryRuleset: Ruleset = {
  ...world2Ruleset,
  id: 'world4-test',
  special: { ...world2Ruleset.special, mysteryVehicles: true },
};
const mysteryRules = resolveRules(mysteryRuleset);

/**
 * 5x5, zwei Halteplaetze, zwei sichtbare Fahrgaeste (blau, blau). A (orange) blockiert X (blau),
 * B (gruen) blockiert Y (pink). Nur "A zuerst" gewinnt; wer X und Y nicht kennt, raet.
 */
const trap: Level = Level.parse({
  schema: 'parking.level/1',
  id: 'trap',
  title: 'Trap',
  ruleset: 'classic',
  overrides: {
    special: { mysteryVehicles: true },
    queue: { slots: 2 },
    passengers: { visible: 2 },
  },
  grid: { width: 5, height: 5, cells: [] },
  vehicles: [
    { id: 'X', pos: [1, 0], dir: 'E', type: 's', color: 'blue', mystery: true },
    { id: 'A', pos: [3, 1], dir: 'S', type: 's', color: 'orange' },
    { id: 'Y', pos: [1, 4], dir: 'E', type: 's', color: 'pink', mystery: true },
    { id: 'B', pos: [4, 3], dir: 'N', type: 's', color: 'green' },
  ],
  passengers: ['blue', 'blue', 'orange', 'orange', 'green', 'green', 'pink', 'pink'],
});
const trapRules = resolveRules(classicRuleset, trap.overrides);

describe('blinde Playouts', () => {
  it('sind deterministisch und liegen in [0, 1]', () => {
    const a = blindAnalysis(trap, trapRules);
    expect(blindAnalysis(trap, trapRules)).toEqual(a);
    for (const x of [a.blindWin, a.informedWin]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(blindWinRate(trap, trapRules, { playouts: 0 })).toBe(0);
  });

  it('verlieren ohne Wissen um verdeckte Farben', () => {
    const { blindWin, informedWin } = blindAnalysis(trap, trapRules, { playouts: 200 });
    expect(informedWin).toBeGreaterThan(0.75);
    expect(blindWin).toBeLessThan(0.65);
    expect(informedWin - blindWin).toBeGreaterThan(0.2);
  });

  it('sind ohne Mystery-Fahrzeuge blind wie informiert', () => {
    const plain = { ...trap, vehicles: trap.vehicles.map((v) => ({ ...v, mystery: false })) };
    const r = blindAnalysis(plain, trapRules);
    expect(r.blindWin).toBe(r.informedWin);
    expect(r.blindWin).toBeGreaterThan(0.75);
  });

  it('nutzen die Hupe, wenn kein Tipp mehr geht', () => {
    // Pflicht-Hupe: ohne Hupe unloesbar.
    const g = generate(
      {
        seed: 3,
        width: 5,
        height: 5,
        vehicleCount: 6,
        colors: ['blue', 'orange', 'green'],
        requireHonk: true,
        maxAttempts: 200,
        maxStates: 100_000,
      },
      mysteryRules,
    );
    expect(analyze(g.level, mysteryRules).solvable).toBe(false);
    expect(blindWinRate(g.level, mysteryRules)).toBeGreaterThan(0);
    // Hupen in der Loesung werden als Power-Up abgespielt; jedes verdeckte Fahrzeug wird aufgedeckt.
    const solution = g.analysis.solution ?? [];
    expect(solution.some((m) => m.startsWith('honk:'))).toBe(true);
    const schedule = revealSchedule(g.level, mysteryRules, solution);
    expect(schedule.length).toBeGreaterThan(0);
    for (const c of schedule) {
      expect(c.step).toBeGreaterThan(0);
      expect(c.step).toBeLessThanOrEqual(solution.length);
    }
  });
});

describe('Mystery-Auswahl', () => {
  const plainTrap = {
    ...trap,
    vehicles: trap.vehicles.map(({ mystery, ...v }) => (void mystery, v)),
  };

  it('revealSchedule: nur verdeckt startende Fahrzeuge, mit Aufdeck-Schritt', () => {
    expect(revealSchedule(plainTrap, trapRules, ['A', 'X', 'B', 'Y'])).toEqual([
      { id: 'X', step: 1 },
      { id: 'Y', step: 3 },
    ]);
    // Ohne Loesung (nie aufgedeckt) gilt Schritt = Laenge der Loesung.
    expect(revealSchedule(plainTrap, trapRules, [])).toEqual([
      { id: 'X', step: 0 },
      { id: 'Y', step: 0 },
    ]);
  });

  it('mysterySubsets: spaeteste zuerst, eindeutig, leer ohne genug Kandidaten', () => {
    const schedule = [
      { id: 'a', step: 1 },
      { id: 'b', step: 5 },
      { id: 'c', step: 3 },
      { id: 'd', step: 4 },
    ];
    const r = { state: 7 };
    const subsets = mysterySubsets(r, schedule, 2);
    expect(subsets[0]).toEqual(['b', 'd']);
    expect(subsets.length).toBeLessThanOrEqual(MYSTERY_SUBSET_TRIES);
    expect(new Set(subsets.map((s) => s.join())).size).toBe(subsets.length);
    for (const s of subsets) expect(s).toHaveLength(2);
    expect(mysterySubsets({ state: 7 }, schedule, 5)).toEqual([]);
    expect(mysterySubsets({ state: 7 }, schedule, 0)).toEqual([]);
  });

  it('withMystery markiert genau die genannten Fahrzeuge', () => {
    const marked = withMystery(plainTrap, ['Y']);
    expect(marked.vehicles.filter((v) => v.mystery).map((v) => v.id)).toEqual(['Y']);
  });

  it('applyMystery: faire Auswahl oder beste unfaire', () => {
    const fair = applyMystery({ state: 1 }, plainTrap, trapRules, ['A', 'X', 'B', 'Y'], 1, 0.1);
    expect(fair?.fair).toBe(true);
    expect(fair?.ids).toEqual(['Y']);
    const unfair = applyMystery({ state: 1 }, plainTrap, trapRules, ['A', 'X', 'B', 'Y'], 2, 1.01);
    expect(unfair?.fair).toBe(false);
    expect(unfair?.ids).toEqual(['X', 'Y']);
    expect(applyMystery({ state: 1 }, plainTrap, trapRules, [], 3, 0)).toBeNull();
  });
});

describe('Generator mit Mystery-Fahrzeugen', () => {
  const params = {
    seed: 21,
    width: 6,
    height: 6,
    vehicleCount: 8,
    colors: ['blue', 'orange', 'green', 'yellow'],
    targetDifficulty: [4, 7] as [number, number],
    maxAttempts: 60,
    maxStates: 100_000,
    slots: 4,
    ruleset: mysteryRuleset.id,
  };

  it('markiert verdeckt startende Fahrzeuge und laesst die Analyse unveraendert', () => {
    const g = generate({ ...params, mystery: 2, bollards: 1, keys: 1 }, mysteryRules);
    const marked = g.level.vehicles.filter((v) => v.mystery).map((v) => v.id);
    expect(marked).toHaveLength(2);
    expect(g.mystery?.ids).toEqual([...marked].sort());
    expect(g.mystery?.fair).toBe(true);
    expect(g.mystery?.blindWin).toBeGreaterThanOrEqual(0.25);
    const rules = resolveRules(mysteryRuleset, g.level.overrides);
    expect(validateLevel(g.level, rules)).toEqual([]);
    const state = createGame(g.level, rules);
    for (const id of marked) expect(state.vehicles.find((v) => v.id === id)?.hidden).toBe(true);
    const plain = { ...g.level, vehicles: g.level.vehicles.map((v) => ({ ...v, mystery: false })) };
    expect(analyze(g.level, rules)).toEqual(analyze(plain, rules));
    expect(g.level.meta?.difficulty).toBe(g.analysis.difficulty);
  });

  it('ist deterministisch und mystery: 0 aendert nichts', () => {
    const a = generate({ ...params, mystery: [1, 3] }, mysteryRules);
    const b = generate({ ...params, mystery: [1, 3] }, mysteryRules);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const n = a.level.vehicles.filter((v) => v.mystery).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
    const none = generate(params, mysteryRules);
    expect(none.mystery).toBeUndefined();
    expect(JSON.stringify(generate({ ...params, mystery: 0 }, mysteryRules))).toBe(
      JSON.stringify(none),
    );
  });

  it('meldet unfaire Kandidaten als nicht getroffen', () => {
    const g = generate(
      { ...params, maxAttempts: 4, mystery: 1, mysteryMinBlindWin: 1.01 },
      mysteryRules,
    );
    expect(g.matched).toBe(false);
    expect(g.mystery?.fair).toBe(false);
  });

  it('wirft ohne special.mysteryVehicles', () => {
    expect(() => generate({ ...params, ruleset: 'classic', mystery: 1 }, classicRules)).toThrow(
      /mysteryVehicles/,
    );
    expect(() => generate({ ...params, mystery: [0, 2] }, classicRules)).toThrow(/mysteryVehicles/);
  });

  it('wirft, wenn kein Kandidat genug verdeckte Fahrzeuge hat', () => {
    expect(() =>
      generate({ ...params, vehicleCount: 3, maxAttempts: 5, mystery: 3 }, mysteryRules),
    ).toThrow(/no solvable level/);
  });
});
