import { beforeEach, describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import { Progress } from '../../../src/app/progress';
import type { StorageLike } from '../../../src/app/progress';
import type { PlayRoute } from '../../../src/app/router';
import { GameSession, mechanicsOf } from '../../../src/app/session';
import type { SolverPort } from '../../../src/app/solver-port';
import { dailySeed } from '../../../src/app/seed';
import {
  HONK_MAX_ATTEMPTS,
  STAGE_KEY_CHAIN_DEPTH,
  dailyStage,
  stageShape,
  stageVariant,
} from '../../../src/app/stages';
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

// 2026-11-01 ist ein Sonntag; die Wochentage 0 bis 6 liegen auf den Tagen 1. bis 7. Die Varianten dieser
// Woche: So world2, Mo/Di classic, Mi/Do mystery, Fr turns, Sa honk (deckt jede Variante ab).
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  date: `2026-11-0${d}`,
  now: new Date(2026, 10, d, 12),
}));
const variantOf = (date: string, now: Date) => stageVariant(dailyStage(now), dailySeed(date));

const countRange = (c: number | [number, number]): [number, number] =>
  Array.isArray(c) ? c : [c, c];

describe('Tageslevel: Mechaniken je Wochentag', () => {
  it.each(WEEK)('$date: Parameter folgen Stufe und Variante', async ({ date, now }) => {
    const solver = new FakeSolver();
    await makeSession(solver, { name: 'daily' }, now).start();
    const call = solver.generateCalls[0];
    const shape = variantOf(date, now);
    expect(call?.params).toMatchObject({
      ruleset: shape.ruleset,
      bollards: shape.bollards,
      keys: shape.keys,
      vehicleCount: shape.vehicleCount,
    });
    expect(call?.params.keyChainDepth).toBe(shape.keys ? STAGE_KEY_CHAIN_DEPTH : undefined);
    expect(call?.params.requireHonk).toBe(shape.requireHonk);
    expect(call?.params.mystery).toEqual(shape.mystery);
    expect(call?.params.oneWay).toEqual(shape.oneWay);
    expect(call?.rules.id).toBe(shape.ruleset);
  });

  it('Samstag (Stufe 5): Pflicht-Hupe mit world3 und mehr Versuchen', async () => {
    const solver = new FakeSolver();
    await makeSession(solver, { name: 'daily' }, new Date(2026, 10, 7, 9)).start();
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'world3',
      requireHonk: true,
      maxAttempts: HONK_MAX_ATTEMPTS,
    });
    expect(solver.generateCalls[0]?.rules.id).toBe('world3');
  });

  it('Freitag (Stufe 4): Abbiegepfeile mit world5; Mittwoch (Stufe 3): Mystery mit world4', async () => {
    const solver = new FakeSolver();
    await makeSession(solver, { name: 'daily' }, new Date(2026, 10, 6, 9)).start();
    await makeSession(solver, { name: 'daily' }, new Date(2026, 10, 4, 9)).start();
    expect(solver.generateCalls[0]?.params).toMatchObject({ ruleset: 'world5', oneWay: [2, 3] });
    expect(solver.generateCalls[0]?.rules.movement.model).toBe('turns');
    expect(solver.generateCalls[1]?.params).toMatchObject({ ruleset: 'world4', mystery: 1 });
  });

  it('findet die Variante kein Level, folgt die Grundvariante der Stufe', async () => {
    const solver = new FakeSolver();
    const impl = solver.generateImpl;
    solver.generateImpl = (p) =>
      p.requireHonk ? Promise.reject(new Error('kein Level')) : impl(p);
    const s = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 7, 9));
    expect(await s.start()).toBe('ready');
    expect(solver.generateCalls.map((c) => c.params.ruleset)).toEqual(['world3', 'world2']);
    expect(solver.generateCalls[1]?.params).toMatchObject({
      seed: dailySeed('2026-11-07'),
      vehicleCount: stageShape(5).vehicleCount,
    });
    expect(s.pendingIntro()).toBeNull();
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
    async ({ date, now }) => {
      const generateOnce = async (): Promise<GameSession> => {
        const s = makeSession(realSolver, { name: 'daily' }, now);
        expect(await s.start()).toBe('ready');
        return s;
      };
      const a = await generateOnce();
      const b = await generateOnce();
      expect(JSON.stringify(a.controller.getLevel())).toBe(JSON.stringify(b.controller.getLevel()));

      const lvl = a.controller.getLevel();
      const shape = variantOf(date, now);
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
      const rules = a.controller.getRules();
      const mystery = lvl.vehicles.filter((v) => v.mystery).length;
      const arrows = lvl.grid.cells.filter((c) => c.type === 'oneWay').length;
      expect(mystery > 0).toBe(shape.mystery !== undefined);
      expect(arrows > 0).toBe(shape.oneWay !== undefined);
      if (shape.requireHonk) {
        // Wie in Welt 3: mit Tipps allein unloesbar, mit hoechstens einer Hupe loesbar.
        expect(rules.powerups.honk.uses).toBe(1);
        const tapOnly = analyze(lvl, rules);
        expect(tapOnly.solvable || tapOnly.truncated).toBe(false);
        expect(analyze(lvl, rules, { allowHonk: true }).solvable).toBe(true);
        expect(a.pendingIntro()).toBe(mechanicsOf(lvl, true)[0]);
        expect(mechanicsOf(lvl, true)).toContain('honk');
      } else {
        expect(analyze(lvl, rules).solvable).toBe(true);
      }
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

  it('Stufe 1-2 classic, ab Stufe 3 folgt das Ruleset der Variante des Level-Seeds', async () => {
    const s = makeSession(solver, { name: 'endless' }, new Date(2026, 10, 2, 12));
    await s.start();
    for (let i = 0; i < 4; i++) await s.next();
    const calls = solver.generateCalls;
    expect(calls.slice(0, 4).map((c) => c.params.ruleset)).toEqual(Array(4).fill('classic'));
    const v = stageVariant(3, calls[4]!.params.seed);
    expect(calls[4]?.params).toMatchObject({ ruleset: v.ruleset, bollards: v.bollards, keys: 0 });
    expect(calls[4]?.rules.id).toBe(v.ruleset);
    expect(s.controller.getRules().id).toBe(v.ruleset);
  });

  it('ein Run mit demselben Run-Seed waehlt dieselben Varianten; Stufe halten (5) mischt alle', async () => {
    const progress = new Progress(() => new MemStorage());
    progress.setHold(true, 5);
    const run = async (): Promise<string[]> => {
      const local = new FakeSolver();
      const s = makeSession(local, { name: 'endless' }, new Date(2026, 10, 2, 12), progress);
      await s.start();
      for (let i = 0; i < 15; i++) await s.next();
      return local.generateCalls.map((c) => `${c.params.seed}:${c.params.ruleset}`);
    };
    const first = await run();
    expect(await run()).toEqual(first);
    const rulesets = new Set(first.map((x) => x.split(':')[1]));
    expect(rulesets).toEqual(new Set(['world2', 'world3', 'world4', 'world5']));
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
    expect(solver.generateCalls[0]?.params.requireHonk).toBeUndefined();
    expect(solver.analyzeCalls).toBe(0); // classic hat keine Hupe: keine Pflicht-Hupe-Pruefung
  });

  it('Welt-3-Level: Pflicht-Hupe bleibt (Pruefung per Analyse), auch in der Spiegel-Variante', async () => {
    const solver = new FakeSolver();
    const progress = new Progress(() => new MemStorage());
    progress.markIntroSeen('bollards');
    const s = makeSession(
      solver,
      { name: 'level', pack: '03', id: '006' },
      new Date(2026, 10, 2),
      progress,
    );
    await s.start();
    await s.similar();
    expect(solver.analyzeCalls).toBe(1);
    expect(solver.generateCalls[0]?.params).toMatchObject({
      ruleset: 'world3',
      requireHonk: true,
      maxAttempts: HONK_MAX_ATTEMPTS,
    });
    expect(s.pendingIntro()).toBe('honk');
    expect(s.guidedHonk()).toBe(true);
    // Aehnliches vom Aehnlichen: Die Pflicht-Hupe ist bekannt, die Spiegel-Variante behaelt sie.
    solver.generateImpl = () => Promise.reject(new Error('timeout'));
    await s.similar();
    expect(solver.analyzeCalls).toBe(1);
    expect(solver.generateCalls[1]?.params.requireHonk).toBe(true);
    expect(s.controller.getLevel().id).toBe('w3-06-s2');
    expect(s.pendingIntro()).toBe('honk');
  });

  it('Welt-4/5-Level: Zahl der Mystery-Fahrzeuge bzw. Abbiegepfeile bleibt, keine Pflicht-Hupe', async () => {
    const solver = new FakeSolver();
    const w4 = makeSession(solver, { name: 'level', pack: '04', id: '010' }, new Date(2026, 10, 2));
    await w4.start();
    await w4.similar();
    const w5 = makeSession(solver, { name: 'level', pack: '05', id: '010' }, new Date(2026, 10, 2));
    await w5.start();
    await w5.similar();
    const [mystery, arrows] = solver.generateCalls.map((c) => c.params);
    expect(mystery).toMatchObject({ ruleset: 'world4', mystery: 2 });
    expect(mystery?.requireHonk).toBeUndefined();
    expect(arrows).toMatchObject({ ruleset: 'world5', oneWay: 3 });
    expect(arrows?.requireHonk).toBeUndefined();
    expect(solver.analyzeCalls).toBe(1); // nur Welt 4; Pfeile schliessen die Pflicht-Hupe aus
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
    const v = stageVariant(6, solver.generateCalls[1]!.params.seed);
    expect(solver.generateCalls[1]?.params).toMatchObject({ ruleset: v.ruleset, keys: 1 });
    expect(solver.generateCalls[1]?.rules.id).toBe(v.ruleset);
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
  it('mechanicsOf erkennt Poller und Schluessel, Pflicht-Hupe nur per Flag', () => {
    expect(mechanicsOf(classicLevel)).toEqual([]);
    expect(mechanicsOf(world2Level)).toEqual(['bollards', 'keys']);
    expect(mechanicsOf(world2Level, true)).toEqual(['bollards', 'keys', 'honk']);
    expect(mechanicsOf(classicLevel, true)).toEqual(['honk']);
  });

  it('Tageslevel: erst Poller, dann Schluessel, jeweils einmalig', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    const progress = new Progress(() => new MemStorage());
    const s = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 1, 12), progress);
    await s.start();
    expect(s.pendingIntro()).toBe('bollards');
    s.markIntroSeen('bollards');
    expect(s.pendingIntro()).toBe('keys');
    s.markIntroSeen('keys');
    expect(s.pendingIntro()).toBeNull();
    expect(progress.hasSeenIntro('bollards') && progress.hasSeenIntro('keys')).toBe(true);
  });

  it('mechanicsOf erkennt Mystery-Fahrzeuge (nach Pollern und Schluesseln)', () => {
    const mysteryLevel = {
      ...world2Level,
      vehicles: world2Level.vehicles.map((v, i) => (i === 0 ? { ...v, mystery: true } : v)),
    };
    expect(mechanicsOf(mysteryLevel)).toEqual(['bollards', 'keys', 'mystery']);
    const plain = { ...classicLevel, vehicles: [{ ...classicLevel.vehicles[0]!, mystery: true }] };
    expect(mechanicsOf(plain)).toEqual(['mystery']);
    const off = { ...classicLevel, vehicles: [{ ...classicLevel.vehicles[0]!, mystery: false }] };
    expect(mechanicsOf(off)).toEqual([]);
  });

  it('mechanicsOf erkennt Abbiegepfeile (oneWay-Zellen, zuletzt)', () => {
    const arrows = {
      ...world2Level,
      grid: {
        ...world2Level.grid,
        cells: [
          ...world2Level.grid.cells,
          { x: 0, y: 0, type: 'oneWay' as const, dir: 'N' as const },
        ],
      },
    };
    expect(mechanicsOf(arrows)).toEqual(['bollards', 'keys', 'oneWay']);
    const only = {
      ...classicLevel,
      grid: {
        ...classicLevel.grid,
        cells: [{ x: 0, y: 0, type: 'oneWay' as const, dir: 'E' as const }],
      },
    };
    expect(mechanicsOf(only)).toEqual(['oneWay']);
  });

  it('bereits gesehene Intros erscheinen nicht erneut', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    const progress = new Progress(() => new MemStorage());
    progress.markIntroSeen('bollards');
    progress.markIntroSeen('keys');
    const s = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 1, 12), progress);
    await s.start();
    expect(s.pendingIntro()).toBeNull();
  });

  it('Pflicht-Hupe-Tageslevel: Karte honk nach Pollern und Schluesseln, gefuehrte Hupe nur beim ersten Mal', async () => {
    const solver = new FakeSolver();
    solver.generateImpl = (p) => Promise.resolve({ ...world2Level, id: p.id ?? 'x' });
    const progress = new Progress(() => new MemStorage());
    const saturday = new Date(2026, 10, 7, 12); // Stufe 5, Variante honk
    const s = makeSession(solver, { name: 'daily' }, saturday, progress);
    await s.start();
    expect(s.guidedHonk()).toBe(true);
    for (const m of ['bollards', 'keys', 'honk'] as const) {
      expect(s.pendingIntro()).toBe(m);
      s.markIntroSeen(m);
    }
    expect(s.pendingIntro()).toBeNull();
    const again = makeSession(solver, { name: 'daily' }, saturday, progress);
    await again.start();
    expect(again.guidedHonk()).toBe(false);
    const plain = makeSession(new FakeSolver(), { name: 'daily' }, new Date(2026, 10, 2), progress);
    await plain.start();
    expect(plain.guidedHonk()).toBe(false);
  });

  it('Mystery- und Pfeil-Tageslevel zeigen ihre Karte', async () => {
    const progress = new Progress(() => new MemStorage());
    const solver = new FakeSolver();
    solver.generateImpl = (p) =>
      Promise.resolve({
        ...classicLevel,
        id: p.id ?? 'x',
        vehicles: classicLevel.vehicles.map((v, i) =>
          i === 0 && p.mystery ? { ...v, mystery: true } : v,
        ),
        grid: {
          ...classicLevel.grid,
          cells: p.oneWay ? [{ x: 4, y: 0, type: 'oneWay' as const, dir: 'N' as const }] : [],
        },
      });
    const wednesday = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 4), progress);
    await wednesday.start();
    expect(wednesday.pendingIntro()).toBe('mystery');
    const friday = makeSession(solver, { name: 'daily' }, new Date(2026, 10, 6), progress);
    await friday.start();
    expect(friday.pendingIntro()).toBe('oneWay');
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
