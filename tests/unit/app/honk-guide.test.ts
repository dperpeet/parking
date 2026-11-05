import { describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import { GUIDE_TIMEOUT_MS, HonkGuide } from '../../../src/app/honk-guide';
import { HINTS_PER_LEVEL } from '../../../src/app/hints';
import { Progress } from '../../../src/app/progress';
import type { StorageLike } from '../../../src/app/progress';
import { GameSession } from '../../../src/app/session';
import { step } from '../../../src/engine';
import type { GameState } from '../../../src/engine';
import { setup, v } from '../engine/helpers';
import { FakeSolver, realEngine } from './fakes';

const HONK = { powerups: { honk: { enabled: true, uses: 1 } } };

/** V (blau) schaut nach Osten, der gruene Blocker B steht quer auf seinem Weg; C steht frei. */
function game(overrides: object = HONK) {
  return setup({
    vehicles: [
      v('V', 1, 2, 'E', 's', 'blue'),
      v('B', 3, 2, 'S', 's', 'green'),
      v('C', 0, 0, 'N', 's', 'blue'),
    ],
    passengers: ['blue', 'blue', 'blue', 'blue', 'green', 'green'],
    overrides,
  });
}

function guide(overrides: object = HONK, timeoutMs?: number) {
  const solver = new FakeSolver();
  const { state, rules } = game(overrides);
  const g = new HonkGuide(solver, timeoutMs);
  g.begin('test');
  let current: GameState = state;
  return {
    solver,
    g,
    rules,
    get: () => current,
    set: (s: GameState) => (current = s),
    tap: (id: string) => {
      current = step(current, { type: 'tapVehicle', vehicleId: id }, rules).state;
    },
  };
}

describe('HonkGuide: Pflicht-Hupe-Level', () => {
  it('erkennt am Startzustand (needsHonk) ein Pflicht-Level und raet zum Hupen', async () => {
    const t = guide();
    t.solver.hintResult = { action: 'honk', vehicleId: 'V', needsHonk: true };
    const advice = await t.g.check(t.get, t.rules);
    expect(advice).toEqual({
      kind: 'honk',
      move: { action: 'honk', vehicleId: 'V', needsHonk: true },
    });
    expect(t.g.isRequired()).toBe(true);
  });

  it('nach jedem Zug wird erneut gefragt; endet needsHonk, endet der Hinweis', async () => {
    const t = guide();
    t.solver.hintResult = { action: 'tap', vehicleId: 'C', needsHonk: true };
    expect((await t.g.check(t.get, t.rules)).kind).toBe('honk');
    t.tap('C');
    expect((await t.g.check(t.get, t.rules)).kind).toBe('honk');
    expect(t.solver.hintCalls).toBe(2);
    t.solver.hintResult = { action: 'tap', vehicleId: 'V' };
    expect((await t.g.check(t.get, t.rules)).kind).toBe('none');
  });

  it('Welt-2-Level (Hupe optional): kein Hinweis und danach keine Solver-Anfragen mehr', async () => {
    const t = guide();
    t.solver.hintResult = { action: 'tap', vehicleId: 'C' }; // gewinnt ohne Hupe
    expect((await t.g.check(t.get, t.rules)).kind).toBe('none');
    expect(t.g.isRequired()).toBe(false);
    t.tap('C');
    expect((await t.g.check(t.get, t.rules)).kind).toBe('none');
    expect(t.solver.hintCalls).toBe(1);
  });

  it('ein Level, das erst spaeter needsHonk meldet, gilt nicht als Pflicht-Level', async () => {
    const t = guide();
    t.solver.hintResult = { action: 'tap', vehicleId: 'C' };
    await t.g.check(t.get, t.rules);
    t.solver.hintResult = { action: 'honk', vehicleId: 'V', needsHonk: true };
    t.tap('C');
    expect((await t.g.check(t.get, t.rules)).kind).toBe('none');
  });

  it('ohne Hupe uebrig oder ohne aktivierte Hupe wird nicht gefragt', async () => {
    const t = guide();
    t.set({ ...t.get(), powerUps: { ...t.get().powerUps, honk: 0 } });
    expect((await t.g.check(t.get, t.rules)).kind).toBe('none');
    const off = guide({});
    expect((await off.g.check(off.get, off.rules)).kind).toBe('none');
    expect(t.solver.hintCalls + off.solver.hintCalls).toBe(0);
  });

  it('Fehler und Zeitueberschreitung: kein Hinweis (Fallback Sackgassen-Karte)', async () => {
    const failing = guide();
    failing.solver.hintResult = new Error('worker');
    expect((await failing.g.check(failing.get, failing.rules)).kind).toBe('none');

    const slow = guide(HONK, 10);
    slow.solver.hintResult = { action: 'honk', vehicleId: 'V', needsHonk: true };
    slow.solver.hintGate = new Promise(() => undefined);
    expect((await slow.g.check(slow.get, slow.rules)).kind).toBe('none');
    expect(GUIDE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('veraltete Antworten werden verworfen', async () => {
    const t = guide();
    t.solver.hintResult = { action: 'honk', vehicleId: 'V', needsHonk: true };
    let release: () => void = () => undefined;
    t.solver.hintGate = new Promise<void>((r) => (release = r));
    const pending = t.g.check(t.get, t.rules);
    t.tap('C'); // Zustand aendert sich waehrend der Anfrage
    release();
    expect((await pending).kind).toBe('none');
  });
});

describe('HonkGuide: Urteil nach der Hupe (assessHonk)', () => {
  /** Pflicht-Level erkannt, dann gehupt (V weicht B aus). */
  async function honked() {
    const t = guide();
    t.solver.hintResult = { action: 'honk', vehicleId: 'V', needsHonk: true };
    await t.g.check(t.get, t.rules);
    t.set(step(t.get(), { type: 'usePowerUp', powerUp: 'honk', vehicleId: 'V' }, t.rules).state);
    return t;
  }

  it('Sieg danach moeglich: useful', async () => {
    const t = await honked();
    t.solver.hintResult = { action: 'tap', vehicleId: 'V' };
    expect(await t.g.assessHonk(t.get, t.rules)).toBe('useful');
  });

  it('kein Sieg mehr (hint null): useless', async () => {
    const t = await honked();
    t.solver.hintResult = null;
    expect(await t.g.assessHonk(t.get, t.rules)).toBe('useless');
  });

  it('Verlust nach der Hupe: useless ohne Solver-Frage; Sieg: useful', async () => {
    const t = await honked();
    const calls = t.solver.hintCalls;
    t.set({ ...t.get(), status: 'lost', loseReason: 'noMoves' });
    expect(await t.g.assessHonk(t.get, t.rules)).toBe('useless');
    t.set({ ...t.get(), status: 'won' });
    expect(await t.g.assessHonk(t.get, t.rules)).toBe('useful');
    expect(t.solver.hintCalls).toBe(calls);
  });

  it('ohne Pflicht-Hupe (oder unbekanntem Level): unknown, ohne Solver', async () => {
    const t = guide();
    expect(await t.g.assessHonk(t.get, t.rules)).toBe('unknown');
    t.solver.hintResult = { action: 'tap', vehicleId: 'C' };
    await t.g.check(t.get, t.rules);
    const calls = t.solver.hintCalls;
    expect(await t.g.assessHonk(t.get, t.rules)).toBe('unknown');
    expect(t.solver.hintCalls).toBe(calls);
  });

  it('Fehler, Zeitueberschreitung und veraltete Antwort: unknown', async () => {
    const failing = await honked();
    failing.solver.hintResult = new Error('worker');
    expect(await failing.g.assessHonk(failing.get, failing.rules)).toBe('unknown');

    const slow = await honked();
    const quick = new HonkGuide(slow.solver, 10);
    quick.begin('test');
    slow.solver.hintResult = { action: 'honk', vehicleId: 'V', needsHonk: true };
    slow.set(game().state);
    await quick.check(slow.get, slow.rules);
    slow.set(
      step(slow.get(), { type: 'usePowerUp', powerUp: 'honk', vehicleId: 'V' }, slow.rules).state,
    );
    slow.solver.hintGate = new Promise(() => undefined);
    expect(await quick.assessHonk(slow.get, slow.rules)).toBe('unknown');

    const stale = await honked();
    stale.solver.hintResult = null;
    let release: () => void = () => undefined;
    stale.solver.hintGate = new Promise<void>((r) => (release = r));
    const pending = stale.g.assessHonk(stale.get, stale.rules);
    stale.tap('C');
    release();
    expect(await pending).toBe('unknown');
  });
});

class MemStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, val: string): void => void this.m.set(k, val);
  removeItem = (k: string): void => void this.m.delete(k);
}

describe('Session: Hupen-Hinweis', () => {
  const campaign = getCampaign();
  const make = (pack: string, id: string): { s: GameSession; solver: FakeSolver } => {
    const solver = new FakeSolver();
    const s = new GameSession(
      {
        engine: realEngine,
        solver,
        progress: new Progress(() => new MemStorage()),
        campaign,
        now: () => new Date(2026, 10, 2),
        syncRoute: () => undefined,
        exit: () => undefined,
      },
      { name: 'level', pack, id },
    );
    return { s, solver };
  };

  it('der Hinweis zaehlt nicht als Tipp und kostet keinen Stern', async () => {
    const { s, solver } = make('03', '001');
    await s.start();
    solver.hintResult = { action: 'honk', vehicleId: 'v1', needsHonk: true };
    const advice = await s.honkGuide.check(() => s.controller.getState(), s.controller.getRules());
    expect(advice.kind).toBe('honk');
    expect(s.hints.left()).toBe(HINTS_PER_LEVEL);
    expect(s.hints.used()).toBe(false);
    const state = s.controller.getState();
    expect(s.dialogInfo(state).stars).toBe(state.stars);
  });

  it('Welt 2: Level ohne Pflicht-Hupe bekommt keinen Hinweis', async () => {
    const { s, solver } = make('02', '013');
    await s.start();
    solver.hintResult = { action: 'tap', vehicleId: 'v1' };
    const advice = await s.honkGuide.check(() => s.controller.getState(), s.controller.getRules());
    expect(advice.kind).toBe('none');
    expect(s.honkGuide.isRequired()).toBe(false);
  });

  it('gefuehrtes Hupen nur im Level mit Intro honk (3-001)', async () => {
    const first = make('03', '001').s;
    await first.start();
    expect(first.guidedHonk()).toBe(true);
    const second = make('03', '002').s;
    await second.start();
    expect(second.guidedHonk()).toBe(false);
    const w2 = make('02', '013').s;
    await w2.start();
    expect(w2.guidedHonk()).toBe(false);
  });

  it('honkTargets: nur Fahrzeuge, deren Hupe die Engine akzeptiert', async () => {
    const { s } = make('03', '001');
    await s.start();
    const state = s.controller.getState();
    const targets = s.honkTargets(state);
    for (const vehicle of state.vehicles) {
      const { events } = step(
        state,
        { type: 'usePowerUp', powerUp: 'honk', vehicleId: vehicle.id },
        s.controller.getRules(),
      );
      const accepted = !events.some((e) => e.type === 'invalidAction');
      expect(targets.includes(vehicle.id), vehicle.id).toBe(accepted);
    }
    expect(targets.length).toBeLessThan(state.vehicles.length);
  });
});
