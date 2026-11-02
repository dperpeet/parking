import { describe, expect, it } from 'vitest';
import {
  DAILY_HISTORY_LIMIT,
  Progress,
  SAVE_KEY,
  emptySave,
  localDateKey,
  mergeSaves,
  migrate,
  parseImport,
  previousDateKey,
  totalStars,
  unlockedFlags,
} from '../../../src/app/progress';
import type { SaveData, StorageLike } from '../../../src/app/progress';

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceeded');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

function stored(storage: FakeStorage): SaveData {
  return JSON.parse(storage.data.get(SAVE_KEY) ?? 'null') as SaveData;
}

describe('Progress: Speicher', () => {
  it('startet leer und schreibt unter parking.save.v1', () => {
    const storage = new FakeStorage();
    const p = new Progress(() => storage);
    expect(p.isPersistent()).toBe(true);
    expect(p.get()).toEqual(emptySave());
    p.recordLevel('01/001', { stars: 3, moves: 5, stage: 1 });
    expect(stored(storage).levels['01/001']).toEqual({ stars: 3, bestMoves: 5, completed: true });
    expect(SAVE_KEY).toBe('parking.save.v1');
  });

  it('liest einen gespeicherten Stand wieder ein', () => {
    const storage = new FakeStorage();
    new Progress(() => storage).recordLevel('01/002', { stars: 2, moves: 7, stage: 2 });
    const again = new Progress(() => storage);
    expect(again.get().levels['01/002']?.stars).toBe(2);
    expect(again.get().highestStage).toBe(2);
  });

  it('wirft der Speicher, laeuft alles im Arbeitsspeicher weiter', () => {
    const p = new Progress(() => throwing);
    expect(p.isPersistent()).toBe(false);
    p.recordLevel('01/001', { stars: 1, moves: 9, stage: 1 });
    expect(p.get().levels['01/001']?.completed).toBe(true);
    expect(p.isPersistent()).toBe(false);
  });

  it('wirft schon der Zugriff auf localStorage, ist der Speicher aus', () => {
    const p = new Progress(() => {
      throw new Error('blocked');
    });
    expect(p.isPersistent()).toBe(false);
    expect(p.get()).toEqual(emptySave());
  });

  it('fehlender Speicher (null) ist kein Absturz', () => {
    const p = new Progress(() => null);
    expect(p.isPersistent()).toBe(false);
  });

  it('Schreibfehler spaeter markiert den Speicher als nicht persistent', () => {
    const storage = new FakeStorage();
    const p = new Progress(() => storage);
    storage.setItem = () => {
      throw new Error('full');
    };
    p.setHold(true, 2);
    expect(p.isPersistent()).toBe(false);
    expect(p.get().hold).toEqual({ enabled: true, stage: 2 });
  });

  it('kaputtes JSON ergibt einen leeren Stand, der Speicher bleibt nutzbar', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, '{not json');
    const p = new Progress(() => storage);
    expect(p.isPersistent()).toBe(true);
    expect(p.get()).toEqual(emptySave());
    p.setHold(true);
    expect(stored(storage).hold.enabled).toBe(true);
  });

  it('Listener werden bei Aenderungen gerufen', () => {
    const p = new Progress(() => new FakeStorage());
    let n = 0;
    const off = p.subscribe(() => n++);
    p.setLanguage('en');
    off();
    p.setLanguage('de');
    expect(n).toBe(1);
  });
});

describe('migrate', () => {
  it('liefert fuer Muell einen leeren Stand', () => {
    expect(migrate(null)).toEqual(emptySave());
    expect(migrate('x')).toEqual(emptySave());
    expect(migrate(42)).toEqual(emptySave());
    expect(migrate({ version: 99, levels: { a: {} } })).toEqual(emptySave());
  });

  it('ergaenzt fehlende Felder mit Standardwerten', () => {
    const s = migrate({
      version: 1,
      levels: { '01/001': { stars: 2, bestMoves: 4, completed: true } },
    });
    expect(s.levels['01/001']?.stars).toBe(2);
    expect(s.hold).toEqual({ enabled: false, stage: 0 });
    expect(s.settings).toEqual({ language: 'auto', motion: 'system' });
  });

  it('behandelt Staende ohne Versionsfeld wie v1', () => {
    const s = migrate({ levels: { '01/003': { stars: 1, bestMoves: 8, completed: true } } });
    expect(s.version).toBe(1);
    expect(s.levels['01/003']?.completed).toBe(true);
  });

  it('korrigiert kaputte Einzelwerte statt alles zu verwerfen', () => {
    const s = migrate({
      version: 1,
      levels: { '01/001': { stars: 9, bestMoves: -3, completed: 'yes' }, '01/002': 5 },
      hold: { enabled: 'maybe', stage: 99 },
      highestStage: 50,
      endless: { best: 4 },
      settings: { language: 'fr', motion: 'fast' },
      daily: { lastPlayed: 'gestern', streak: 2 },
    });
    expect(s.levels['01/001']).toEqual({ stars: 0, bestMoves: 0, completed: false });
    expect(s.levels['01/002']).toEqual({ stars: 0, bestMoves: 0, completed: false });
    expect(s.hold.enabled).toBe(false);
    expect(s.highestStage).toBe(6);
    expect(s.endless.best).toBe(4);
    expect(s.settings).toEqual({ language: 'auto', motion: 'system' });
    expect(s.daily.lastPlayed).toBeNull();
  });

  it('begrenzt die Tageslevel-Historie', () => {
    const history = Array.from({ length: DAILY_HISTORY_LIMIT + 10 }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      stars: 1,
      moves: 5,
    }));
    const s = migrate({ version: 1, daily: { lastPlayed: null, streak: 0, history } });
    expect(s.daily.history.length).toBe(DAILY_HISTORY_LIMIT);
  });
});

describe('Freischalten', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('Level 1 ist immer offen, sonst nur geschaffte Level und ihr Nachfolger', () => {
    expect(unlockedFlags(order, {})).toEqual([true, false, false, false, false]);
    const levels = { a: { stars: 1, bestMoves: 3, completed: true } };
    expect(unlockedFlags(order, levels)).toEqual([true, true, false, false, false]);
  });

  it('ein spaeteres Level schaltet nur seinen Nachfolger frei (Luecken erlaubt)', () => {
    const levels = { c: { stars: 3, bestMoves: 3, completed: true } };
    expect(unlockedFlags(order, levels)).toEqual([true, false, true, true, false]);
  });

  it('nicht abgeschlossene Eintraege (0 Sterne) zaehlen nicht', () => {
    const levels = { a: { stars: 0, bestMoves: 0, completed: false } };
    expect(unlockedFlags(order, levels)).toEqual([true, false, false, false, false]);
  });

  it('recordLevel behaelt nur Verbesserungen', () => {
    const p = new Progress(() => new FakeStorage());
    p.recordLevel('a', { stars: 3, moves: 10, stage: 2 });
    p.recordLevel('a', { stars: 1, moves: 14, stage: 2 });
    expect(p.get().levels.a).toEqual({ stars: 3, bestMoves: 10, completed: true });
    p.recordLevel('a', { stars: 3, moves: 8, stage: 2 });
    expect(p.get().levels.a?.bestMoves).toBe(8);
  });

  it('zaehlt Sterne fuer den Welt-Kopf', () => {
    const levels = {
      a: { stars: 3, bestMoves: 1, completed: true },
      b: { stars: 2, bestMoves: 1, completed: true },
    };
    expect(totalStars(order, levels)).toBe(5);
    expect(totalStars(order, {})).toBe(0);
  });

  it('hoechste erreichte Stufe waechst mit abgeschlossenen Leveln', () => {
    const p = new Progress(() => new FakeStorage());
    expect(p.reachedStage()).toBe(1);
    p.recordLevel('a', { stars: 1, moves: 1, stage: 3 });
    p.recordLevel('b', { stars: 1, moves: 1, stage: 2 });
    expect(p.reachedStage()).toBe(3);
  });
});

describe('Tageslevel', () => {
  it('Datumsschluessel sind lokal und rechnen Tage korrekt zurueck', () => {
    expect(localDateKey(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });

  it('Serie zaehlt aufeinanderfolgende Tage und bricht bei Luecken', () => {
    const p = new Progress(() => new FakeStorage());
    p.recordDaily('2026-11-02', { stars: 3, moves: 9 });
    expect(p.get().daily.streak).toBe(1);
    p.recordDaily('2026-11-02', { stars: 2, moves: 11 });
    expect(p.get().daily.streak).toBe(1);
    p.recordDaily('2026-11-03', { stars: 2, moves: 10 });
    expect(p.get().daily.streak).toBe(2);
    p.recordDaily('2026-11-06', { stars: 1, moves: 20 });
    expect(p.get().daily.streak).toBe(1);
    expect(p.get().daily.history.map((e) => e.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-06',
    ]);
  });

  it('currentStreak zeigt 0, wenn der Vortag verpasst wurde', () => {
    const p = new Progress(() => new FakeStorage());
    p.recordDaily('2026-11-02', { stars: 3, moves: 9 });
    p.recordDaily('2026-11-03', { stars: 3, moves: 9 });
    expect(p.currentStreak('2026-11-03')).toBe(2);
    expect(p.currentStreak('2026-11-04')).toBe(2);
    expect(p.currentStreak('2026-11-05')).toBe(0);
    expect(p.dailyDone('2026-11-03')).toBe(true);
    expect(p.dailyDone('2026-11-04')).toBe(false);
  });
});

describe('Endlos, Halten, Einstellungen', () => {
  it('Bestwert und hoechste Stufe nur nach oben', () => {
    const p = new Progress(() => new FakeStorage());
    p.recordEndless(5, 3);
    p.recordEndless(2, 1);
    expect(p.get().endless).toEqual({ best: 5, highestStage: 3 });
  });

  it('setHold nimmt beim Einschalten die erreichte Stufe', () => {
    const p = new Progress(() => new FakeStorage());
    p.recordLevel('a', { stars: 1, moves: 1, stage: 4 });
    p.setHold(true);
    expect(p.get().hold).toEqual({ enabled: true, stage: 4 });
    p.setHold(true, 2);
    p.setHold(false);
    expect(p.get().hold).toEqual({ enabled: false, stage: 2 });
  });

  it('Zaehler fuer "Aehnliches Level" steigt', () => {
    const p = new Progress(() => new FakeStorage());
    expect(p.nextSimilarCounter()).toBe(1);
    expect(p.nextSimilarCounter()).toBe(2);
  });

  it('reset loescht den Fortschritt, behaelt aber die Einstellungen', () => {
    const p = new Progress(() => new FakeStorage());
    p.recordLevel('a', { stars: 3, moves: 1, stage: 2 });
    p.setLanguage('en');
    p.reset();
    expect(p.get().levels).toEqual({});
    expect(p.get().settings.language).toBe('en');
  });
});

describe('Import und Zusammenfuehren', () => {
  const a: SaveData = {
    ...emptySave(),
    levels: {
      x: { stars: 2, bestMoves: 12, completed: true },
      y: { stars: 3, bestMoves: 7, completed: true },
    },
    daily: {
      lastPlayed: '2026-11-03',
      streak: 2,
      history: [{ date: '2026-11-03', stars: 2, moves: 9 }],
    },
    endless: { best: 3, highestStage: 2 },
    highestStage: 2,
    hold: { enabled: true, stage: 2 },
  };
  const b: SaveData = {
    ...emptySave(),
    levels: {
      x: { stars: 3, bestMoves: 9, completed: true },
      y: { stars: 1, bestMoves: 11, completed: true },
      z: { stars: 1, bestMoves: 4, completed: true },
    },
    daily: {
      lastPlayed: '2026-11-05',
      streak: 1,
      history: [
        { date: '2026-11-03', stars: 3, moves: 8 },
        { date: '2026-11-05', stars: 1, moves: 20 },
      ],
    },
    endless: { best: 9, highestStage: 1 },
    highestStage: 5,
  };

  it('behaelt je Level die besseren Sterne und Zuege', () => {
    const m = mergeSaves(a, b);
    expect(m.levels.x).toEqual({ stars: 3, bestMoves: 9, completed: true });
    expect(m.levels.y).toEqual({ stars: 3, bestMoves: 7, completed: true });
    expect(m.levels.z).toEqual({ stars: 1, bestMoves: 4, completed: true });
  });

  it('fuehrt Tageslevel, Endlos und Stufen zusammen, Halten bleibt lokal', () => {
    const m = mergeSaves(a, b);
    expect(m.daily.lastPlayed).toBe('2026-11-05');
    expect(m.daily.streak).toBe(1);
    expect(m.daily.history).toEqual([
      { date: '2026-11-03', stars: 3, moves: 8 },
      { date: '2026-11-05', stars: 1, moves: 20 },
    ]);
    expect(m.endless).toEqual({ best: 9, highestStage: 2 });
    expect(m.highestStage).toBe(5);
    expect(m.hold).toEqual({ enabled: true, stage: 2 });
  });

  it('Zusammenfuehren ist mit sich selbst idempotent', () => {
    expect(mergeSaves(a, a)).toEqual(a);
  });

  it('Progress.merge speichert das Ergebnis', () => {
    const storage = new FakeStorage();
    const p = new Progress(() => storage);
    p.merge(a);
    p.merge(b);
    expect(stored(storage).levels.x?.stars).toBe(3);
  });

  it('parseImport akzeptiert Exporte und lehnt Fremdes ab', () => {
    expect(parseImport(JSON.stringify(a))?.levels.y?.stars).toBe(3);
    expect(parseImport('kein json')).toBeNull();
    expect(parseImport('[]')).toBeNull();
    expect(parseImport('{"version":2,"levels":{}}')).toBeNull();
    expect(parseImport('{"version":1}')).toBeNull();
    expect(parseImport('null')).toBeNull();
  });
});
