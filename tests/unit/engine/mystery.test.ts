import { describe, expect, it } from 'vitest';
import { createGame, hashState, legalMoves, step } from '../../../src/engine';
import type { Action, GameEvent, GameState } from '../../../src/engine';
import type { RulesetOverrides } from '../../../src/schema';
import { level as level007, rules as rules007, WIN_ORDER } from '../helpers';
import type { LevelSpec } from './helpers';
import { deepFreeze, power, rulesWith, run, setup, tap, taps, v } from './helpers';

const MYSTERY: RulesetOverrides = { special: { mysteryVehicles: true } };
const M = { mystery: true };

const hidden = (state: GameState, id: string): boolean =>
  state.vehicles.find((x) => x.id === id)!.hidden;
const types = (events: GameEvent[]): string[] => events.map((e) => e.type);
const revealed = (events: GameEvent[]): GameEvent[] =>
  events.filter((e) => e.type === 'vehicleRevealed');

/** a (blau) steht am Rand und blockiert m1 (gruen, Zeile 0) und m2 (pink, schaut nach Norden). */
const TWO: LevelSpec = {
  vehicles: [
    v('a', 5, 0, 'E', 's', 'blue'),
    v('m2', 4, 2, 'N', 's', 'pink', M),
    v('m1', 2, 0, 'E', 's', 'green', M),
  ],
  passengers: ['blue', 'blue', 'green', 'green', 'pink', 'pink'],
  overrides: MYSTERY,
};

/** a blockiert m1, m1 blockiert m3 (Kette). */
const CHAIN: LevelSpec = {
  vehicles: [
    v('a', 5, 0, 'E', 's', 'blue'),
    v('m1', 2, 0, 'E', 's', 'green', M),
    v('m3', 1, 2, 'N', 's', 'pink', M),
  ],
  passengers: ['blue', 'blue', 'green', 'green', 'pink', 'pink'],
  overrides: MYSTERY,
};

describe('mystery vehicles: start', () => {
  it('blocked mystery vehicles start hidden, free ones revealed, others never hidden', () => {
    const spec: LevelSpec = {
      ...TWO,
      vehicles: [...TWO.vehicles, v('f', 5, 5, 'E', 's', 'orange', M)],
      passengers: [...TWO.passengers, 'orange', 'orange'],
    };
    const { state } = setup(spec);
    expect(state.vehicles.map((x) => [x.id, x.hidden])).toEqual([
      ['a', false],
      ['m2', true],
      ['m1', true],
      ['f', false],
    ]);
    // Die Farbe bleibt im Zustand.
    expect(state.vehicles.find((x) => x.id === 'm1')!.color).toBe('green');
  });

  it('lock state does not matter for the path test', () => {
    const spec: LevelSpec = {
      vehicles: [
        v('a', 0, 3, 'S', 's', 'blue'),
        v('k', 5, 0, 'E', 's', 'green', { ...M, locked: true, keyId: 'a' }),
      ],
      passengers: ['blue', 'blue', 'green', 'green'],
      overrides: { special: { mysteryVehicles: true, keyVehicles: true } },
    };
    const { state } = setup(spec);
    expect(hidden(state, 'k')).toBe(false);
  });

  it('fixed cells keep a mystery vehicle hidden', () => {
    const spec: LevelSpec = {
      vehicles: [v('a', 5, 0, 'E', 's', 'blue'), v('m', 2, 3, 'E', 's', 'green', M)],
      passengers: ['blue', 'blue', 'green', 'green'],
      cells: [{ x: 4, y: 3, type: 'fixed' }],
      overrides: MYSTERY,
    };
    const { state, rules } = setup(spec);
    expect(hidden(state, 'm')).toBe(true);
    const after = run(state, rules, [tap('a')]);
    expect(revealed(after.events)).toEqual([]);
    expect(hidden(after.state, 'm')).toBe(true);
  });
});

describe('mystery vehicles: reveal', () => {
  it('reveals after tap, after vehicleExited and before passengerBoarded', () => {
    const { state, rules } = setup(CHAIN);
    const res = step(state, tap('a'), rules);
    expect(types(res.events)).toEqual([
      'vehicleExited',
      'vehicleRevealed',
      'passengerBoarded',
      'passengerBoarded',
      'vehicleDeparted',
    ]);
    expect(res.events[1]).toEqual({ type: 'vehicleRevealed', vehicleId: 'm1', color: 'green' });
    expect(hidden(res.state, 'm1')).toBe(false);
    expect(hidden(res.state, 'm3')).toBe(true);
    // Der Eingabezustand bleibt unveraendert.
    expect(hidden(state, 'm1')).toBe(true);
  });

  it('reveals after vehicleUnlocked when the key vehicle leaves', () => {
    const spec: LevelSpec = {
      vehicles: [
        v('a', 5, 0, 'E', 's', 'blue'),
        v('m', 2, 0, 'E', 's', 'green', { ...M, locked: true, keyId: 'a' }),
      ],
      passengers: ['blue', 'blue', 'green', 'green'],
      overrides: { special: { mysteryVehicles: true, keyVehicles: true } },
    };
    const { state, rules } = setup(spec);
    expect(types(step(state, tap('a'), rules).events).slice(0, 3)).toEqual([
      'vehicleExited',
      'vehicleUnlocked',
      'vehicleRevealed',
    ]);
  });

  it('multiple reveals follow the vehicle order in the state', () => {
    const { state, rules } = setup(TWO);
    const res = step(state, tap('a'), rules);
    expect(revealed(res.events)).toEqual([
      { type: 'vehicleRevealed', vehicleId: 'm2', color: 'pink' },
      { type: 'vehicleRevealed', vehicleId: 'm1', color: 'green' },
    ]);
    expect(types(res.events).indexOf('passengerBoarded')).toBe(3);
  });

  it('reveals after a honk yield (after vehicleYielded and powerUpUsed)', () => {
    const spec: LevelSpec = {
      vehicles: [v('V', 1, 2, 'E', 's', 'blue', M), v('B', 3, 2, 'S', 's', 'green')],
      passengers: ['blue', 'blue', 'green', 'green'],
      overrides: { ...MYSTERY, powerups: { honk: { enabled: true, uses: 1 } } },
    };
    const { state, rules } = setup(spec);
    expect(hidden(state, 'V')).toBe(true);
    const honk: Action = { type: 'usePowerUp', powerUp: 'honk', vehicleId: 'V' };
    const res = step(state, honk, rules);
    expect(types(res.events)).toEqual(['vehicleYielded', 'powerUpUsed', 'vehicleRevealed']);
    expect(hidden(res.state, 'V')).toBe(false);
    // Undo stellt den Blocker wieder her, verdeckt V aber nicht erneut.
    const back = step(res.state, power('undo'), rules);
    expect(types(back.events)).toEqual(['stateRestored', 'powerUpUsed']);
    expect(back.state.vehicles.find((x) => x.id === 'B')!.y).toBe(2);
    expect(hidden(back.state, 'V')).toBe(false);
    expect(back.state.powerUps.honk).toBe(1);
  });

  it('hidden vehicles are never tappable; vehicles that leave are revealed', () => {
    const { state, rules } = setup(CHAIN);
    let cur = state;
    for (const id of ['a', 'm1', 'm3']) {
      for (const x of cur.vehicles) {
        if (x.hidden) expect(legalMoves(cur, rules)).not.toContain(x.id);
      }
      expect(step(cur, tap('m3'), rules).events[0]?.type).toBe(
        hidden(cur, 'm3') ? 'vehicleBlocked' : 'vehicleExited',
      );
      cur = step(cur, tap(id), rules).state;
    }
    expect(cur.status).toBe('won');
    expect(cur.vehicles.every((x) => !x.hidden && x.status !== 'parked')).toBe(true);
  });
});

describe('mystery vehicles: undo', () => {
  it('keeps revealed vehicles revealed and still-hidden ones hidden', () => {
    const { state, rules } = setup(CHAIN);
    const one = run(state, rules, [tap('a'), power('undo')]);
    expect(one.state.vehicles.find((x) => x.id === 'a')!.status).toBe('parked');
    expect(hidden(one.state, 'm1')).toBe(false);
    expect(hidden(one.state, 'm3')).toBe(true);
    expect(revealed(one.events)).toHaveLength(1);

    const two = run(one.state, rules, [...taps(['a', 'm1']), power('undo')]);
    expect(revealed(two.events)).toEqual([
      { type: 'vehicleRevealed', vehicleId: 'm3', color: 'pink' },
    ]);
    expect(two.state.vehicles.find((x) => x.id === 'm1')!.status).toBe('parked');
    expect(hidden(two.state, 'm1')).toBe(false);
    expect(hidden(two.state, 'm3')).toBe(false);
  });

  it('works on deeply frozen states (no mutation of shared snapshots)', () => {
    const { state, rules } = setup(CHAIN);
    let cur = deepFreeze(state);
    for (const action of [tap('a'), power('undo'), tap('a'), tap('m1'), power('undo')]) {
      cur = deepFreeze(step(cur, action, rules).state);
    }
    expect(cur.vehicles.map((x) => x.hidden)).toEqual([false, false, false]);
  });
});

describe('mystery vehicles: hash and unchanged behaviour', () => {
  it('hashState ignores hidden', () => {
    const { state } = setup(CHAIN);
    const shown = { ...state, vehicles: state.vehicles.map((x) => ({ ...x, hidden: false })) };
    expect(hashState(state)).toBe(hashState(shown));
  });

  it('levels without mystery vehicles behave exactly as before, even with the flag on', () => {
    const flagged = rulesWith({ ...level007.overrides, special: { mysteryVehicles: true } });
    const plain = createGame(level007, rules007);
    const withFlag = createGame(level007, flagged);
    expect(plain.vehicles.every((x) => !x.hidden)).toBe(true);
    expect(withFlag).toEqual(plain);
    const a = run(plain, rules007, [...taps(WIN_ORDER.slice(0, 3)), power('undo')]);
    const b = run(withFlag, flagged, [...taps(WIN_ORDER.slice(0, 3)), power('undo')]);
    expect(b.events).toEqual(a.events);
    expect(revealed(a.events)).toEqual([]);
    const win = run(plain, rules007, taps(WIN_ORDER));
    expect(win.state.status).toBe('won');
    expect(revealed(win.events)).toEqual([]);
    expect(hashState(b.state)).toBe(hashState(a.state));
  });
});
