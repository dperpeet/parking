import { describe, expect, it } from 'vitest';
import { createGame, hashState, legalMoves, step, validateLevel } from '../../../src/engine';
import type { Action, GameEvent, GameState } from '../../../src/engine';
import type { Dir, Level, ResolvedRules, RulesetOverrides } from '../../../src/schema';
import { level as level007, rules as rules007, WIN_ORDER } from '../helpers';
import type { LevelSpec } from './helpers';
import { makeLevel, rulesWith, run, setup, tap, taps, v } from './helpers';

const TURNS: RulesetOverrides = { movement: { model: 'turns' }, special: { oneWay: true } };
const HONK: RulesetOverrides = { ...TURNS, powerups: { honk: { enabled: true, uses: 2 } } };

type Cells = Level['grid']['cells'];
const arrow = (x: number, y: number, dir: Dir): Cells[number] => ({ x, y, type: 'oneWay', dir });
const honk = (vehicleId: string): Action => ({ type: 'usePowerUp', powerUp: 'honk', vehicleId });
const exited = (events: GameEvent[]): GameEvent[] =>
  events.filter((e) => e.type === 'vehicleExited');

/** V (blau) faehrt nach Osten und biegt bei (3,2) nach Sueden ab; B (gruen) steht auf dem Abbiegeweg. */
function bent(extra: Partial<LevelSpec> = {}): LevelSpec {
  return {
    vehicles: [v('V', 1, 2, 'E', 's', 'blue'), v('B', 3, 4, 'E', 's', 'green')],
    passengers: ['blue', 'blue', 'green', 'green'],
    cells: [arrow(3, 2, 'S')],
    overrides: TURNS,
    ...extra,
  };
}

describe('turns: tap and exit', () => {
  it('blocks on the bent path and exits with path and exitDir', () => {
    const { state, rules } = setup(bent());
    expect(legalMoves(state, rules)).toEqual(['B']);
    expect(step(state, tap('V'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'V', reason: 'path', blockerId: 'B' },
    ]);
    const res = run(state, rules, taps(['B', 'V']));
    expect(exited(res.events)).toEqual([
      {
        type: 'vehicleExited',
        vehicleId: 'B',
        slotIndex: 0,
        path: [
          [4, 4],
          [5, 4],
        ],
      },
      {
        type: 'vehicleExited',
        vehicleId: 'V',
        slotIndex: 1,
        path: [
          [2, 2],
          [3, 2],
          [3, 3],
          [3, 4],
          [3, 5],
        ],
        exitDir: 'S',
      },
    ]);
    expect('exitDir' in exited(res.events)[0]!).toBe(false);
    expect(res.state.status).toBe('won');
  });

  it('a vehicle straight ahead does not block the bent path', () => {
    const spec = bent({
      vehicles: [v('V', 1, 2, 'E', 's', 'blue'), v('C', 5, 1, 'N', 's', 'green')],
    });
    const { state, rules } = setup(spec);
    expect(legalMoves(state, rules)).toEqual(['V', 'C']);
  });

  it('no exitDir when an arrow points in driving direction', () => {
    const { state, rules } = setup(bent({ cells: [arrow(3, 2, 'E')] }));
    const ev = exited(step(state, tap('V'), rules).events)[0]!;
    expect(ev).toEqual({
      type: 'vehicleExited',
      vehicleId: 'V',
      slotIndex: 0,
      path: [
        [2, 2],
        [3, 2],
        [4, 2],
        [5, 2],
      ],
    });
    expect('exitDir' in ev).toBe(false);
  });

  it('a wrong-way arrow blocks like a bollard', () => {
    const { state, rules } = setup(bent({ cells: [arrow(3, 2, 'W')] }));
    expect(legalMoves(state, rules)).toEqual(['B']);
    expect(step(state, tap('V'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'V', reason: 'path', blockerId: null },
    ]);
  });

  it('an arrow loop (bypassing validation) counts as blocked', () => {
    const { state, rules } = setup(bent({ cells: [] }));
    const loop = [arrow(2, 1, 'E'), arrow(4, 1, 'S'), arrow(4, 3, 'W'), arrow(2, 3, 'N')];
    const looped: GameState = {
      ...state,
      grid: { ...state.grid, cells: loop },
      vehicles: state.vehicles.map((x) => (x.id === 'V' ? { ...x, x: 0, y: 1 } : x)),
    };
    expect(step(looped, tap('V'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'V', reason: 'path', blockerId: null },
    ]);
  });

  it('turns without arrows behaves exactly like straight (level 007)', () => {
    const turns: ResolvedRules = {
      ...rules007,
      movement: { ...rules007.movement, model: 'turns' },
    };
    const a = createGame(level007, rules007);
    const b = createGame(level007, turns);
    expect(hashState(b)).toBe(hashState(a));
    const ra = run(a, rules007, taps(WIN_ORDER));
    const rb = run(b, turns, taps(WIN_ORDER));
    expect(rb.events).toEqual(ra.events);
    expect(hashState(rb.state)).toBe(hashState(ra.state));
  });
});

describe('turns: honk', () => {
  it('the first obstacle on the bent path yields', () => {
    const { state, rules } = setup(bent({ overrides: HONK }));
    const res = step(state, honk('V'), rules);
    expect(res.events).toContainEqual({
      type: 'vehicleYielded',
      vehicleId: 'B',
      byVehicleId: 'V',
      from: [3, 4],
      to: [2, 4],
    });
    expect(legalMoves(res.state, rules)).toContain('V');
  });

  it('a blocker never yields onto an arrow cell', () => {
    const { state, rules } = setup(
      bent({ overrides: HONK, cells: [arrow(3, 2, 'S'), arrow(1, 4, 'N')] }),
    );
    const res = step(state, honk('V'), rules);
    expect(res.events).toContainEqual(
      expect.objectContaining({ type: 'vehicleYielded', vehicleId: 'B', to: [5, 4] }),
    );
  });

  it('wrongWay when a wrong-way arrow is the first obstacle', () => {
    const { state, rules } = setup(bent({ overrides: HONK, cells: [arrow(3, 2, 'W')] }));
    expect(step(state, honk('V'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'wrongWay', vehicleId: 'V' },
    ]);
  });

  it('blockedByBollard is checked before wrongWay', () => {
    const cells: Cells = [{ x: 2, y: 2, type: 'fixed' }, arrow(3, 2, 'W')];
    const overrides: RulesetOverrides = { ...HONK, special: { oneWay: true, fixed: true } };
    const { state, rules } = setup(bent({ overrides, cells }));
    expect(step(state, honk('V'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'blockedByBollard', vehicleId: 'V' },
    ]);
  });
});

describe('turns: mystery', () => {
  const MYSTERY: RulesetOverrides = { ...TURNS, special: { oneWay: true, mysteryVehicles: true } };

  it('reveals via the bent path', () => {
    const spec = bent({
      overrides: MYSTERY,
      vehicles: [
        v('V', 1, 2, 'E', 's', 'blue', { mystery: true }),
        v('B', 3, 4, 'E', 's', 'green'),
      ],
    });
    const { state, rules } = setup(spec);
    expect(state.vehicles[0]!.hidden).toBe(true);
    const res = step(state, tap('B'), rules);
    expect(res.events).toContainEqual({ type: 'vehicleRevealed', vehicleId: 'V', color: 'blue' });
  });

  it('starts revealed when only the straight line is blocked', () => {
    const spec = bent({
      overrides: MYSTERY,
      vehicles: [
        v('V', 1, 2, 'E', 's', 'blue', { mystery: true }),
        v('C', 5, 1, 'N', 's', 'green'),
      ],
    });
    expect(setup(spec).state.vehicles[0]!.hidden).toBe(false);
  });
});

describe('turns: validation', () => {
  const codes = (
    spec: LevelSpec,
    overrides: RulesetOverrides | undefined = spec.overrides,
  ): string[] => validateLevel(makeLevel(spec), rulesWith(overrides)).map((i) => i.code);

  it('accepts a valid arrow level', () => {
    expect(codes(bent())).toEqual([]);
  });

  it('oneWayDisabled without special.oneWay or without turns', () => {
    expect(codes(bent(), {})).toEqual(['oneWayDisabled']);
    expect(codes(bent(), { special: { oneWay: true } })).toEqual(['oneWayDisabled']);
    expect(codes(bent(), { movement: { model: 'turns' } })).toEqual(['oneWayDisabled']);
  });

  it('oneWayInvalid for an arrow without dir', () => {
    expect(codes(bent({ cells: [{ x: 3, y: 2, type: 'oneWay' }] }))).toEqual(['oneWayInvalid']);
  });

  it('oneWayInvalid for an arrow loop', () => {
    const loop = [arrow(2, 0, 'E'), arrow(4, 0, 'S'), arrow(4, 1, 'W'), arrow(2, 1, 'N')];
    const issues = codes(bent({ cells: loop }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((c) => c === 'oneWayInvalid')).toBe(true);
  });

  it('no loop when a path re-enters an arrow from the front', () => {
    // (2,0) O -> (4,0) S -> (4,1) W -> (2,1) O: von vorn betreten, Falschfahrt statt Schleife.
    const cells = [arrow(2, 0, 'E'), arrow(4, 0, 'S'), arrow(4, 1, 'W'), arrow(2, 1, 'E')];
    expect(codes(bent({ cells }))).toEqual([]);
  });

  it('oneWayInvalid for an arrow on another cell', () => {
    const cells: Cells = [arrow(3, 2, 'S'), { x: 3, y: 2, type: 'fixed' }];
    const overrides: RulesetOverrides = { ...TURNS, special: { oneWay: true, fixed: true } };
    expect(codes(bent({ cells, overrides }))).toEqual(['oneWayInvalid']);
  });

  it('overlap for a vehicle on an arrow cell', () => {
    expect(codes(bent({ cells: [arrow(0, 2, 'N')] }))).toEqual(['overlap']);
  });
});
