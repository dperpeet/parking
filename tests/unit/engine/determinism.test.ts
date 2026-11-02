import { describe, expect, it } from 'vitest';
import { hashState, step } from '../../../src/engine';
import type { Action, GameState } from '../../../src/engine';
import { BASIC, DEADLOCK, QUEUE4, deepFreeze, power, run, setup, tap, taps } from './helpers';

const SCRIPT: Action[] = [
  tap('a'),
  power('shuffle'),
  power('undo'),
  power('extraSlot'),
  ...taps(['c', 'b', 'd']),
];

describe('determinism', () => {
  it('same seed and actions give identical hash and identical JSON', () => {
    const one = setup(QUEUE4, 42);
    const two = setup(QUEUE4, 42);
    const r1 = run(one.state, one.rules, SCRIPT);
    const r2 = run(two.state, two.rules, SCRIPT);
    expect(hashState(r1.state)).toBe(hashState(r2.state));
    expect(JSON.stringify(r1.state)).toBe(JSON.stringify(r2.state));
    expect(r1.events).toEqual(r2.events);
  });

  it('shuffle depends on the seed through the rng', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const { state, rules } = setup(QUEUE4, seed);
      outcomes.add(step(state, power('shuffle'), rules).state.passengers.join());
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('state stays JSON-serializable through play', () => {
    const { state, rules } = setup(QUEUE4, 1);
    const end = run(state, rules, SCRIPT).state;
    expect(JSON.parse(JSON.stringify(end))).toEqual(end);
  });
});

describe('hashState', () => {
  it('ignores rng, history and power-up counters', () => {
    const a = setup(BASIC, 1).state;
    const b = setup(BASIC, 2).state;
    expect(a.rng).not.toBe(b.rng);
    expect(hashState(a)).toBe(hashState(b));
    const c: GameState = { ...a, powerUps: { ...a.powerUps, undo: 0 }, history: [] };
    expect(hashState(c)).toBe(hashState(a));
  });

  it('distinguishes different positions', () => {
    const { state, rules } = setup(BASIC);
    const seen = new Set([hashState(state)]);
    const a = step(state, tap('a'), rules).state;
    seen.add(hashState(a));
    seen.add(hashState(step(state, tap('b'), rules).state));
    seen.add(hashState(step(a, tap('b'), rules).state));
    expect(seen.size).toBe(4);
  });

  it('distinguishes status and lose reasons', () => {
    const { state, rules } = setup(DEADLOCK);
    const lost = step(state, tap('z'), rules).state;
    const timed = step(state, { type: 'timeUp' }, rules).state;
    expect(hashState(lost)).not.toBe(hashState(timed));
  });

  it('is a fixed-width hex string', () => {
    expect(hashState(setup(BASIC).state)).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe('immutability', () => {
  it('step never mutates a deep-frozen input state', () => {
    const { state, rules } = setup({ ...QUEUE4, overrides: { queue: { fillPolicy: 'fifo' } } }, 5);
    let cur = deepFreeze(state);
    const actions: Action[] = [
      tap('nope'),
      tap('a'),
      tap('c'),
      power('shuffle'),
      power('extraSlot'),
      tap('b'),
      power('undo'),
      power('honk'),
      tap('b'),
      tap('d'),
      { type: 'timeUp' },
    ];
    for (const action of actions) {
      const res = step(cur, action, rules);
      cur = deepFreeze(res.state);
    }
    expect(cur.history).toBeDefined();
  });

  it('frozen input: win, lose and post-lose undo paths', () => {
    const win = setup(BASIC);
    const w = deepFreeze(run(win.state, win.rules, [tap('a')]).state);
    expect(step(w, tap('b'), win.rules).state.status).toBe('won');

    const dead = setup(DEADLOCK);
    const lost = deepFreeze(step(deepFreeze(dead.state), tap('z'), dead.rules).state);
    expect(step(lost, power('undo'), dead.rules).state.status).toBe('playing');
  });

  it('does not alter the original when a copy continues', () => {
    const { state, rules } = setup(BASIC);
    const snapshot = JSON.stringify(state);
    step(state, tap('a'), rules);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
