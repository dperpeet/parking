import { beforeEach, describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import { Progress } from '../../../src/app/progress';
import type { StorageLike } from '../../../src/app/progress';
import type { PlayRoute } from '../../../src/app/router';
import { GameSession, mechanicsOf } from '../../../src/app/session';
import type { SolverPort } from '../../../src/app/solver-port';
import { STAGE_KEY_CHAIN_DEPTH, dailyStage, stageShape } from '../../../src/app/stages';
import { analyze, generate } from '../../../src/solver';
import { level as classicLevel } from '../helpers';
import { FakeSolver, realEngine } from './fakes';

const campaign = getCampaign();
const world2Entry = campaign.find('02', '005');
if (!world2Entry) throw new Error('Fixture: Level 02/005 fehlt');
const world2Level = world2Entry.level;

class MemStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

function makeSession(
  solver: SolverPort,
  route: PlayRoute,
  now: Date,
  progress = new Progress(() => new MemStorage()),
): GameSession {
  return new GameSession(
    {
      engine: realEngine,
      solver,
      progress,
      campaign,
      now: () => now,
      syncRoute: () => undefined,
      exit: () => undefined,
    },
    route,
  );
}

/** Solver-Port mit dem echten Generator im selben Thread. */
const realSolver: SolverPort = {
  hint: () => Promise.resolve(null),
  analyze: (l, r, o) => Promise.resolve(analyze(l, r, o)),
  generate: (params, rules) => {
    const res = generate(params, rules);
    return Promise.resolve({ level: res.level, matched: res.matched });
  },
};

// 2026-11-01 ist ein Sonntag; die Wochentage 0 bis 6 liegen auf den Tagen 1. bis 7.
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  date: `2026-11-0${d}`,
  now: new Date(2026, 10, d, 12),
}));

const countRange = (c: number | [number, number]): [number, number] =>
  Array.isArray(c) ? c : [c, c];

describe('Tageslevel: Mechaniken je Wochentag', () => {
  it.each(WEEK)('$date: Parameter folgen der Stufe', async ({ now }) => {
    const solver = new FakeSolver();
    await makeSession(solver, { name: 'daily' }, now).start();
    const call = solver.generateCalls[0];
    const shape = stageShape(dailyStage(now));
    expect(call?.params).toMatchObject({
      ruleset: shape.ruleset,
      bollards: shape.bollards,
      keys: shape.keys,
      vehicleCount: shape.vehicleCount,
    });
    expect(call?.params.keyChainDepth).toBe(shape.keys ? STAGE_KEY_CHAIN_DEPTH : undefined);
    expect(call?.rules.id).toBe(shape.ruleset);
  });

  it('Samstag (Stufe 5): world2 mit Pollern und genau einem Schluessel', async () => {
    const solver = new FakeSolver();
    await makeSession(solver, { name: 'daily' }, new Date(2026, 10, 7, 9)).start();
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'world2',
      bollards: [1, 2],
      keys: 1,
      keyChainDepth: 1,
    });
  });

  it('Montag (Stufe 1): classic ohne Poller und Schluessel', async () => {
    const solver = new FakeSolver();
    await makeSession(solver, { name: 'daily' }, new Date(2026, 10, 2, 9)).start();
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'classic',
      bollards: 0,
      keys: 0,
    });
    expect(solver.generateCalls[0]?.rules.id).toBe('classic');
  });

  it.each(WEEK)(
    '$date: echtes Level ist deterministisch, loesbar und hat die erwartete Mechanik',
    async ({ now }) => {
      const generateOnce = async (): Promise<GameSession> => {
        const s = makeSession(realSolver, { name: 'daily' }, now);
        expect(await s.start()).toBe('ready');
        return s;
      };
      const a = await generateOnce();
      const b = await generateOnce();
      expect(JSON.stringify(a.controller.getLevel())).toBe(JSON.stringify(b.controller.getLevel()));

      const lvl = a.controller.getLevel();
      const shape = stageShape(dailyStage(now));
      expect(lvl.ruleset).toBe(shape.ruleset);
      expect(a.controller.getRules().id).toBe(shape.ruleset);
      const bollards = lvl.grid.cells.filter((c) => c.type === 'fixed').length;
      const keys = lvl.vehicles.filter((v) => v.locked).length;
      const [bLo, bHi] = countRange(shape.bollards);
      const [kLo, kHi] = countRange(shape.keys);
      expect(bollards).toBeGreaterThanOrEqual(bLo);
      expect(bollards).toBeLessThanOrEqual(bHi);
      expect(keys).toBeGreaterThanOrEqual(kLo);
      expect(keys).toBeLessThanOrEqual(kHi);
      expect(analyze(lvl, a.controller.getRules()).solvable).toBe(true);
    },
    60_000,
  );

  it('gleiches Datum ergibt dasselbe Level, unabhaengig vom Fortschritt', async () => {
    const now = new Date(2026, 10, 7, 12);
    const fresh = makeSession(new FakeSolver(), { name: 'daily' }, now);
    const advanced = new Progress(() => new MemStorage());
    advanced.markIntroSeen('bollards');
    advanced.setHold(true, 2);
    const solver = new FakeSolver();
    const other = makeSession(solver, { name: 'daily' }, now, advanced);
    const freshSolver = new FakeSolver();
    await makeSession(freshSolver, { name: 'daily' }, now).start();
    await other.start();
    await fresh.start();
    expect(solver.generateCalls[0]?.params).toEqual(freshSolver.generateCalls[0]?.params);
  });
});

describe('Endlos: Ruleset folgt der Stufe', () => {
  let solver: FakeSolver;
  beforeEach(() => {
    solver = new FakeSolver();
  });

  it('wechselt nach vier Leveln von classic auf world2 (Stufe 3)', async () => {
    const s = makeSession(solver, { name: 'endless' }, new Date(2026, 10, 2, 12));
    await s.start();
    for (let i = 0; i < 4; i++) await s.next();
    const rulesets = solver.generateCalls.map((c) => c.params.ruleset);
    expect(rulesets).toEqual(['classic', 'classic', 'classic', 'classic', 'world2']);
    expect(solver.generateCalls[4]?.rules.id).toBe('world2');
    expect(solver.generateCalls[4]?.params).toMatchObject({ bollards: [1, 2], keys: 0 });
    expect(s.controller.getRules().id).toBe('world2');
  });

  it('Stufe halten (5): world2 mit Schluessel', async () => {
    const progress = new Progress(() => new MemStorage());
    progress.setHold(true, 5);
    await makeSession(solver, { name: 'endless' }, new Date(2026, 10, 2, 12), progress).start();
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'world2',
      bollards: [1, 2],
      keys: 1,
      keyChainDepth: 1,
    });
  });

  it('Fehler im Run: die Variante behaelt die Regeln des Vorgaengers', async () => {
    const s = makeSession(solver, { name: 'endless' }, new Date(2026, 10, 2, 12));
    await s.start();
    await s.next();
    await s.next();
    await s.next();
    expect(s.controller.getRules().id).toBe('classic');
    solver.generateImpl = () => Promise.reject(new Error('timeout'));
    await s.next(); // Stufe 3 wuerde world2 brauchen, faellt aber auf den Vorgaenger zurueck.
    expect(s.controller.getRules().id).toBe('classic');
  });
});

describe('Aehnliches Level: Mechaniken', () => {
  const route02 = { name: 'level', pack: '02', id: '005' } as const;
  const bollardsOf = (l: typeof world2Level): number =>
    l.grid.cells.filter((c) => c.type === 'fixed').length;
  const keysOf = (l: typeof world2Level): number => l.vehicles.filter((v) => v.locked).length;

  it('Welt-2-Level: Ruleset, Poller- und Schluesselzahl des Ausgangslevels bleiben', async () => {
    const solver = new FakeSolver();
    const s = makeSession(solver, route02, new Date(2026, 10, 2, 12));
    await s.start();
    await s.similar();
    const call = solver.generateCalls[0];
    expect(call?.params).toMatchObject({
      ruleset: 'world2',
      bollards: bollardsOf(world2Level),
      keys: keysOf(world2Level),
      keyChainDepth: 1,
    });
    expect(call?.rules.id).toBe('world2');
  });

  it('Klassisches Level: weder Poller noch Schluessel', async () => {
    const solver = new FakeSolver();
    const s = makeSession(solver, { name: 'level', pack: '01', id: '007' }, new Date(2026, 10, 2));
    await s.start();
    await s.similar();
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'classic',
      bollards: 0,
      keys: 0,
    });
    expect(solver.generateCalls[0]?.params.keyChainDepth).toBeUndefined();
  });

  it('Stufe halten: Ruleset und Mechaniken der gehaltenen Stufe', async () => {
    const progress = new Progress(() => new MemStorage());
    progress.setHold(true, 2);
    const solver = new FakeSolver();
    const s = makeSession(solver, route02, new Date(2026, 10, 2), progress);
    await s.start();
    await s.similar();
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'classic',
      bollards: 0,
      keys: 0,
    });
    expect(solver.generateCalls[0]?.rules.id).toBe('classic');

    progress.setHold(true, 6);
    await s.similar();
    expect(solver.generateCalls[1]?.params).toMatchObject({ ruleset: 'world2', keys: 1 });
    expect(solver.generateCalls[1]?.rules.id).toBe('world2');
  });

  it('Fallback Spiegeln mit Pollern und Schluesseln bleibt korrekt und loesbar', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = () => Promise.reject(new Error('timeout'));
    const s = makeSession(solver, route02, new Date(2026, 10, 2));
    await s.start();
    await s.similar();
    const mirrored = s.controller.getLevel();
    const width = world2Level.grid.width;
    expect(mirrored.id).toBe('w2-05-s1');
    expect(s.controller.getRules().id).toBe('world2');
    expect(bollardsOf(mirrored)).toBe(bollardsOf(world2Level));
    expect(keysOf(mirrored)).toBe(keysOf(world2Level));
    const fixedX = (l: typeof world2Level): number[] =>
      l.grid.cells
        .filter((c) => c.type === 'fixed')
        .map((c) => width - 1 - c.x)
        .sort();
    expect(
      mirrored.grid.cells
        .filter((c) => c.type === 'fixed')
        .map((c) => c.x)
        .sort(),
    ).toEqual(fixedX(world2Level));
    for (const v of world2Level.vehicles.filter((x) => x.locked)) {
      expect(mirrored.vehicles.find((m) => m.id === v.id)).toMatchObject({
        locked: true,
        keyId: v.keyId,
      });
    }
    const a = analyze(mirrored, s.controller.getRules());
    expect(a.solvable).toBe(true);
    expect(a.minMoves).toBe(analyze(world2Level, s.controller.getRules()).minMoves);
  });
});

describe('Intro-Karten in generierten Leveln', () => {
  it('mechanicsOf erkennt Poller und Schluessel', () => {
    expect(mechanicsOf(classicLevel)).toEqual([]);
    expect(mechanicsOf(world2Level)).toEqual(['bollards', 'keys']);
  });

  it('Tageslevel: erst Poller, dann Schluessel, jeweils einmalig', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    const progress = new Progress(() => new MemStorage());
    const s = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 7, 12), progress);
    await s.start();
    expect(s.pendingIntro()).toBe('bollards');
    s.markIntroSeen('bollards');
    expect(s.pendingIntro()).toBe('keys');
    s.markIntroSeen('keys');
    expect(s.pendingIntro()).toBeNull();
    expect(progress.hasSeenIntro('bollards') && progress.hasSeenIntro('keys')).toBe(true);
  });

  it('bereits gesehene Intros erscheinen nicht erneut', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    const progress = new Progress(() => new MemStorage());
    progress.markIntroSeen('bollards');
    progress.markIntroSeen('keys');
    const s = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 7, 12), progress);
    await s.start();
    expect(s.pendingIntro()).toBeNull();
  });

  it('klassisches Tageslevel zeigt keine Karte', async () => {
    const solver = new FakeSolver();
    const s = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 2, 12));
    await s.start();
    expect(s.pendingIntro()).toBeNull();
  });

  it('Endlos: die Karte erscheint beim ersten Level mit Pollern', async () => {
    const solver = new FakeSolver();
    const s = makeSession(solver, { name: 'endless' }, new Date(2026, 10, 2, 12));
    await s.start();
    expect(s.pendingIntro()).toBeNull();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    for (let i = 0; i < 4; i++) await s.next();
    expect(s.pendingIntro()).toBe('bollards');
  });

  it('Aehnliches Level: Karte fuer das erzeugte Level; Kampagne nutzt weiter ihr Intro', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    const progress = new Progress(() => new MemStorage());
    const s = makeSession(
      solver,
      { name: 'level', pack: '01', id: '007' },
      new Date(2026, 10, 2),
      progress,
    );
    await s.start();
    expect(s.pendingIntro()).toBeNull();
    await s.similar();
    expect(s.pendingIntro()).toBe('bollards');
  });

  it('geteilte Level und Kampagne ohne Intro bleiben unberuehrt', async () => {
    const s = makeSession(
      new FakeSolver(),
      { name: 'level', pack: '01', id: '007' },
      new Date(2026, 10, 2),
    );
    await s.start();
    expect(s.pendingIntro()).toBeNull();
  });
});
