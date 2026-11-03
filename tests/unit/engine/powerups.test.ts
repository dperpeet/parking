import { describe, expect, it } from 'vitest';
import { createRng, nextRandom, step } from '../../../src/engine';
import { BASIC, DEADLOCK, QUEUE4, power, run, setup, tap, taps } from './helpers';

describe('undo', () => {
  it('restores the previous snapshot and costs one use', () => {
    const { state, rules } = setup(BASIC);
    const moved = step(state, tap('a'), rules).state;
    const res = step(moved, power('undo'), rules);
    expect(res.events).toEqual([
      { type: 'stateRestored' },
      { type: 'powerUpUsed', powerUp: 'undo', remaining: 2 },
    ]);
    expect(res.state.moves).toBe(0);
    expect(res.state.vehicles).toEqual(state.vehicles);
    expect(res.state.slots).toEqual(state.slots);
    expect(res.state.passengerIndex).toBe(0);
    expect(res.state.history).toHaveLength(0);
    expect(res.state.powerUps.undo).toBe(2);
    expect(res.state.powerUpsUsed).toBe(1);
  });

  it('is itself not undoable (no snapshot is added)', () => {
    const { state, rules } = setup(QUEUE4);
    const r = run(state, rules, [tap('a'), tap('c'), power('undo'), power('undo')]);
    expect(r.state.moves).toBe(0);
    expect(step(r.state, power('undo'), rules).events[0]).toEqual({
      type: 'invalidAction',
      reason: 'noHistory',
    });
  });

  it('is invalid without history, and does not consume a use', () => {
    const { state, rules } = setup(BASIC);
    const res = step(state, power('undo'), rules);
    expect(res.events).toEqual([{ type: 'invalidAction', reason: 'noHistory' }]);
    expect(res.state).toBe(state);
    expect(res.state.powerUps.undo).toBe(3);
  });

  it('is invalid with no uses left or when disabled', () => {
    const { state, rules } = setup({
      ...BASIC,
      overrides: { powerups: { undo: { enabled: true, uses: 1 } } },
    });
    const r = run(state, rules, [tap('a'), power('undo'), tap('a')]);
    expect(step(r.state, power('undo'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'noUsesLeft' },
    ]);
    const off = setup({
      ...BASIC,
      overrides: { powerups: { undo: { enabled: false, uses: 3 } } },
    });
    expect(step(off.state, power('undo'), off.rules).events[0]).toMatchObject({
      type: 'invalidAction',
    });
  });

  it('works after the game is lost and resumes play', () => {
    const { state, rules } = setup(DEADLOCK);
    const lost = step(state, tap('z'), rules).state;
    expect(lost.status).toBe('lost');
    const res = step(lost, power('undo'), rules);
    expect(res.state).toMatchObject({ status: 'playing', loseReason: null, moves: 0, stars: 0 });
    expect(res.state.vehicles.find((x) => x.id === 'z')?.status).toBe('parked');
    expect(res.events.map((e) => e.type)).toEqual(['stateRestored', 'powerUpUsed']);
  });

  it('is rejected after the game is won', () => {
    const { state, rules } = setup(BASIC);
    const won = run(state, rules, taps(['a', 'b'])).state;
    expect(step(won, power('undo'), rules).events[0]).toMatchObject({ type: 'invalidAction' });
  });
});

describe('shuffle', () => {
  const spec = { ...QUEUE4, overrides: { passengers: { visible: 4 } } };

  /** Unabhaengige Fisher-Yates-Referenz ueber das Fenster. */
  function expected(passengers: string[], from: number, to: number, seed: number): string[] {
    const out = [...passengers];
    let rng = createRng(seed);
    for (let i = to - 1; i > from; i--) {
      const [value, next] = nextRandom(rng);
      rng = next;
      const j = from + Math.floor(value * (i - from + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  it('permutes only the visible window using the state rng', () => {
    const { state, rules } = setup(spec, 11);
    const res = step(state, power('shuffle'), rules);
    expect(res.events[0]).toEqual({ type: 'passengersShuffled', from: 0, to: 4 });
    expect(res.events[1]).toEqual({ type: 'powerUpUsed', powerUp: 'shuffle', remaining: 0 });
    expect(res.state.passengers).toEqual(expected(state.passengers, 0, 4, 11));
    expect(res.state.passengers.slice(4)).toEqual(state.passengers.slice(4));
    expect([...res.state.passengers].sort()).toEqual([...state.passengers].sort());
    expect(res.state.rng).not.toBe(state.rng);
    expect(res.state.history).toHaveLength(1);
  });

  it('different seeds give different permutations for some seed', () => {
    const { rules, state } = setup(spec, 1);
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const s = setup(spec, seed).state;
      orders.add(step(s, power('shuffle'), rules).state.passengers.join());
    }
    expect(orders.size).toBeGreaterThan(1);
    expect(state.passengers).toHaveLength(8);
  });

  it('window starts at passengerIndex and boarding follows the new order', () => {
    const { state, rules } = setup(spec, 5);
    const afterTap = step(state, tap('b'), rules).state; // gruen steigt nicht ein: b in Slot, front=green
    expect(afterTap.passengerIndex).toBe(2);
    const res = step(afterTap, power('shuffle'), rules);
    expect(res.events[0]).toEqual({ type: 'passengersShuffled', from: 2, to: 6 });
    expect(res.state.passengers.slice(0, 2)).toEqual(['green', 'green']);
  });

  it('can be undone, restoring passengers and rng', () => {
    const { state, rules } = setup(spec, 3);
    const shuffled = step(state, power('shuffle'), rules).state;
    const back = step(shuffled, power('undo'), rules).state;
    expect(back.passengers).toEqual(state.passengers);
    expect(back.rng).toBe(state.rng);
  });

  it('is invalid with nothing to shuffle or no uses', () => {
    const one = setup({ ...QUEUE4, overrides: { passengers: { visible: 1 } } });
    expect(step(one.state, power('shuffle'), one.rules).events).toEqual([
      { type: 'invalidAction', reason: 'nothingToShuffle' },
    ]);
    const { state, rules } = setup(spec);
    const used = step(state, power('shuffle'), rules).state;
    expect(step(used, power('shuffle'), rules).events[0]).toEqual({
      type: 'invalidAction',
      reason: 'noUsesLeft',
    });
  });
});

describe('extraSlot', () => {
  it('appends an empty slot when none is locked', () => {
    const { state, rules } = setup(BASIC);
    const res = step(state, power('extraSlot'), rules);
    expect(res.state.slots).toHaveLength(6);
    expect(res.events).toEqual([
      { type: 'slotAdded', slotIndex: 5 },
      { type: 'powerUpUsed', powerUp: 'extraSlot', remaining: 0 },
    ]);
    expect(res.state.powerUpsUsed).toBe(1);
  });

  it('unlocks the first locked slot instead', () => {
    const { state, rules } = setup({
      ...BASIC,
      overrides: { queue: { slots: 4, lockedSlots: [2, 3] } },
    });
    const res = step(state, power('extraSlot'), rules);
    expect(res.state.slots.map((s) => s.kind)).toEqual(['empty', 'empty', 'empty', 'locked']);
    expect(res.events[0]).toEqual({ type: 'slotAdded', slotIndex: 2 });
  });

  it('unlocking under fifo compacts the queue', () => {
    const { state, rules } = setup({
      ...QUEUE4,
      overrides: { queue: { fillPolicy: 'fifo', slots: 4, lockedSlots: [0] } },
    });
    const queued = run(state, rules, taps(['a', 'c'])).state;
    expect(queued.slots.map((s) => s.kind)).toEqual(['locked', 'vehicle', 'vehicle', 'empty']);
    const res = step(queued, power('extraSlot'), rules);
    expect(res.state.slots.map((s) => s.kind)).toEqual(['vehicle', 'vehicle', 'empty', 'empty']);
    expect(res.events.filter((e) => e.type === 'slotShifted')).toHaveLength(2);
  });

  it('gives a way out of a full queue', () => {
    const { state, rules } = setup({
      ...BASIC,
      passengers: ['green', 'green', 'blue', 'blue'],
      overrides: { queue: { slots: 2 }, limits: { moves: null } },
    });
    const r = run(state, rules, [power('extraSlot'), ...taps(['a', 'b'])]);
    expect(r.state.status).toBe('won');
  });

  it('keeps an added slot when a later undo restores an older snapshot', () => {
    const { state, rules } = setup(BASIC);
    const r = run(state, rules, [tap('a'), power('extraSlot'), power('undo')]);
    expect(r.state.moves).toBe(0);
    expect(r.state.slots).toHaveLength(6);
    expect(r.state.slots.every((sl) => sl.kind === 'empty')).toBe(true);
  });

  it('keeps an unlocked slot when a later undo restores an older snapshot', () => {
    const { state, rules } = setup({
      ...BASIC,
      overrides: { queue: { slots: 4, lockedSlots: [3] } },
    });
    const r = run(state, rules, [tap('a'), power('extraSlot'), power('undo')]);
    expect(r.state.slots.map((sl) => sl.kind)).toEqual(['empty', 'empty', 'empty', 'empty']);
  });

  it('is invalid without uses', () => {
    const { state, rules } = setup({
      ...BASIC,
      overrides: { powerups: { extraSlot: { enabled: false, uses: 1 } } },
    });
    expect(step(state, power('extraSlot'), rules).events).toEqual([
      { type: 'invalidAction', reason: 'noUsesLeft' },
    ]);
  });
});
