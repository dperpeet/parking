import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../../src/i18n';
import { buildCampaign } from '../../../src/app/levels';
import type { Campaign } from '../../../src/app/levels';
import { Progress, emptySave, mergeSaves, migrate, parseImport } from '../../../src/app/progress';
import type { SaveData, StorageLike } from '../../../src/app/progress';
import { buildSelectModel } from '../../../src/app/select-model';
import { GameSession } from '../../../src/app/session';
import { levelOpenFlags, nextCampaignLevel, worldOpenFlags } from '../../../src/app/unlock';
import classic from '../../../src/content/rulesets/classic.json';
import level007 from '../../../src/content/levels/pack-01/007.json';
import { analyze } from '../../../src/solver';
import { FakeSolver, realEngine } from './fakes';

class MemStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

const lvl = (id: string): unknown => ({ ...level007, id });

/** Welt 1 mit drei Leveln, Welt 2 mit zwei (Intros bollards/keys), Welt 3 mit einem. */
function fixture(): Campaign {
  return buildCampaign(
    {
      '/x/levels/pack-01/a1.json': lvl('t-a1'),
      '/x/levels/pack-01/a2.json': lvl('t-a2'),
      '/x/levels/pack-01/a3.json': lvl('t-a3'),
      '/x/levels/pack-02/b1.json': lvl('t-b1'),
      '/x/levels/pack-02/b2.json': lvl('t-b2'),
      '/x/levels/pack-03/c1.json': lvl('t-c1'),
    },
    {
      '/x/levels/pack-01/index.json': {
        world: 1,
        name: { de: 'Eins', en: 'One' },
        levels: ['a1', 'a2', 'a3'],
      },
      '/x/levels/pack-02/index.json': {
        world: 2,
        name: { de: 'Zwei', en: 'Two' },
        levels: ['b1', 'b2'],
        intros: { b1: 'bollards', b2: 'keys' },
      },
      '/x/levels/pack-03/index.json': {
        world: 3,
        name: 'Drei',
        levels: ['c1'],
      },
    },
    { '/x/rulesets/classic.json': classic },
  );
}

const done = (stars = 1): SaveData['levels'][string] => ({
  stars,
  bestMoves: 5,
  completed: true,
});

const campaign = fixture();

describe('Welt-Freischaltung', () => {
  it('frisch: nur Welt 1 offen', () => {
    expect(worldOpenFlags(campaign.worlds, {})).toEqual([true, false, false]);
  });

  it('Welt N+1 oeffnet erst, wenn ALLE Level von Welt N geschafft sind', () => {
    const partial = { '01/a1': done(), '01/a2': done() };
    expect(worldOpenFlags(campaign.worlds, partial)).toEqual([true, false, false]);
    const all = { ...partial, '01/a3': done() };
    expect(worldOpenFlags(campaign.worlds, all)).toEqual([true, true, false]);
    const both = { ...all, '02/b1': done(), '02/b2': done() };
    expect(worldOpenFlags(campaign.worlds, both)).toEqual([true, true, true]);
  });

  it('ein Level mit 0 Sternen (nicht abgeschlossen) zaehlt nicht', () => {
    const levels = {
      '01/a1': done(),
      '01/a2': done(),
      '01/a3': { stars: 0, bestMoves: 0, completed: false },
    };
    expect(worldOpenFlags(campaign.worlds, levels)[1]).toBe(false);
  });

  it('geschaffte Level bleiben spielbar, auch in einer sonst gesperrten Welt (Import)', () => {
    const levels = { '02/b2': done() };
    const open = worldOpenFlags(campaign.worlds, levels);
    expect(open[1]).toBe(true);
    const w2 = campaign.worlds[1];
    expect(w2 && levelOpenFlags(w2, open[1] ?? false, levels)).toEqual([true, true]);
  });

  it('Level innerhalb einer Welt: geschafftes Level schaltet das naechste frei', () => {
    const [w1, w2] = campaign.worlds;
    if (!w1 || !w2) throw new Error('Fixture');
    expect(levelOpenFlags(w1, true, {})).toEqual([true, false, false]);
    expect(levelOpenFlags(w1, true, { '01/a1': done() })).toEqual([true, true, false]);
    // Gesperrte Welt: auch Level 1 gesperrt.
    expect(levelOpenFlags(w2, false, {})).toEqual([false, false]);
    // Offene Welt 2: Level 1 offen, Level 2 erst nach Level 1.
    expect(levelOpenFlags(w2, true, {})).toEqual([true, false]);
  });
});

describe('Weiter nach dem letzten Level einer Welt', () => {
  const last1 = campaign.find('01', 'a3');
  const last2 = campaign.find('02', 'b2');
  const first2 = campaign.find('02', 'b1');

  it('innerhalb der Welt wie bisher', () => {
    const a1 = campaign.find('01', 'a1');
    expect(a1 && nextCampaignLevel(campaign, {}, a1)?.key).toBe('01/a2');
  });

  it('fuehrt zu Level 1 der naechsten Welt, wenn freigeschaltet', () => {
    const levels = { '01/a1': done(), '01/a2': done(), '01/a3': done() };
    expect(last1 && nextCampaignLevel(campaign, levels, last1)).toBe(first2);
  });

  it('sonst undefined (zurueck zur Auswahl)', () => {
    expect(last1 && nextCampaignLevel(campaign, { '01/a3': done() }, last1)).toBeUndefined();
  });

  it('nach der letzten Welt gibt es nichts mehr', () => {
    const levels = { '02/b1': done(), '02/b2': done() };
    const c1 = campaign.find('03', 'c1');
    expect(last2 && nextCampaignLevel(campaign, levels, last2)?.key).toBe('03/c1');
    expect(c1 && nextCampaignLevel(campaign, levels, c1)).toBeUndefined();
  });
});

describe('Auswahl-Modell mit mehreren Welten', () => {
  const base = {
    campaign,
    today: '2026-11-02',
    lang: 'de' as const,
    persistent: true,
    reachedStage: 1,
    streak: 0,
  };

  it('frisch: Welt 2 und 3 gesperrt, mit Hinweis, ohne Kacheln-Freigabe', () => {
    const m = buildSelectModel({ ...base, save: emptySave() });
    expect(m.worlds.map((w) => w.locked)).toEqual([false, true, true]);
    expect(m.worlds[1]?.title).toBe('Welt 2 · Zwei');
    expect(m.worlds[1]?.lockedHint).toBe('Schaffe alle Level von Welt 1');
    expect(m.worlds[2]?.lockedHint).toBe('Schaffe alle Level von Welt 2');
    expect(m.worlds[1]?.tiles.every((t) => t.state === 'locked')).toBe(true);
    expect(m.worlds[1]?.intros).toEqual([]);
  });

  afterEach(() => setLanguage('de'));

  it('Titel in der Sprache der App, einsprachige Namen bleiben', () => {
    setLanguage('en');
    const en = buildSelectModel({ ...base, lang: 'en', save: emptySave() });
    expect(en.worlds[0]?.title).toBe('World 1 · One');
    expect(en.worlds[2]?.title).toBe('World 3 · Drei');
  });

  it('Welt 1 komplett: Welt 2 offen, Level 1 offen, Intros abrufbar, Sterne je Welt', () => {
    const save = emptySave();
    save.levels = { '01/a1': done(3), '01/a2': done(2), '01/a3': done(1) };
    const m = buildSelectModel({ ...base, save });
    expect(m.worlds[0]).toMatchObject({ starsEarned: 6, starsTotal: 9, locked: false });
    expect(m.worlds[1]).toMatchObject({ locked: false, starsEarned: 0, starsTotal: 6 });
    expect(m.worlds[1]?.tiles.map((t) => t.state)).toEqual(['open', 'locked']);
    expect(m.worlds[1]?.tiles[0]).toMatchObject({ world: 2, number: 1 });
    expect(m.worlds[1]?.intros).toEqual(['bollards', 'keys']);
    expect(m.worlds[2]?.locked).toBe(true);
  });
});

describe('seenIntros im Spielstand', () => {
  it('alte Staende ohne Feld: leer, sonst gueltig', () => {
    const old: Record<string, unknown> = { ...emptySave() };
    delete old.seenIntros;
    expect(migrate(old).seenIntros).toEqual([]);
  });

  it('filtert Unbekanntes und Doppelte', () => {
    const raw = { ...emptySave(), seenIntros: ['keys', 'unsinn', 'keys', 7, 'bollards'] };
    expect(migrate(raw).seenIntros).toEqual(['keys', 'bollards']);
    expect(migrate({ ...emptySave(), seenIntros: 'kaputt' }).seenIntros).toEqual([]);
  });

  it('markIntroSeen speichert einmalig und benachrichtigt Listener', () => {
    const p = new Progress(() => new MemStorage());
    let calls = 0;
    p.subscribe(() => (calls += 1));
    expect(p.hasSeenIntro('keys')).toBe(false);
    p.markIntroSeen('keys');
    p.markIntroSeen('keys');
    expect(p.get().seenIntros).toEqual(['keys']);
    expect(p.hasSeenIntro('keys')).toBe(true);
    expect(calls).toBe(1);
  });

  it('Import, Zusammenfuehren und Ersetzen beruecksichtigen das Feld', () => {
    const incoming = { ...emptySave(), seenIntros: ['bollards' as const] };
    expect(parseImport(JSON.stringify(incoming))?.seenIntros).toEqual(['bollards']);
    const base = { ...emptySave(), seenIntros: ['keys' as const] };
    expect(mergeSaves(base, incoming).seenIntros).toEqual(['keys', 'bollards']);
    expect(mergeSaves(base, base).seenIntros).toEqual(['keys']);

    const p = new Progress(() => new MemStorage());
    p.markIntroSeen('keys');
    p.merge(incoming);
    expect(p.get().seenIntros).toEqual(['keys', 'bollards']);
    p.replace({ ...emptySave(), seenIntros: ['bollards'] });
    expect(p.get().seenIntros).toEqual(['bollards']);
    p.reset();
    expect(p.get().seenIntros).toEqual([]);
  });
});

describe('Session: Welten', () => {
  let progress: Progress;
  let exits: number;
  const synced: unknown[] = [];

  const make = (pack: string, id: string): GameSession =>
    new GameSession(
      {
        engine: realEngine,
        solver: new FakeSolver(),
        progress,
        campaign,
        now: () => new Date(2026, 10, 2),
        syncRoute: (r) => void synced.push(r),
        exit: () => void (exits += 1),
      },
      { name: 'level', pack, id },
    );

  const solve = (s: GameSession): void => {
    const { controller } = s;
    const a = analyze(controller.getLevel(), controller.getRules());
    for (const id of a.solution ?? []) controller.dispatch({ type: 'tapVehicle', vehicleId: id });
    expect(controller.getState().status).toBe('won');
  };

  beforeEach(() => {
    progress = new Progress(() => new MemStorage());
    exits = 0;
    synced.length = 0;
  });

  it('HUD-Titel nennt Weltnummer und Namen der Welt', async () => {
    const s = make('02', 'b2');
    await s.start();
    expect(s.title()).toEqual({ world: 'Welt 2 · Zwei', level: 'Level 2' });
  });

  it('Weiter nach dem letzten Level einer Welt: naechste Welt, wenn freigeschaltet', async () => {
    progress.recordLevel('01/a1', { stars: 1, moves: 5, stage: 1 });
    progress.recordLevel('01/a2', { stars: 1, moves: 5, stage: 1 });
    const s = make('01', 'a3');
    await s.start();
    solve(s);
    expect(s.dialogInfo(s.controller.getState()).nextLabel).toBe('Weiter');
    await s.next();
    expect(synced).toEqual([{ name: 'level', pack: '02', id: 'b1' }]);
    expect(s.title()).toEqual({ world: 'Welt 2 · Zwei', level: 'Level 1' });
    expect(exits).toBe(0);
  });

  it('Weiter fuehrt zurueck zur Auswahl, wenn die naechste Welt gesperrt bleibt', async () => {
    const s = make('01', 'a3');
    await s.start();
    solve(s);
    expect(s.dialogInfo(s.controller.getState()).nextLabel).toBe('Zum Menü');
    await s.next();
    expect(exits).toBe(1);
    expect(synced).toEqual([]);
  });

  it('Intro erscheint einmal pro Mechanik, bis es gesehen wurde', async () => {
    const s = make('02', 'b1');
    await s.start();
    expect(s.pendingIntro()).toBe('bollards');
    expect(progress.hasSeenIntro('bollards')).toBe(false);
    s.markIntroSeen('bollards');
    expect(s.pendingIntro()).toBeNull();
    const again = make('02', 'b1');
    await again.start();
    expect(again.pendingIntro()).toBeNull();
    const keys = make('02', 'b2');
    await keys.start();
    expect(keys.pendingIntro()).toBe('keys');
  });

  it('Level ohne Intro haben keine Karte', async () => {
    const s = make('01', 'a1');
    await s.start();
    expect(s.pendingIntro()).toBeNull();
  });
});
