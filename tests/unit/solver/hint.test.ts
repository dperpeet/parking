import { describe, expect, it } from 'vitest';
import { createGame, step } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { hint, hintMove } from '../../../src/solver/hint';
import { level, rules, rulesFor, world2Ruleset } from '../helpers';
import { Level } from '../../../src/schema';
import { deadlock, doubleFree, oneOrder } from './fixtures';

function followHints(start: GameState): GameState {
  let s = start;
  for (let i = 0; i < 60 && s.status === 'playing'; i++) {
    const id = hint(s, rules);
    expect(id).not.toBeNull();
    s = step(s, { type: 'tapVehicle', vehicleId: id! }, rules).state;
  }
  return s;
}

describe('hint', () => {
  it('picks the only winning move', () => {
    expect(hint(createGame(oneOrder, rulesFor(oneOrder)), rulesFor(oneOrder))).toBe('v1');
  });

  it('returns null without a winning continuation', () => {
    expect(hint(createGame(deadlock, rulesFor(deadlock)), rulesFor(deadlock))).toBeNull();
  });

  it('following hints from the start wins level 007', () => {
    const end = followHints(createGame(level, rules));
    expect(end.status).toBe('won');
  });

  it('works mid-game after power-ups were used', () => {
    let s = createGame(level, rules);
    s = step(s, { type: 'tapVehicle', vehicleId: 'v1' }, rules).state;
    s = step(s, { type: 'usePowerUp', powerUp: 'shuffle' }, rules).state;
    s = step(s, { type: 'usePowerUp', powerUp: 'extraSlot' }, rules).state;
    expect(s.powerUpsUsed).toBe(2);
    expect(followHints(s).status).toBe('won');
  });
});

const world2 = (l: Level) => rulesFor(l, world2Ruleset);

/**
 * Windrad: V -> B -> Y -> Z -> V (jeder blockiert den naechsten), kein Tipp moeglich. Die Hupe von V
 * laesst B nach hinten ausweichen; danach loesen Tipps alles. F ist frei (nur fuer den laufenden Zustand).
 * `fixed`: Poller; (4,1) und (0,2) verhindern das Ausweichen von B und V.
 */
function pinwheel(opts: { withFree?: boolean; fixed?: Array<[number, number]> } = {}): Level {
  const vehicles = [
    { id: 'V', pos: [2, 2], dir: 'E', type: 's', color: 'blue' },
    { id: 'B', pos: [4, 3], dir: 'S', type: 's', color: 'blue' },
    { id: 'Y', pos: [4, 4], dir: 'W', type: 's', color: 'blue' },
    { id: 'Z', pos: [2, 4], dir: 'N', type: 's', color: 'blue' },
    ...(opts.withFree ? [{ id: 'F', pos: [0, 5], dir: 'S', type: 's', color: 'blue' }] : []),
  ];
  return Level.parse({
    schema: 'parking.level/1',
    ruleset: 'world2',
    title: 'Test',
    id: 'honk-hint',
    grid: {
      width: 6,
      height: 6,
      cells: (opts.fixed ?? []).map(([x, y]) => ({ x, y, type: 'fixed' })),
    },
    vehicles,
    passengers: Array<string>(vehicles.length * 2).fill('blue'),
  });
}

const withHonk = (s: GameState, honk: number): GameState => ({
  ...s,
  powerUps: { ...s.powerUps, honk },
});

describe('hintMove', () => {
  it('prefers a winning tap even with honk available', () => {
    const r = world2(doubleFree);
    const s = withHonk(createGame(doubleFree, r), 1);
    expect(hintMove(s, r)).toEqual({ action: 'tap', vehicleId: 'v1' });
  });

  it('honks when no tap wins, and the honk leads to a win', () => {
    const l = pinwheel({ withFree: true });
    const r = world2(l);
    const s = createGame(l, r);
    expect(s.status).toBe('playing');
    expect(s.powerUps.honk).toBeGreaterThan(0);
    expect(hint(s, r)).toBeNull();
    expect(hintMove(s, r)).toEqual({ action: 'honk', vehicleId: 'V' });
    let t = step(s, { type: 'usePowerUp', powerUp: 'honk', vehicleId: 'V' }, r).state;
    for (let i = 0; i < 10 && t.status === 'playing'; i++) {
      t = step(t, { type: 'tapVehicle', vehicleId: hint(t, r)! }, r).state;
    }
    expect(t.status).toBe('won');
  });

  it('gives no honk hint without honk uses', () => {
    const l = pinwheel({ withFree: true });
    const r = world2(l);
    expect(hintMove(withHonk(createGame(l, r), 0), r)).toBeNull();
  });

  it('honk hint also comes from a noMoves loss', () => {
    const l = pinwheel();
    const r = world2(l);
    const s = createGame(l, r);
    expect(s.status).toBe('lost');
    expect(s.loseReason).toBe('noMoves');
    expect(hintMove(s, r)).toEqual({ action: 'honk', vehicleId: 'V' });
    expect(hintMove(withHonk(s, 0), r)).toBeNull();
  });

  it('returns null when honking does not help', () => {
    const l = pinwheel({
      withFree: true,
      fixed: [
        [4, 1],
        [0, 2],
      ],
    });
    const r = world2(l);
    expect(hintMove(createGame(l, r), r)).toBeNull();
  });

  it('is deterministic', () => {
    const l = pinwheel({ withFree: true });
    const r = world2(l);
    const s = createGame(l, r);
    expect(hintMove(s, r)).toEqual(hintMove(s, r));
  });

  it('gives no hint after a loss for another reason', () => {
    const l = pinwheel();
    const r = world2(l);
    const s = { ...createGame(l, r), status: 'lost' as const, loseReason: 'queueFull' as const };
    expect(hintMove(s, r)).toBeNull();
  });
});
