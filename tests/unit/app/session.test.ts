import { beforeEach, describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import { Progress } from '../../../src/app/progress';
import type { StorageLike } from '../../../src/app/progress';
import type { PlayRoute, Route } from '../../../src/app/router';
import { dailySeed, similarSeed } from '../../../src/app/seed';
import { GameSession } from '../../../src/app/session';
import { encodeLevel } from '../../../src/app/share';
import { difficultyRange, stageShape, stageVariant } from '../../../src/app/stages';
import { analyze } from '../../../src/solver';
import type { LevelAnalysis } from '../../../src/solver/types';
import { LOSE_ORDER, WIN_ORDER, level, rules } from '../helpers';
import { FakeSolver, realEngine } from './fakes';

const campaign = getCampaign();
const NOW = new Date(2026, 10, 2, 12, 0, 0); // Montag

class MemStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

interface Harness {
  solver: FakeSolver;
  progress: Progress;
  synced: Route[];
  exits: number;
  make(route: PlayRoute, now?: Date): GameSession;
}

let h: Harness;

beforeEach(() => {
  const solver = new FakeSolver();
  const progress = new Progress(() => new MemStorage());
  const synced: Route[] = [];
  h = {
    solver,
    progress,
    synced,
    exits: 0,
    make(route, now = NOW) {
      return new GameSession(
        {
          engine: realEngine,
          solver,
          progress,
          campaign,
          now: () => now,
          syncRoute: (r) => synced.push(r),
          exit: () => void (h.exits += 1),
        },
        route,
      );
    },
  };
});

const route007 = { name: 'level', pack: '01', id: '007' } as const;

function play(session: GameSession, ids: string[]): void {
  for (const id of ids) session.controller.dispatch({ type: 'tapVehicle', vehicleId: id });
}

/** Loest das aktuelle Level ueber die Solver-Loesung. */
function solve(session: GameSession): void {
  const { controller } = session;
  const a = analyze(controller.getLevel(), controller.getRules());
  expect(a.solution).not.toBeNull();
  play(session, a.solution ?? []);
  expect(controller.getState().status).toBe('won');
}

describe('Session: Kampagne', () => {
  it('startet Level 007 und zeigt Welt und Levelnummer', async () => {
    const s = h.make(route007);
    expect(await s.start()).toBe('ready');
    expect(s.title()).toEqual({ world: 'Welt 1 · Werkstatt', level: 'Level 7' });
    expect(s.controller.getLevel().id).toBe('w1-07');
  });

  it('unbekanntes Level ergibt notFound', async () => {
    const s = h.make({ name: 'level', pack: '01', id: '999' });
    expect(await s.start()).toBe('notFound');
  });

  it('Sieg speichert Sterne, Zuege und Stufe', async () => {
    const s = h.make(route007);
    await s.start();
    play(s, WIN_ORDER);
    expect(s.controller.getState().status).toBe('won');
    expect(h.progress.get().levels['01/007']).toEqual({ stars: 3, bestMoves: 11, completed: true });
    expect(h.progress.get().highestStage).toBe(4);
  });

  it('der Sieg wird nur einmal gespeichert; Niederlagen speichern nichts', async () => {
    const s = h.make(route007);
    await s.start();
    play(s, LOSE_ORDER);
    expect(s.controller.getState().status).toBe('lost');
    expect(h.progress.get().levels).toEqual({});
  });

  it('mit Tipp gewonnen: hoechstens 2 Sterne, im Dialog und im Spielstand', async () => {
    const s = h.make(route007);
    await s.start();
    const r = await s.hints.request(() => s.controller.getState(), s.controller.getRules());
    expect(r.kind).toBe('vehicle');
    play(s, WIN_ORDER);
    expect(s.controller.getState().stars).toBe(3);
    expect(s.dialogInfo(s.controller.getState()).stars).toBe(2);
    expect(h.progress.get().levels['01/007']?.stars).toBe(2);
  });

  it('Neustart nach dem Sieg gibt die Tipps zurueck, mitten im Spiel nicht', async () => {
    const s = h.make(route007);
    await s.start();
    await s.hints.request(() => s.controller.getState(), s.controller.getRules());
    s.restart();
    expect(s.hints.left()).toBe(2);
    play(s, WIN_ORDER);
    s.restart();
    expect(s.hints.left()).toBe(3);
    expect(s.hints.used()).toBe(false);
  });

  it('Weiter geht zum naechsten Level und passt die Adresse an', async () => {
    const s = h.make(route007);
    await s.start();
    expect(s.dialogInfo(s.controller.getState()).nextLabel).toBe('Weiter');
    await s.next();
    expect(s.controller.getLevel().id).toBe('w1-08');
    expect(h.synced).toEqual([{ name: 'level', pack: '01', id: '008' }]);
    expect(s.title().level).toBe('Level 8');
  });

  it('nach dem letzten Level geht Weiter zurueck zur Auswahl', async () => {
    const last = campaign.levels.at(-1);
    expect(last).toBeDefined();
    const s = h.make({ name: 'level', pack: last?.pack ?? '01', id: last?.fileId ?? '' });
    await s.start();
    expect(s.dialogInfo(s.controller.getState()).nextLabel).toBe('Zum Menü');
    await s.next();
    expect(h.exits).toBe(1);
  });
});

describe('Session: Aehnliches Level', () => {
  it('erzeugt ein Level mit gleicher Form, Farbanzahl und Schwierigkeit +-0,5', async () => {
    const s = h.make(route007);
    await s.start();
    await s.similar();
    expect(h.solver.generateCalls).toHaveLength(1);
    const p = h.solver.generateCalls[0]?.params;
    expect(p).toMatchObject({
      width: 6,
      height: 6,
      vehicleCount: 11,
      targetDifficulty: [3.7 - 0.5, 3.7 + 0.5],
      id: 'w1-07-s1',
      seed: similarSeed('w1-07', 1),
    });
    expect(new Set(p?.colors)).toEqual(new Set(level.vehicles.map((v) => v.color)));
    expect(s.controller.getLevel().id).toBe('w1-07-s1');
    expect(s.title()).toEqual({ world: 'Welt 1 · Werkstatt', level: 'Ähnlich zu Level 7' });
  });

  it('der Zaehler im Seed steigt, das Id-Suffix wird nicht gestapelt', async () => {
    const s = h.make(route007);
    await s.start();
    await s.similar();
    await s.similar();
    const [a, b] = h.solver.generateCalls.map((c) => c.params);
    expect(a?.seed).not.toBe(b?.seed);
    expect(b?.id).toBe('w1-07-s2');
    expect(b?.seed).toBe(similarSeed('w1-07-s1', 2));
    expect(h.progress.get().similarCounter).toBe(2);
  });

  it('Sieg in einem generierten Level aendert den Kampagnenfortschritt nicht', async () => {
    const s = h.make(route007);
    await s.start();
    await s.similar();
    play(s, WIN_ORDER);
    expect(s.controller.getState().status).toBe('won');
    expect(h.progress.get().levels).toEqual({});
  });

  it('Weiter nach einem generierten Level fuehrt zum Nachfolger des Ursprungs', async () => {
    const s = h.make(route007);
    await s.start();
    await s.similar();
    await s.next();
    expect(s.controller.getLevel().id).toBe('w1-08');
  });

  it('bei Fehler oder Zeitueberschreitung gibt es die gespiegelte Variante', async () => {
    h.solver.generateImpl = () => Promise.reject(new Error('timeout'));
    const s = h.make(route007);
    await s.start();
    await s.similar();
    expect(s.controller.getLevel().id).toBe('w1-07-s1');
    const v1 = s.controller.getState().vehicles.find((v) => v.id === 'v1');
    expect(v1).toMatchObject({ x: 5, dir: 'E' });
    expect(s.hints.left()).toBe(3);
  });

  it('mit "Stufe halten" gilt die gehaltene Stufe statt der Level-Schwierigkeit', async () => {
    h.progress.setHold(true, 4);
    const s = h.make(route007);
    await s.start();
    await s.similar();
    const p = h.solver.generateCalls[0]?.params;
    const shape = stageVariant(4, p?.seed ?? 0);
    expect(p).toMatchObject({
      width: shape.width,
      vehicleCount: shape.vehicleCount,
      targetDifficulty: difficultyRange(4),
    });
    expect(p?.colors).toHaveLength(shape.colorCount);
  });

  it('der Aufruf liefert ein Promise (Spinner im Dialog) und gibt das Abbruchsignal mit', async () => {
    const s = h.make(route007);
    await s.start();
    const result = s.similar();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(h.solver.generateCalls[0]?.opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('dispose bricht ab und laedt kein Level mehr nach', async () => {
    const s = h.make(route007);
    await s.start();
    let release!: () => void;
    h.solver.generateImpl = async (params) => {
      await new Promise<void>((r) => (release = r));
      return { ...level, id: params.id ?? 'x' };
    };
    const pending = s.similar();
    s.dispose();
    release();
    await pending;
    expect(s.controller.getLevel().id).toBe('w1-07');
  });
});

describe('Session: Tageslevel', () => {
  it('Seed aus dem lokalen Datum, Stufe nach Wochentag, Level-Id mit Datum', async () => {
    const s = h.make({ name: 'daily' });
    expect(await s.start()).toBe('ready');
    const p = h.solver.generateCalls[0]?.params;
    const shape = stageShape(1); // Montag = Stufe 1
    expect(p).toMatchObject({
      seed: dailySeed('2026-11-02'),
      id: 'daily-20261102',
      width: shape.width,
      vehicleCount: shape.vehicleCount,
      targetDifficulty: difficultyRange(1),
    });
    expect(s.title().world).toBe('Tageslevel');
  });

  it('Sonntag ist schwerer als Montag', async () => {
    const sunday = new Date(2026, 10, 8, 10);
    await h.make({ name: 'daily' }, sunday).start();
    const p = h.solver.generateCalls[0]?.params;
    expect(p?.vehicleCount).toBe(stageVariant(6, dailySeed('2026-11-08')).vehicleCount);
    expect(p?.targetDifficulty).toEqual(difficultyRange(6));
  });

  it('Seed ist stabil und vom Datum abhaengig', () => {
    expect(dailySeed('2026-11-02')).toBe(dailySeed('2026-11-02'));
    expect(dailySeed('2026-11-02')).not.toBe(dailySeed('2026-11-03'));
  });

  it('Sieg aktualisiert Serie und Verlauf; Weiter fuehrt zum Menue', async () => {
    h.solver.generateImpl = async (params) => {
      const { generate } = await import('../../../src/solver/generator');
      return generate(params, rules).level;
    };
    const s = h.make({ name: 'daily' });
    await s.start();
    solve(s);
    expect(h.progress.get().daily.lastPlayed).toBe('2026-11-02');
    expect(h.progress.get().daily.streak).toBe(1);
    expect(s.dialogInfo(s.controller.getState()).showSimilar).toBe(false);
    await s.next();
    expect(h.exits).toBe(1);

    const tomorrow = h.make({ name: 'daily' }, new Date(2026, 10, 3, 9));
    await tomorrow.start();
    solve(tomorrow);
    expect(h.progress.get().daily.streak).toBe(2);
    const share = tomorrow.dailyShare(tomorrow.controller.getState());
    expect(share).toMatchObject({ date: '2026-11-03', streak: 2 });
  });

  it('dailyShare ist nur im gewonnenen Tageslevel gesetzt', async () => {
    const s = h.make({ name: 'daily' });
    await s.start();
    expect(s.dailyShare(s.controller.getState())).toBeNull();
    const c = h.make(route007);
    await c.start();
    solve(c);
    expect(c.dailyShare(c.controller.getState())).toBeNull();
  });

  it('fehlgeschlagene Generierung ergibt error', async () => {
    h.solver.generateImpl = () => Promise.reject(new Error('timeout'));
    const s = h.make({ name: 'daily' });
    expect(await s.start()).toBe('error');
  });
});

describe('Session: Endlos', () => {
  it('steigt ohne "Stufe halten" alle zwei Level um eine Stufe', async () => {
    const s = h.make({ name: 'endless' });
    await s.start();
    await s.next();
    await s.next();
    const shapes = h.solver.generateCalls.map((c) => c.params.vehicleCount);
    expect(shapes).toEqual([
      stageShape(1).vehicleCount,
      stageShape(1).vehicleCount,
      stageShape(2).vehicleCount,
    ]);
    expect(s.title()).toEqual({ world: 'Endlos · Stufe 2', level: 'Level 3' });
  });

  it('mit "Stufe halten" bleibt jedes Level auf der gewaehlten Stufe', async () => {
    h.progress.setHold(true, 3);
    const s = h.make({ name: 'endless' });
    await s.start();
    await s.next();
    await s.next();
    await s.next();
    for (const c of h.solver.generateCalls) {
      expect(c.params.vehicleCount).toBe(stageVariant(3, c.params.seed).vehicleCount);
      expect(c.params.targetDifficulty).toEqual(difficultyRange(3));
    }
    expect(s.title().world).toBe('Endlos · Stufe 3');
  });

  it('Level-Seeds und Ids sind je Run und Level verschieden', async () => {
    const s = h.make({ name: 'endless' });
    await s.start();
    await s.next();
    const [a, b] = h.solver.generateCalls.map((c) => c.params);
    expect(a?.seed).not.toBe(b?.seed);
    expect(a?.id).not.toBe(b?.id);
    expect(a?.id).toMatch(/^[a-z0-9-]{1,32}$/);
  });

  it('Siege zaehlen den Run und speichern den Bestwert', async () => {
    const s = h.make({ name: 'endless' });
    await s.start();
    play(s, WIN_ORDER);
    await s.next();
    play(s, WIN_ORDER);
    expect(h.progress.get().endless.best).toBe(2);
  });

  it('Niederlage beendet den Run: Ergebnis im Dialog, Nochmal startet einen neuen Run', async () => {
    const s = h.make({ name: 'endless' });
    await s.start();
    play(s, WIN_ORDER);
    await s.next();
    play(s, LOSE_ORDER);
    expect(s.controller.getState().status).toBe('lost');
    expect(s.dialogInfo(s.controller.getState()).endless).toEqual({ score: 1, record: true });

    await s.again();
    expect(s.controller.getState().status).toBe('playing');
    expect(s.title().level).toBe('Level 1');
    expect(h.progress.get().endless.best).toBe(1);
    play(s, LOSE_ORDER);
    expect(s.dialogInfo(s.controller.getState()).endless).toEqual({ score: 0, record: false });
  });

  it('schlaegt die Generierung im laufenden Run fehl, folgt eine Variante', async () => {
    const s = h.make({ name: 'endless' });
    await s.start();
    h.solver.generateImpl = () => Promise.reject(new Error('timeout'));
    await s.next();
    expect(s.controller.getState().status).toBe('playing');
    expect(s.title().level).toBe('Level 2');
  });

  it('schlaegt schon das erste Level fehl, ist der Status error', async () => {
    h.solver.generateImpl = () => Promise.reject(new Error('timeout'));
    expect(await h.make({ name: 'endless' }).start()).toBe('error');
  });
});

describe('Session: geteiltes Level', () => {
  const share = (opts: Parameters<typeof encodeLevel>[1] = { unchecked: false }, lv = level) => {
    const res = encodeLevel(lv, opts);
    if (!res.ok) throw new Error('encode failed');
    return { name: 'shared', code: res.code } as const;
  };
  const realAnalysis = (): LevelAnalysis => analyze(level, rules);

  it('spielt einen gueltigen Code und prueft ihn mit dem Solver', async () => {
    const s = h.make(share({ unchecked: false, title: 'Mein Level', author: 'Ada' }));
    expect(await s.start()).toBe('ready');
    expect(h.solver.analyzeCalls).toBe(1);
    expect(s.errorReason()).toBeNull();
    expect(s.sharedInfo()).toEqual({ unchecked: false, truncated: false, author: 'Ada' });
    expect(s.title()).toEqual({ world: 'Geteilt von Ada', level: 'Mein Level' });
    expect(s.controller.getLevel().id).toBe('shared');
  });

  it('wendet Overrides des Codes an', async () => {
    const lv = { ...level, overrides: { queue: { slots: 7 } } };
    const s = h.make(share({ unchecked: false }, lv));
    expect(await s.start()).toBe('ready');
    expect(s.controller.getRules().queue.slots).toBe(7);
  });

  it('meldet ungeprueft und truncated als Hinweis, spielt aber', async () => {
    const unchecked = h.make(share({ unchecked: true }));
    expect(await unchecked.start()).toBe('ready');
    expect(unchecked.sharedInfo()).toMatchObject({ unchecked: true, truncated: false });

    h.solver.analyze = async () => ({ ...realAnalysis(), solvable: false, truncated: true });
    const cut = h.make(share());
    expect(await cut.start()).toBe('ready');
    expect(cut.sharedInfo()).toMatchObject({ unchecked: false, truncated: true });
    expect(cut.title().world).toBe('Geteiltes Level');
  });

  it('kaputter Code ergibt error mit Ursache und ohne Solver-Aufruf', async () => {
    const cases: Array<[string, string]> = [
      ['', 'empty'],
      ['2.abcd', 'version'],
      ['1.ab+/', 'encoding'],
      ['1.AAAA', 'inflate'],
    ];
    for (const [code, reason] of cases) {
      const s = h.make({ name: 'shared', code });
      expect(await s.start()).toBe('error');
      expect(s.errorReason()).toBe(reason);
      expect(s.sharedInfo()).toBeNull();
    }
    expect(h.solver.analyzeCalls).toBe(0);
  });

  it('nicht loesbares Level ergibt error "unsolvable"', async () => {
    h.solver.analyze = async () => ({ ...realAnalysis(), solvable: false, truncated: false });
    const s = h.make(share());
    expect(await s.start()).toBe('error');
    expect(s.errorReason()).toBe('unsolvable');
  });

  it('Solver-Fehler ergibt error ohne Ursache', async () => {
    h.solver.analyze = () => Promise.reject(new Error('worker'));
    const s = h.make(share());
    expect(await s.start()).toBe('error');
    expect(s.errorReason()).toBeNull();
  });

  it('Sieg zaehlt nicht zum Fortschritt; Dialog ohne Weiter und Aehnliches', async () => {
    const before = JSON.stringify(h.progress.get());
    const s = h.make(share());
    await s.start();
    play(s, WIN_ORDER);
    expect(s.controller.getState().status).toBe('won');
    expect(JSON.stringify(h.progress.get())).toBe(before);
    const info = s.dialogInfo(s.controller.getState());
    expect(info.nextLabel).toBe('Zum Menü');
    expect(info.showSimilar).toBe(false);
    expect(info.endless).toBeNull();
    s.next();
    expect(h.exits).toBe(1);
  });

  it('Nochmal startet das geteilte Level neu', async () => {
    const s = h.make(share());
    await s.start();
    play(s, WIN_ORDER);
    s.again();
    expect(s.controller.getState().status).toBe('playing');
    expect(s.controller.getState().moves).toBe(0);
  });

  it('Abbruch waehrend der Analyse ueber dispose', async () => {
    let signal: AbortSignal | undefined;
    h.solver.analyze = (_l, _r, opts) => {
      signal = opts?.signal;
      return new Promise(() => undefined);
    };
    const s = h.make(share());
    void s.start();
    s.dispose();
    expect(signal?.aborted).toBe(true);
  });
});
