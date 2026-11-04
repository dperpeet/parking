import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { Level, Ruleset, resolveRules } from '../../../src/schema';
import { analyze, analyzeState } from '../../../src/solver/analyze';
import { generate } from '../../../src/solver/generator';
import { hintMove } from '../../../src/solver/hint';
import world3Json from '../../../src/content/rulesets/world3.json';
import { level as level007, rules as classicRules } from '../helpers';

const world3 = resolveRules(Ruleset.parse(world3Json));

type VehicleDef = { id: string; pos: [number, number]; dir: string };

/** Windrad V -> B -> Y -> Z -> V (siehe hint.test.ts), um `dy` Zeilen verschoben. */
function pinwheel(dy: number): VehicleDef[] {
  return [
    { id: `V${dy}`, pos: [2, 2 + dy], dir: 'E' },
    { id: `B${dy}`, pos: [4, 3 + dy], dir: 'S' },
    { id: `Y${dy}`, pos: [4, 4 + dy], dir: 'W' },
    { id: `Z${dy}`, pos: [2, 4 + dy], dir: 'N' },
  ];
}

function build(
  id: string,
  height: number,
  defs: VehicleDef[],
  fixed: Array<[number, number]> = [],
): Level {
  return Level.parse({
    schema: 'parking.level/1',
    ruleset: 'world3',
    title: 'Test',
    id,
    grid: { width: 6, height, cells: fixed.map(([x, y]) => ({ x, y, type: 'fixed' })) },
    vehicles: defs.map((v) => ({ ...v, type: 's', color: 'blue' })),
    passengers: Array<string>(defs.length * 2).fill('blue'),
  });
}

const withHonk = (s: GameState, honk: number): GameState => ({
  ...s,
  powerUps: { ...s.powerUps, honk },
});

describe('analyze allowHonk', () => {
  const one = build('one', 6, pinwheel(0));
  const two = build('two', 12, [...pinwheel(0), ...pinwheel(6)]);

  it('is unsolvable with taps only and solvable with a honk', () => {
    expect(analyze(one, world3).solvable).toBe(false);
    const a = analyze(one, world3, { allowHonk: true });
    expect(a.solvable).toBe(true);
    expect(a.truncated).toBe(false);
    expect(a.solution?.[0]).toBe('honk:V0');
    expect(a.minMoves).toBe(4); // Hupen zaehlen nicht als Zug
    expect(a.firstMoves.map((m) => m.vehicleId)).toEqual(['honk:V0', 'honk:Z0']);
    expect(a.firstMoves[0]!.winningPaths).not.toBe('0');
  });

  it('is deterministic', () => {
    expect(analyze(one, world3, { allowHonk: true })).toEqual(
      analyze(one, world3, { allowHonk: true }),
    );
  });

  it('limits honks by the remaining counter', () => {
    const s = createGame(two, world3);
    expect(s.powerUps.honk).toBe(1);
    expect(analyzeState(s, world3, { allowHonk: true }).solvable).toBe(false);
    const a = analyzeState(withHonk(s, 2), world3, { allowHonk: true });
    expect(a.solvable).toBe(true);
    expect(a.solution?.filter((x) => x.startsWith('honk:'))).toHaveLength(2);
  });

  it('keeps a noMoves loss with honk left alive', () => {
    const s = createGame(one, world3);
    expect(s.status).toBe('lost');
    expect(analyzeState(s, world3, { allowHonk: true }).solvable).toBe(true);
    expect(analyzeState(withHonk(s, 0), world3, { allowHonk: true }).solvable).toBe(false);
  });

  it('does not change results without honk uses or without the option', () => {
    expect(analyze(level007, classicRules, { allowHonk: true })).toEqual(
      analyze(level007, classicRules),
    );
    const plain = analyze(one, world3);
    expect(plain.firstMoves).toEqual([]);
    expect(plain.deadStates).toBe(0);
  });

  it('keeps honk positions apart in the state space', () => {
    const l = build('free', 6, [...pinwheel(0), { id: 'F', pos: [0, 5], dir: 'S' }]);
    const a = analyze(l, world3, { allowHonk: true });
    const b = analyze(l, world3);
    expect(a.solvable).toBe(true);
    expect(a.statesExplored).toBeGreaterThan(b.statesExplored);
    expect(a.winningPaths).not.toBe('0');
  });
});

describe('hintMove tap before honk', () => {
  // F blockiert den Rueckzug von B (Spalte 4, Zeilen 0-1): die Hupe von V ist erst nach F's Ausfahrt
  // moeglich. Der Poller (0,2) verhindert, dass Z mit seiner Hupe V nach hinten schiebt.
  const l = build('tap-first', 6, [...pinwheel(0), { id: 'F', pos: [5, 0], dir: 'E' }], [[0, 2]]);

  it('suggests the preparing tap while the honk is not yet possible', () => {
    const s = createGame(l, world3);
    const invalid = step(s, { type: 'usePowerUp', powerUp: 'honk', vehicleId: 'V0' }, world3);
    expect(invalid.events.some((e) => e.type === 'invalidAction')).toBe(true);
    expect(hintMove(s, world3)).toEqual({ action: 'tap', vehicleId: 'F' });
  });

  it('then suggests the honk', () => {
    const s = step(createGame(l, world3), { type: 'tapVehicle', vehicleId: 'F' }, world3).state;
    expect(hintMove(s, world3)).toEqual({ action: 'honk', vehicleId: 'V0' });
  });
});

describe('generate requireHonk', () => {
  const opts = (seed: number, extra = {}) => ({
    seed,
    width: 6,
    height: 6,
    vehicleCount: 8,
    colors: world3.vehicles.colors.slice(0, 3),
    ruleset: 'world3',
    requireHonk: true,
    maxAttempts: 200,
    maxStates: 100_000,
    ...extra,
  });
  const SEEDS = [1, 2, 3, 4, 5];

  it.each(SEEDS)('seed %i: tap-only unsolvable, solvable with honk', (seed) => {
    const g = generate(opts(seed), world3);
    const tap = analyze(g.level, world3, { maxStates: 100_000 });
    expect(tap.solvable).toBe(false);
    expect(tap.truncated).toBe(false);
    const honk = analyze(g.level, world3, { maxStates: 100_000, allowHonk: true });
    expect(honk.solvable).toBe(true);
    expect(honk.truncated).toBe(false);
    expect(g.analysis.difficulty).toBe(honk.difficulty);
    expect(honk.solution?.some((x) => x.startsWith('honk:'))).toBe(true);
  });

  it('is deterministic', () => {
    expect(generate(opts(7), world3)).toEqual(generate(opts(7), world3));
  });

  it('combines with bollards and keys', () => {
    const g = generate(opts(3, { bollards: [1, 2], keys: 1, vehicleCount: 9 }), world3);
    expect(analyze(g.level, world3, { maxStates: 100_000 }).solvable).toBe(false);
    expect(analyze(g.level, world3, { maxStates: 100_000, allowHonk: true }).solvable).toBe(true);
    expect(g.level.vehicles.some((v) => v.locked)).toBe(true);
  });

  it('needs honk in the ruleset', () => {
    expect(() => generate(opts(1, { ruleset: 'classic' }), classicRules)).toThrow(/honk/);
  });
});
