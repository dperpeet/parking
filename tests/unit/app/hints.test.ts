import { describe, expect, it } from 'vitest';
import { HINTS_PER_LEVEL, HINT_STAR_CAP, HintTracker, displayStars } from '../../../src/app/hints';
import { createGame, step } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { WIN_ORDER, level, rules } from '../helpers';
import { FakeSolver } from './fakes';

function setup(perLevel?: number) {
  const solver = new FakeSolver();
  const tracker = new HintTracker(solver, perLevel);
  let state = createGame(level, rules);
  tracker.begin(level.id, true);
  const get = () => state;
  const tap = (id: string) => {
    state = step(state, { type: 'tapVehicle', vehicleId: id }, rules).state;
  };
  return { solver, tracker, get, tap };
}

describe('displayStars', () => {
  it('begrenzt auf 2 Sterne, wenn ein Tipp genutzt wurde', () => {
    expect(displayStars(3, false)).toBe(3);
    expect(displayStars(3, true)).toBe(HINT_STAR_CAP);
    expect(displayStars(2, true)).toBe(2);
    expect(displayStars(1, true)).toBe(1);
  });
});

describe('HintTracker', () => {
  it('liefert das Fahrzeug des Solvers und zaehlt den Tipp', async () => {
    const { tracker, get } = setup();
    expect(tracker.left()).toBe(HINTS_PER_LEVEL);
    expect(tracker.used()).toBe(false);
    const r = await tracker.request(get, rules);
    expect(r).toEqual({ kind: 'vehicle', vehicleId: 'v1', action: 'tap' });
    expect(tracker.left()).toBe(HINTS_PER_LEVEL - 1);
    expect(tracker.used()).toBe(true);
  });

  it('drei Tipps pro Level, danach wird ignoriert', async () => {
    const { tracker, get, solver } = setup();
    for (let i = 0; i < HINTS_PER_LEVEL; i++) await tracker.request(get, rules);
    expect(tracker.left()).toBe(0);
    expect(await tracker.request(get, rules)).toEqual({ kind: 'ignored' });
    expect(solver.hintCalls).toBe(HINTS_PER_LEVEL);
  });

  it('die Anzahl ist konfigurierbar', async () => {
    const { tracker, get } = setup(1);
    await tracker.request(get, rules);
    expect(tracker.left()).toBe(0);
  });

  it('ohne gewinnende Fortsetzung kommt "none" (und der Tipp zaehlt)', async () => {
    const { tracker, get, solver } = setup();
    solver.hintResult = null;
    expect(await tracker.request(get, rules)).toEqual({ kind: 'none' });
    expect(tracker.left()).toBe(HINTS_PER_LEVEL - 1);
  });

  it('Solver-Fehler verbrauchen keinen Tipp', async () => {
    const { tracker, get, solver } = setup();
    solver.hintResult = new Error('worker down');
    expect(await tracker.request(get, rules)).toEqual({ kind: 'error' });
    expect(tracker.left()).toBe(HINTS_PER_LEVEL);
    expect(tracker.used()).toBe(false);
    expect(tracker.busy()).toBe(false);
  });

  it('eine laufende Anfrage sperrt weitere; ein Zug dazwischen verwirft das Ergebnis', async () => {
    const { tracker, get, tap, solver } = setup();
    let release!: () => void;
    solver.hintGate = new Promise<void>((r) => (release = r));
    const first = tracker.request(get, rules);
    expect(tracker.busy()).toBe(true);
    expect(await tracker.request(get, rules)).toEqual({ kind: 'ignored' });
    tap(WIN_ORDER[0] ?? 'v1');
    release();
    expect(await first).toEqual({ kind: 'ignored' });
    expect(tracker.left()).toBe(HINTS_PER_LEVEL);
    expect(tracker.busy()).toBe(false);
  });

  it('nach dem Sieg gibt es keine Tipps mehr', async () => {
    const { tracker, get, tap } = setup();
    for (const id of WIN_ORDER) tap(id);
    expect(get().status).toBe('won');
    expect(await tracker.request(get, rules)).toEqual({ kind: 'ignored' });
  });

  it('Neustart desselben Levels behaelt den Stand, fresh oder neues Level setzt zurueck', async () => {
    const { tracker, get } = setup();
    await tracker.request(get, rules);
    tracker.begin(level.id, false);
    expect(tracker.left()).toBe(HINTS_PER_LEVEL - 1);
    tracker.begin(level.id, true);
    expect(tracker.left()).toBe(HINTS_PER_LEVEL);
    await tracker.request(get, rules);
    tracker.begin('other', false);
    expect(tracker.left()).toBe(HINTS_PER_LEVEL);
  });

  it('erlaubt die Anfrage nach einer Niederlage durch fehlende Zuege, wenn eine Hupe uebrig ist', async () => {
    const { tracker, solver, get } = setup();
    solver.hintResult = { action: 'honk', vehicleId: 'v3' };
    const base = get();
    const stuck = (honk: number): GameState => ({
      ...base,
      status: 'lost',
      loseReason: 'noMoves',
      powerUps: { ...base.powerUps, honk },
    });
    expect(await tracker.request(() => stuck(0), rules)).toEqual({ kind: 'ignored' });
    expect(await tracker.request(() => ({ ...stuck(1), loseReason: 'queueFull' }), rules)).toEqual({
      kind: 'ignored',
    });
    expect(await tracker.request(() => stuck(1), rules)).toEqual({
      kind: 'vehicle',
      vehicleId: 'v3',
      action: 'honk',
    });
  });

  it('eine Hupe waehrend der Berechnung verwirft das Ergebnis (Zuege bleiben gleich)', async () => {
    const { tracker, solver } = setup();
    let release!: () => void;
    solver.hintGate = new Promise<void>((r) => (release = r));
    const before = createGame(level, rules);
    let current = before;
    const first = tracker.request(() => current, rules);
    current = { ...before, powerUpsUsed: before.powerUpsUsed + 1 };
    release();
    expect(await first).toEqual({ kind: 'ignored' });
    expect(tracker.left()).toBe(HINTS_PER_LEVEL);
  });
});
