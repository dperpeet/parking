import { describe, expect, it } from 'vitest';
import { hashState, legalMoves, step } from '../../../src/engine';
import type { Action, GameState } from '../../../src/engine';
import type { RulesetOverrides } from '../../../src/schema';
import type { LevelSpec } from './helpers';
import { deepFreeze, power, run, setup, tap, v } from './helpers';

const HONK: RulesetOverrides = { powerups: { honk: { enabled: true, uses: 2 } } };
const KEYS: RulesetOverrides = { ...HONK, special: { keyVehicles: true } };
const PASSENGERS = ['blue', 'blue', 'green', 'green'];

const honk = (vehicleId?: string): Action => ({ type: 'usePowerUp', powerUp: 'honk', vehicleId });

function pos(state: GameState, id: string): [number, number] {
  const car = state.vehicles.find((x) => x.id === id)!;
  return [car.x, car.y];
}

/** V (blau) steht auf Zeile 2 und schaut nach Osten, B (gruen) steht quer auf seinem Weg. */
function lane(blocker: ReturnType<typeof v>, extra: Partial<LevelSpec> = {}): LevelSpec {
  return {
    vehicles: [v('V', 1, 2, 'E', 's', 'blue'), blocker],
    passengers: PASSENGERS,
    overrides: HONK,
    ...extra,
  };
}

function expectInvalid(spec: LevelSpec, action: Action, reason: string): void {
  const { state, rules } = setup(spec);
  const res = step(state, action, rules);
  // vehicleId = genanntes Fahrzeug (auch unbekannte IDs), nur ohne Ziel fehlt das Feld.
  const named = action.type === 'usePowerUp' ? action.vehicleId : undefined;
  expect(res.events).toEqual([
    named === undefined
      ? { type: 'invalidAction', reason }
      : { type: 'invalidAction', reason, vehicleId: named },
  ]);
  expect(res.state).toBe(state);
  expect(res.state.powerUps.honk).toBe(state.powerUps.honk);
}

describe('honk: errors', () => {
  const base = lane(v('B', 3, 2, 'S', 's', 'green'));

  it('noUsesLeft comes first', () => {
    const { state, rules } = setup({ ...base, overrides: undefined });
    expect(state.powerUps.honk).toBe(0);
    expect(step(state, honk(), rules).events).toEqual([
      { type: 'invalidAction', reason: 'noUsesLeft' },
    ]);
    expect(step(state, honk('V'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'noUsesLeft', vehicleId: 'V' },
    ]);
  });

  it('noTarget without vehicleId', () => {
    expectInvalid(base, honk(), 'noTarget');
    expectInvalid(base, power('honk'), 'noTarget');
  });

  it('unknownVehicle', () => {
    expectInvalid(base, honk('nope'), 'unknownVehicle');
  });

  it('notParked', () => {
    const { state, rules } = setup({
      vehicles: [v('V', 5, 2, 'E', 's', 'blue'), v('B', 3, 4, 'S', 's', 'green')],
      passengers: PASSENGERS,
      overrides: HONK,
    });
    const exited = step(state, tap('V'), rules).state;
    expect(step(exited, honk('V'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'notParked', vehicleId: 'V' },
    ]);
  });

  it('notBlocked when the path is free', () => {
    expectInvalid(lane(v('B', 3, 4, 'S', 's', 'green')), honk('V'), 'notBlocked');
  });

  it('blockedByBollard when the first obstacle is a fixed cell', () => {
    const spec = lane(v('B', 5, 2, 'S', 's', 'green'), {
      cells: [{ type: 'fixed', x: 3, y: 2 }],
    });
    expectInvalid(spec, honk('V'), 'blockedByBollard');
  });

  it('a vehicle behind a bollard is not the blocker', () => {
    const spec = lane(v('B', 5, 2, 'S', 's', 'green'), {
      cells: [{ type: 'fixed', x: 4, y: 2 }],
    });
    expectInvalid(spec, honk('V'), 'blockedByBollard');
  });

  it('blockerLocked', () => {
    const spec: LevelSpec = {
      vehicles: [
        v('V', 1, 2, 'E', 's', 'blue'),
        v('B', 3, 2, 'S', 's', 'green', { locked: true, keyId: 'K' }),
        v('K', 5, 5, 'E', 's', 'blue'),
      ],
      passengers: ['blue', 'blue', 'blue', 'blue', 'green', 'green'],
      overrides: KEYS,
    };
    expectInvalid(spec, honk('V'), 'blockerLocked');
  });

  it('cannotYield for a blocker on the same lane', () => {
    expectInvalid(lane(v('B', 3, 2, 'E', 's', 'green')), honk('V'), 'cannotYield');
    expectInvalid(lane(v('B', 4, 2, 'W', 's', 'green')), honk('V'), 'cannotYield');
  });

  it('cannotYield when both directions are blocked', () => {
    const spec = lane(v('B', 3, 3, 'S', 's', 'green'), {
      cells: [
        { type: 'fixed', x: 3, y: 4 },
        { type: 'fixed', x: 3, y: 1 },
      ],
    });
    expectInvalid(spec, honk('V'), 'cannotYield');
  });

  it('cannotYield when the grid edge and a vehicle stop the slide', () => {
    const spec: LevelSpec = {
      vehicles: [
        v('V', 1, 4, 'E', 's', 'blue'),
        v('B', 3, 5, 'S', 's', 'green'),
        v('C', 3, 2, 'S', 's', 'green'),
      ],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
      overrides: HONK,
    };
    // B: vorwaerts ueber den Rand, rueckwaerts an C (3,2) vorbei nicht moeglich.
    expectInvalid(spec, honk('V'), 'cannotYield');
  });

  it('is rejected after the game is won', () => {
    const { state, rules } = setup({ ...lane(v('B', 3, 2, 'S', 's', 'green')) });
    const won = run(state, rules, [honk('V'), tap('V'), tap('B')]).state;
    expect(won.status).toBe('won');
    expect(step(won, honk('V'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'gameWon', vehicleId: 'V' },
    ]);
  });
});

describe('honk: yielding', () => {
  it('slides backwards when that is shorter', () => {
    const { state, rules } = setup(lane(v('B', 3, 2, 'S', 's', 'green')));
    const res = step(state, honk('V'), rules);
    expect(res.events).toEqual([
      { type: 'vehicleYielded', vehicleId: 'B', byVehicleId: 'V', from: [3, 2], to: [3, 1] },
      { type: 'powerUpUsed', powerUp: 'honk', remaining: 1 },
    ]);
    expect(pos(res.state, 'B')).toEqual([3, 1]);
    expect(res.state.vehicles.find((x) => x.id === 'B')).toMatchObject({
      dir: 'S',
      status: 'parked',
    });
    expect(res.state.moves).toBe(0);
    expect(res.state.powerUps.honk).toBe(1);
    expect(res.state.powerUpsUsed).toBe(1);
    expect(res.state.history).toHaveLength(1);
  });

  it('slides forwards when that is shorter', () => {
    const { state, rules } = setup(lane(v('B', 3, 3, 'S', 's', 'green')));
    const res = step(state, honk('V'), rules);
    expect(res.events[0]).toEqual({
      type: 'vehicleYielded',
      vehicleId: 'B',
      byVehicleId: 'V',
      from: [3, 3],
      to: [3, 4],
    });
  });

  it('prefers forward on a tie', () => {
    const { state, rules } = setup({
      vehicles: [v('V', 1, 3, 'E', 's', 'blue'), v('B', 3, 4, 'S', 'm', 'green')],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
      overrides: HONK,
      size: 7,
    });
    const res = step(state, honk('V'), rules);
    expect(res.events[0]).toMatchObject({ type: 'vehicleYielded', from: [3, 4], to: [3, 6] });
  });

  it('slides a long blocker over several cells', () => {
    const { state, rules } = setup({
      vehicles: [v('V', 1, 2, 'E', 's', 'blue'), v('B', 3, 3, 'S', 'l', 'green')],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green', 'green', 'green'],
      overrides: HONK,
      size: 8,
    });
    const res = step(state, honk('V'), rules);
    expect(res.events[0]).toMatchObject({ from: [3, 3], to: [3, 6] });
  });

  it('handles north facing blockers', () => {
    const { state, rules } = setup(lane(v('B', 3, 2, 'N', 's', 'green')));
    expect(step(state, honk('V'), rules).events[0]).toMatchObject({ from: [3, 2], to: [3, 3] });
  });

  it('handles west facing blockers', () => {
    const { state, rules } = setup({
      vehicles: [v('V', 2, 1, 'S', 's', 'blue'), v('B', 2, 3, 'W', 'm', 'green')],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
      overrides: HONK,
    });
    expect(step(state, honk('V'), rules).events[0]).toMatchObject({ from: [2, 3], to: [3, 3] });
  });

  it('ignores a locked V', () => {
    const spec: LevelSpec = {
      vehicles: [
        v('V', 1, 2, 'E', 's', 'blue', { locked: true, keyId: 'K' }),
        v('B', 3, 2, 'S', 's', 'green'),
        v('K', 5, 5, 'E', 's', 'blue'),
      ],
      passengers: ['blue', 'blue', 'blue', 'blue', 'green', 'green'],
      overrides: KEYS,
    };
    const { state, rules } = setup(spec);
    const res = step(state, honk('V'), rules);
    expect(res.events[0]).toMatchObject({ type: 'vehicleYielded', vehicleId: 'B' });
    expect(res.state.vehicles.find((x) => x.id === 'V')?.locked).toBe(true);
  });

  it('skips over a bollard on the evasion route by sliding the other way', () => {
    const spec = lane(v('B', 3, 3, 'S', 's', 'green'), { cells: [{ type: 'fixed', x: 3, y: 4 }] });
    const { state, rules } = setup(spec);
    expect(step(state, honk('V'), rules).events[0]).toMatchObject({ from: [3, 3], to: [3, 1] });
  });

  it('is not allowed to slide through another parked vehicle', () => {
    const { state, rules } = setup({
      vehicles: [
        v('V', 1, 2, 'E', 's', 'blue'),
        v('B', 3, 3, 'S', 's', 'green'),
        v('C', 3, 4, 'E', 's', 'green'),
      ],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
      overrides: HONK,
    });
    expect(step(state, honk('V'), rules).events[0]).toMatchObject({ from: [3, 3], to: [3, 1] });
  });

  it('slides away from the edge', () => {
    const { state, rules } = setup({
      vehicles: [v('V', 1, 4, 'E', 's', 'blue'), v('B', 3, 5, 'S', 's', 'green')],
      passengers: PASSENGERS,
      overrides: HONK,
    });
    expect(step(state, honk('V'), rules).events[0]).toMatchObject({ from: [3, 5], to: [3, 3] });
  });

  it('only moves the first obstacle on the path', () => {
    const { state, rules } = setup({
      vehicles: [
        v('V', 1, 2, 'E', 's', 'blue'),
        v('B', 3, 2, 'S', 's', 'green'),
        v('C', 4, 2, 'S', 's', 'green'),
      ],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
      overrides: HONK,
    });
    const res = step(state, honk('V'), rules);
    expect(res.events[0]).toMatchObject({ vehicleId: 'B' });
    expect(pos(res.state, 'C')).toEqual([4, 2]);
  });
});

describe('honk: consequences', () => {
  const spec = lane(v('B', 3, 2, 'S', 's', 'green'));

  it('undo restores the position and costs another use', () => {
    const { state, rules } = setup(spec);
    const honked = step(state, honk('V'), rules).state;
    const undone = step(honked, power('undo'), rules).state;
    expect(undone.vehicles).toEqual(state.vehicles);
    expect(undone.history).toHaveLength(0);
    expect(undone.powerUps.honk).toBe(1);
    expect(undone.powerUpsUsed).toBe(2);
  });

  it('changes the state hash, and the freed vehicle becomes legal', () => {
    const { state, rules } = setup(spec);
    expect(legalMoves(state, rules)).toEqual(['B']);
    const honked = step(state, honk('V'), rules).state;
    expect(hashState(honked)).not.toBe(hashState(state));
    expect(legalMoves(honked, rules)).toEqual(['V', 'B']);
  });

  it('counts towards powerUpsUsed and stars', () => {
    const { state, rules } = setup(spec);
    const res = run(state, rules, [honk('V'), tap('V'), tap('B')]);
    expect(res.state).toMatchObject({ status: 'won', powerUpsUsed: 1, moves: 2, stars: 2 });
    expect(res.events.filter((e) => e.type === 'powerUpUsed')).toHaveLength(1);
    expect(res.events.at(-1)).toEqual({ type: 'won', moves: 2, stars: 2 });
  });

  it('is deterministic and leaves the input untouched', () => {
    const { state, rules } = setup(spec);
    const frozen = deepFreeze(structuredClone(state));
    const a = step(frozen, honk('V'), rules);
    const b = step(structuredClone(state), honk('V'), rules);
    expect(a).toEqual(b);
    expect(frozen).toEqual(state);
    expect(a.state.vehicles).not.toBe(frozen.vehicles);
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
  });
});

/** Ring aus vier Fahrzeugen (x -> w -> u -> t -> x) plus p hinter w: das Spiel startet verloren. */
const RING: LevelSpec = {
  vehicles: [
    v('x', 1, 2, 'E', 's', 'green'),
    v('w', 3, 2, 'S', 's', 'green'),
    v('u', 3, 4, 'W', 's', 'blue'),
    v('t', 1, 4, 'N', 's', 'blue'),
  ],
  passengers: ['green', 'green', 'green', 'green', 'blue', 'blue', 'blue', 'blue'],
  overrides: HONK,
};

describe('honk: after a noMoves loss', () => {
  it('rescues the game and re-evaluates', () => {
    const { state, rules } = setup(RING);
    expect(state).toMatchObject({ status: 'lost', loseReason: 'noMoves' });
    const res = step(state, honk('x'), rules);
    expect(res.events.map((e) => e.type)).toEqual(['vehicleYielded', 'powerUpUsed']);
    expect(res.state).toMatchObject({ status: 'playing', loseReason: null, stars: 0 });
    expect(pos(res.state, 'w')).toEqual([3, 1]);
    expect(legalMoves(res.state, rules)).toEqual(['x']);
  });

  it('can lose again when no move is gained', () => {
    const { state, rules } = setup({
      ...RING,
      vehicles: [...RING.vehicles, v('p', 5, 2, 'S', 's', 'yellow')],
      passengers: [...RING.passengers, 'yellow', 'yellow'],
      cells: [{ type: 'fixed', x: 5, y: 4 }],
    });
    expect(state).toMatchObject({ status: 'lost', loseReason: 'noMoves' });
    const res = step(state, honk('x'), rules);
    expect(res.events.map((e) => e.type)).toEqual(['vehicleYielded', 'powerUpUsed', 'lost']);
    expect(res.state).toMatchObject({ status: 'lost', loseReason: 'noMoves' });
    expect(res.state.powerUpsUsed).toBe(1);
  });

  it('stays gameLost for other loss reasons', () => {
    const limited = setup({
      vehicles: [v('V', 1, 2, 'E', 's', 'blue'), v('B', 3, 2, 'S', 's', 'green')],
      passengers: PASSENGERS,
      overrides: { ...HONK, limits: { moves: 1 } },
    });
    const lost = step(
      step(limited.state, honk('V'), limited.rules).state,
      tap('V'),
      limited.rules,
    ).state;
    expect(lost).toMatchObject({ status: 'lost', loseReason: 'movesLimit' });
    const res = step(lost, honk('V'), limited.rules);
    expect(res.events).toEqual([{ type: 'invalidAction', reason: 'gameLost', vehicleId: 'V' }]);
    expect(res.state).toBe(lost);
  });

  it('stays gameLost after queueFull', () => {
    const { state, rules } = setup({
      vehicles: [v('a', 5, 0, 'E', 's', 'blue'), v('b', 5, 1, 'E', 's', 'green')],
      passengers: ['green', 'green', 'blue', 'blue'],
      overrides: { ...HONK, queue: { slots: 1 } },
    });
    const lost = step(state, tap('a'), rules).state;
    expect(lost).toMatchObject({ status: 'lost', loseReason: 'queueFull' });
    expect(step(lost, honk('a'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'gameLost', vehicleId: 'a' },
    ]);
  });

  it('undo after a rescue returns to the lost position', () => {
    const { state, rules } = setup(RING);
    const rescued = step(state, honk('x'), rules).state;
    const back = step(rescued, power('undo'), rules).state;
    expect(back.vehicles).toEqual(state.vehicles);
    expect(back.status).toBe('playing');
  });
});
