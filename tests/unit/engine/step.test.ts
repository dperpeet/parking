import { describe, expect, it } from 'vitest';
import { legalMoves, step } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { BASIC, DEADLOCK, QUEUE4, run, setup, tap, taps, v } from './helpers';

describe('createGame', () => {
  it('builds the initial state from level and rules', () => {
    const { state } = setup(BASIC);
    expect(state.v).toBe(1);
    expect(state.slots).toHaveLength(5);
    expect(state.slots.every((s) => s.kind === 'empty')).toBe(true);
    expect(state.vehicles[0]).toMatchObject({ id: 'a', length: 2, capacity: 2, status: 'parked' });
    expect(state.powerUps).toEqual({ undo: 3, shuffle: 1, extraSlot: 1, honk: 0 });
    expect(state.status).toBe('playing');
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('applies locked slots and disabled power-ups', () => {
    const { state } = setup({
      ...BASIC,
      overrides: { queue: { lockedSlots: [1] }, powerups: { undo: { enabled: false, uses: 3 } } },
    });
    expect(state.slots[1]).toEqual({ kind: 'locked' });
    expect(state.powerUps.undo).toBe(0);
  });

  it('seeds the rng from argument, then level.seed, then 0', () => {
    expect(setup(BASIC, 7).state.rng).toBe(7);
    expect(setup({ ...BASIC, seed: 9 }).state.rng).toBe(9);
    expect(setup({ ...BASIC, seed: 9 }, 3).state.rng).toBe(3);
    expect(setup(BASIC).state.rng).toBe(0);
  });

  it('starts lost when nothing can move', () => {
    const { state } = setup({
      vehicles: [v('x', 1, 2, 'E', 's', 'green'), v('y', 3, 2, 'W', 's', 'green')],
      passengers: ['green', 'green', 'green', 'green'],
    });
    expect(state.status).toBe('lost');
    expect(state.loseReason).toBe('noMoves');
  });
});

describe('tap: blocking', () => {
  const blocking = {
    vehicles: [v('c', 3, 2, 'E', 's', 'blue'), v('d', 5, 2, 'E', 's', 'blue')],
    passengers: ['blue', 'blue', 'blue', 'blue'],
  };

  it('blocks on a parked vehicle in the path and names the blocker', () => {
    const { state, rules } = setup(blocking);
    const res = step(state, tap('c'), rules);
    expect(res.events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'c', reason: 'path', blockerId: 'd' },
    ]);
    expect(res.state).toBe(state);
    expect(res.state.moves).toBe(0);
    expect(res.state.history).toHaveLength(0);
  });

  it('a queued vehicle no longer blocks', () => {
    const { state, rules } = setup(blocking);
    const { state: after } = run(state, rules, taps(['d', 'c']));
    expect(after.vehicles.find((x) => x.id === 'c')?.status).not.toBe('parked');
    expect(after.moves).toBe(2);
  });

  it('blocks on fixed cells with blockerId null', () => {
    const { state, rules } = setup({
      vehicles: [v('e', 3, 2, 'E', 's', 'blue'), v('f', 5, 5, 'E', 's', 'blue')],
      passengers: ['blue', 'blue', 'blue', 'blue'],
      cells: [{ x: 4, y: 2, type: 'fixed' }],
    });
    expect(step(state, tap('e'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'e', reason: 'path', blockerId: null },
    ]);
    expect(legalMoves(state, rules)).toEqual(['f']);
  });

  it('works for every direction', () => {
    const { state, rules } = setup({
      vehicles: [
        v('n', 0, 1, 'N', 's', 'blue'),
        v('e', 5, 2, 'E', 's', 'blue'),
        v('s', 0, 4, 'S', 's', 'green'),
        v('w', 4, 5, 'W', 's', 'green'),
      ],
      passengers: ['blue', 'blue', 'blue', 'blue', 'green', 'green', 'green', 'green'],
    });
    expect(legalMoves(state, rules)).toEqual(['n', 'e', 's', 'w']);
    const res = step(state, tap('s'), rules);
    expect(res.events[0]).toMatchObject({
      type: 'vehicleExited',
      path: [[0, 5]],
    });
  });

  it('reports locked before path, and unlocks via keyId', () => {
    const { state, rules } = setup({
      vehicles: [
        v('k', 5, 0, 'E', 's', 'blue'),
        v('l', 3, 3, 'E', 's', 'green', { locked: true, keyId: 'k' }),
        v('m', 5, 3, 'E', 's', 'green'),
      ],
      passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
    });
    expect(legalMoves(state, rules)).toEqual(['k', 'm']);
    expect(step(state, tap('l'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'l', reason: 'locked', blockerId: null },
    ]);
    const res = step(state, tap('k'), rules);
    expect(res.events.map((e) => e.type)).toEqual([
      'vehicleExited',
      'vehicleUnlocked',
      'passengerBoarded',
      'passengerBoarded',
      'vehicleDeparted',
    ]);
    expect(res.state.vehicles.find((x) => x.id === 'l')?.locked).toBe(false);
    // Entsperrt, aber der Weg ist durch m blockiert.
    expect(step(res.state, tap('l'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'l', reason: 'path', blockerId: 'm' },
    ]);
    const done = run(res.state, rules, taps(['m', 'l'])).state;
    expect(done.status).toBe('won');
  });

  it('reports queueFull when no slot is free (crafted state)', () => {
    const { state, rules } = setup(BASIC);
    const full: GameState = {
      ...state,
      slots: state.slots.map(() => ({
        kind: 'vehicle' as const,
        vehicleId: 'zz',
        color: 'pink',
        capacity: 2,
        filled: 0,
      })),
    };
    expect(step(full, tap('a'), rules).events).toEqual([
      { type: 'vehicleBlocked', vehicleId: 'a', reason: 'queueFull', blockerId: null },
    ]);
    expect(legalMoves(full, rules)).toEqual([]);
  });

  it('path has priority over queueFull', () => {
    const { state, rules } = setup({
      vehicles: [v('c', 3, 2, 'E', 's', 'blue'), v('d', 5, 2, 'E', 's', 'blue')],
      passengers: ['blue', 'blue', 'blue', 'blue'],
    });
    const full: GameState = {
      ...state,
      slots: state.slots.map(() => ({ kind: 'locked' as const })),
    };
    const ev = step(full, tap('c'), rules).events[0];
    expect(ev).toMatchObject({ reason: 'path' });
  });

  it('rejects unknown and non-parked vehicles', () => {
    const { state, rules } = setup(BASIC);
    expect(step(state, tap('nope'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'unknownVehicle' },
    ]);
    const queued = step(state, tap('b'), rules).state;
    expect(step(queued, tap('b'), rules).events[0]).toMatchObject({ type: 'invalidAction' });
  });
});

describe('exit, queue policies and boarding', () => {
  it('exit records a snapshot, counts a move and emits the path', () => {
    const { state, rules } = setup({
      vehicles: [v('a', 2, 0, 'E', 's', 'blue'), v('b', 5, 5, 'E', 's', 'blue')],
      passengers: ['blue', 'blue', 'blue', 'blue'],
    });
    const res = step(state, tap('a'), rules);
    expect(res.state.moves).toBe(1);
    expect(res.state.history).toHaveLength(1);
    expect(res.state.history[0]?.moves).toBe(0);
    expect(res.events[0]).toEqual({
      type: 'vehicleExited',
      vehicleId: 'a',
      slotIndex: 0,
      path: [
        [3, 0],
        [4, 0],
        [5, 0],
      ],
    });
  });

  it('firstFree reuses the first hole, fifo shifts the queue up', () => {
    const sequence = taps(['a', 'c', 'b']);
    // a, c, b belegen 0, 1, 2. b steigt ein, dann a: Loch an Slot 0.
    const ff = setup(QUEUE4);
    const ffRun = run(ff.state, ff.rules, sequence);
    expect(ffRun.events.some((e) => e.type === 'slotShifted')).toBe(false);
    expect(ffRun.state.slots[0]).toEqual({ kind: 'empty' });
    expect(ffRun.state.slots[1]).toMatchObject({ kind: 'vehicle', vehicleId: 'c' });
    const ffD = step(ffRun.state, tap('d'), ff.rules);
    expect(ffD.events[0]).toMatchObject({ type: 'vehicleExited', slotIndex: 0 });

    const fifo = setup({ ...QUEUE4, overrides: { queue: { fillPolicy: 'fifo' } } });
    const fifoRun = run(fifo.state, fifo.rules, sequence);
    expect(fifoRun.events).toContainEqual({
      type: 'slotShifted',
      vehicleId: 'c',
      from: 1,
      to: 0,
    });
    expect(fifoRun.state.slots[0]).toMatchObject({ kind: 'vehicle', vehicleId: 'c' });
    const fifoD = step(fifoRun.state, tap('d'), fifo.rules);
    expect(fifoD.events[0]).toMatchObject({ type: 'vehicleExited', slotIndex: 1 });
  });

  it('fifo skips locked slots when compacting', () => {
    const { state, rules } = setup({
      ...QUEUE4,
      overrides: { queue: { fillPolicy: 'fifo', lockedSlots: [1], slots: 4 } },
    });
    const res = run(state, rules, taps(['a', 'c']));
    expect(res.state.slots.map((s) => s.kind)).toEqual(['vehicle', 'locked', 'vehicle', 'empty']);
    const after = run(res.state, rules, taps(['b']));
    // b (gruen) steigt ein und faehrt ab, dann a (blau): c rutscht von Slot 2 auf 0.
    expect(after.events).toContainEqual({ type: 'slotShifted', vehicleId: 'c', from: 2, to: 0 });
    expect(after.state.slots.map((s) => s.kind)).toEqual(['vehicle', 'locked', 'empty', 'empty']);
  });

  it('boards into the lowest slot index first (firstMatch) and departs when full', () => {
    const { state, rules } = setup({
      vehicles: [
        v('a', 5, 0, 'E', 's', 'blue'),
        v('b', 5, 1, 'E', 's', 'blue'),
        v('g', 5, 2, 'E', 's', 'green'),
      ],
      passengers: ['green', 'green', 'blue', 'blue', 'blue', 'blue'],
    });
    const res = run(state, rules, taps(['a', 'b', 'g']));
    const boarded = res.events.filter((e) => e.type === 'passengerBoarded');
    expect(boarded.map((e) => e.vehicleId)).toEqual(['g', 'g', 'a', 'a', 'b', 'b']);
    expect(boarded.map((e) => e.slotIndex)).toEqual([2, 2, 0, 0, 1, 1]);
    expect(boarded[0]).toMatchObject({ passengerIndex: 0, color: 'green', filled: 1 });
    expect(boarded[1]).toMatchObject({ filled: 2 });
    const departed = res.events.filter((e) => e.type === 'vehicleDeparted');
    expect(departed.map((e) => e.vehicleId)).toEqual(['g', 'a', 'b']);
    expect(res.state.vehicles.every((x) => x.status === 'departed')).toBe(true);
    expect(res.state.status).toBe('won');
  });

  it('keeps a boarded vehicle in its slot until it is full', () => {
    const { state, rules } = setup({
      vehicles: [v('a', 5, 0, 'E', 'm', 'blue'), v('b', 5, 1, 'E', 's', 'green')],
      passengers: ['blue', 'green', 'green', 'blue', 'blue', 'blue'],
    });
    const res = run(state, rules, taps(['a']));
    expect(res.state.slots[0]).toMatchObject({ kind: 'vehicle', filled: 1, capacity: 4 });
    expect(res.state.passengerIndex).toBe(1);
  });
});

describe('win and stars', () => {
  it('wins with 3 stars (powerupsUsed 0) and emits won', () => {
    const { state, rules } = setup(BASIC);
    const res = run(state, rules, taps(['a', 'b']));
    expect(res.state).toMatchObject({ status: 'won', stars: 3, moves: 2, loseReason: null });
    expect(res.events.at(-1)).toEqual({ type: 'won', moves: 2, stars: 3 });
  });

  it('powerupsUsed: 1 used -> 2 stars, 3 used -> 1 star', () => {
    const one = setup(BASIC);
    const r1 = run(one.state, one.rules, [
      { type: 'usePowerUp', powerUp: 'extraSlot' },
      ...taps(['a', 'b']),
    ]);
    expect(r1.state).toMatchObject({ status: 'won', stars: 2, powerUpsUsed: 1 });

    const many = setup({ ...BASIC, overrides: { scoring: { stars: { three: 0, two: 2 } } } });
    const r3 = run(many.state, many.rules, [
      { type: 'usePowerUp', powerUp: 'extraSlot' },
      { type: 'usePowerUp', powerUp: 'shuffle' },
      { type: 'usePowerUp', powerUp: 'undo' },
      ...taps(['a', 'b']),
    ]);
    expect(r3.state.status).toBe('won');
    expect(r3.state.powerUpsUsed).toBe(3);
    expect(r3.state.stars).toBe(1);
  });

  it('moves mode scores by moves', () => {
    const cfg = (three: number, two: number) => ({
      scoring: { starMode: 'moves' as const, stars: { three, two } },
    });
    const stars = (three: number, two: number) => {
      const { state, rules } = setup({ ...BASIC, overrides: cfg(three, two) });
      return run(state, rules, taps(['a', 'b'])).state.stars;
    };
    expect(stars(2, 2)).toBe(3);
    expect(stars(1, 2)).toBe(2);
    expect(stars(0, 1)).toBe(1);
  });

  it('time mode: the engine has no clock, so it awards the best value', () => {
    const { state, rules } = setup({
      ...BASIC,
      overrides: { scoring: { starMode: 'time', stars: { three: 0, two: 5 } } },
    });
    expect(run(state, rules, taps(['a', 'b'])).state.stars).toBe(3);
  });

  it('rejects any action once won', () => {
    const { state, rules } = setup(BASIC);
    const won = run(state, rules, taps(['a', 'b'])).state;
    for (const action of [
      tap('a'),
      { type: 'usePowerUp' as const, powerUp: 'undo' as const },
      { type: 'timeUp' as const },
    ]) {
      const res = step(won, action, rules);
      expect(res.events).toEqual([{ type: 'invalidAction', reason: 'gameWon' }]);
      expect(res.state).toBe(won);
    }
  });
});

describe('losing', () => {
  it('queueFull when the front passenger fits nowhere and no slot is free', () => {
    const { state, rules } = setup({
      ...BASIC,
      passengers: ['green', 'green', 'blue', 'blue'],
      overrides: { queue: { slots: 1 } },
    });
    const res = step(state, tap('a'), rules);
    expect(res.state).toMatchObject({ status: 'lost', loseReason: 'queueFull' });
    expect(res.events.at(-1)).toEqual({ type: 'lost', reason: 'queueFull' });
  });

  it('full queue is not a loss when loseOnFull is off (then noMoves applies)', () => {
    const { state, rules } = setup({
      ...BASIC,
      passengers: ['green', 'green', 'blue', 'blue'],
      overrides: { queue: { slots: 1, loseOnFull: false } },
    });
    const res = step(state, tap('a'), rules);
    expect(res.state.loseReason).toBe('noMoves');
  });

  it('noMoves: two vehicles facing each other', () => {
    const { state, rules } = setup(DEADLOCK);
    expect(legalMoves(state, rules)).toEqual(['z']);
    const res = step(state, tap('z'), rules);
    expect(res.state).toMatchObject({ status: 'lost', loseReason: 'noMoves' });
    expect(res.events.at(-1)).toEqual({ type: 'lost', reason: 'noMoves' });
    expect(legalMoves(res.state, rules)).toEqual([]);
  });

  it('movesLimit when the limit is reached without winning', () => {
    const { state, rules } = setup({ ...BASIC, overrides: { limits: { moves: 1 } } });
    const res = step(state, tap('a'), rules);
    expect(res.state).toMatchObject({ status: 'lost', loseReason: 'movesLimit' });
  });

  it('winning on the last allowed move is a win', () => {
    const { state, rules } = setup({ ...BASIC, overrides: { limits: { moves: 2 } } });
    expect(run(state, rules, taps(['a', 'b'])).state.status).toBe('won');
  });

  it('priority: noMoves before movesLimit', () => {
    const { state, rules } = setup({ ...DEADLOCK, overrides: { limits: { moves: 1 } } });
    expect(step(state, tap('z'), rules).state.loseReason).toBe('noMoves');
  });

  it('timeUp loses a running game', () => {
    const { state, rules } = setup(BASIC);
    const res = step(state, { type: 'timeUp' }, rules);
    expect(res.state).toMatchObject({ status: 'lost', loseReason: 'timeUp' });
    expect(res.events).toEqual([{ type: 'lost', reason: 'timeUp' }]);
    expect(state.status).toBe('playing');
  });

  it('rejects taps, timeUp and other power-ups once lost', () => {
    const { state, rules } = setup(DEADLOCK);
    const lost = step(state, tap('z'), rules).state;
    expect(step(lost, tap('x'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'gameLost' },
    ]);
    expect(step(lost, { type: 'timeUp' }, rules).events[0]).toMatchObject({
      type: 'invalidAction',
    });
    expect(step(lost, { type: 'usePowerUp', powerUp: 'shuffle' }, rules).events[0]).toMatchObject({
      type: 'invalidAction',
    });
  });
});
