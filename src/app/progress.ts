// Fortschritt ohne Accounts: ein localStorage-Eintrag `parking.save.v1`, versioniert, mit Speicher-Fallback.
import { z } from 'zod';
import { STAGE_COUNT, clampStage } from './stages';

export const SAVE_KEY = 'parking.save.v1';
export const SAVE_VERSION = 1;
/** Anzahl gespeicherter Tageslevel-Ergebnisse. */
export const DAILY_HISTORY_LIMIT = 60;
export const MAX_STARS = 3;

export type LanguageSetting = 'auto' | 'de' | 'en';
export type MotionSetting = 'system' | 'on' | 'off';

const Count = z.number().int().min(0);
const Stars = z.number().int().min(0).max(MAX_STARS);
const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const LevelResult = z.object({
  stars: Stars.catch(0),
  bestMoves: Count.catch(0),
  completed: z.boolean().catch(false),
});

const DailyEntry = z.object({ date: DateKey, stars: Stars, moves: Count });

const SaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  levels: z
    .record(z.string(), LevelResult.catch({ stars: 0, bestMoves: 0, completed: false }))
    .catch({}),
  daily: z
    .object({
      lastPlayed: DateKey.nullable().catch(null),
      streak: Count.catch(0),
      history: z.array(DailyEntry.catch({ date: '1970-01-01', stars: 0, moves: 0 })).catch([]),
    })
    .catch({ lastPlayed: null, streak: 0, history: [] }),
  endless: z
    .object({ best: Count.catch(0), highestStage: Count.catch(0) })
    .catch({ best: 0, highestStage: 0 }),
  hold: z
    .object({ enabled: z.boolean().catch(false), stage: Count.catch(0) })
    .catch({ enabled: false, stage: 0 }),
  highestStage: Count.catch(0),
  similarCounter: Count.catch(0),
  settings: z
    .object({
      language: z.enum(['auto', 'de', 'en']).catch('auto'),
      motion: z.enum(['system', 'on', 'off']).catch('system'),
    })
    .catch({ language: 'auto', motion: 'system' }),
});

export type SaveData = z.infer<typeof SaveSchema>;
export type LevelResult = z.infer<typeof LevelResult>;

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    levels: {},
    daily: { lastPlayed: null, streak: 0, history: [] },
    endless: { best: 0, highestStage: 0 },
    hold: { enabled: false, stage: 0 },
    highestStage: 0,
    similarCounter: 0,
    settings: { language: 'auto', motion: 'system' },
  };
}

/**
 * Bringt beliebige gespeicherte oder importierte Daten auf das aktuelle Format.
 * Unlesbares ergibt einen leeren Stand; einzelne kaputte Felder fallen auf ihren Standard zurueck.
 * Neue Versionen bekommen hier einen weiteren Schritt (vN -> vN+1) vor dem Parsen.
 */
export function migrate(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) return emptySave();
  const obj = raw as Record<string, unknown>;
  // Version 0/ohne Version: gleiche Struktur wie v1 (nur Vorabformat ohne Versionsfeld).
  const version = obj.version === undefined ? SAVE_VERSION : obj.version;
  if (version !== SAVE_VERSION) return emptySave();
  const parsed = SaveSchema.safeParse({ ...obj, version: SAVE_VERSION });
  if (!parsed.success) return emptySave();
  return clean(parsed.data);
}

/** Importierte Datei -> Spielstand; null, wenn sie kein Spielstand im aktuellen Format ist. */
export function parseImport(text: string): SaveData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const levels = obj.levels;
  if (obj.version !== SAVE_VERSION || typeof levels !== 'object' || levels === null) return null;
  return migrate(raw);
}

function clean(save: SaveData): SaveData {
  const history = save.daily.history
    .filter((e) => e.date !== '1970-01-01')
    .slice(-DAILY_HISTORY_LIMIT);
  return {
    ...save,
    daily: { ...save.daily, history },
    highestStage: Math.min(STAGE_COUNT, save.highestStage),
    endless: { ...save.endless, highestStage: Math.min(STAGE_COUNT, save.endless.highestStage) },
    hold: { ...save.hold, stage: Math.min(STAGE_COUNT, save.hold.stage) },
  };
}

/** Fuehrt zwei Staende zusammen (Import): bessere Sterne und Zuege, laengere Serie, hoechste Stufen. */
export function mergeSaves(base: SaveData, incoming: SaveData): SaveData {
  const levels: Record<string, LevelResult> = { ...base.levels };
  for (const [key, inc] of Object.entries(incoming.levels)) {
    const cur = levels[key];
    if (!cur) {
      levels[key] = { ...inc };
      continue;
    }
    const moves = [cur.bestMoves, inc.bestMoves].filter((m) => m > 0);
    levels[key] = {
      stars: Math.max(cur.stars, inc.stars),
      bestMoves: moves.length > 0 ? Math.min(...moves) : 0,
      completed: cur.completed || inc.completed,
    };
  }
  const byDate = new Map<string, SaveData['daily']['history'][number]>();
  for (const e of [...base.daily.history, ...incoming.daily.history]) {
    const prev = byDate.get(e.date);
    if (!prev || e.stars > prev.stars || (e.stars === prev.stars && e.moves < prev.moves)) {
      byDate.set(e.date, e);
    }
  }
  const history = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAILY_HISTORY_LIMIT);
  const a = base.daily;
  const b = incoming.daily;
  const la = a.lastPlayed ?? '';
  const lb = b.lastPlayed ?? '';
  // Der Stand mit dem juengeren letzten Spieltag gilt; bei Gleichstand die laengere Serie.
  const newer = lb > la ? b : la > lb ? a : b.streak > a.streak ? b : a;
  return {
    version: SAVE_VERSION,
    levels,
    daily: {
      lastPlayed: newer.lastPlayed,
      streak: newer.streak,
      history,
    },
    endless: {
      best: Math.max(base.endless.best, incoming.endless.best),
      highestStage: Math.max(base.endless.highestStage, incoming.endless.highestStage),
    },
    hold: base.hold,
    highestStage: Math.max(base.highestStage, incoming.highestStage),
    similarCounter: Math.max(base.similarCounter, incoming.similarCounter),
    settings: base.settings,
  };
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Lokales Datum als YYYY-MM-DD (kein UTC). */
export function localDateKey(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Kalendertag davor (lokal, DST-sicher ueber das Datumsobjekt). */
export function previousDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return localDateKey(new Date(y, m - 1, d - 1));
}

export class Progress {
  private data: SaveData;
  private persistent: boolean;
  private readonly listeners = new Set<() => void>();

  /** `getStorage` darf werfen (privater Tab, gesperrte Cookies); dann laeuft alles im Arbeitsspeicher. */
  constructor(private readonly getStorage: () => StorageLike | null | undefined) {
    this.persistent = true;
    this.data = this.load();
  }

  private storage(): StorageLike | null {
    try {
      return this.getStorage() ?? null;
    } catch {
      return null;
    }
  }

  private load(): SaveData {
    const store = this.storage();
    if (!store) {
      this.persistent = false;
      return emptySave();
    }
    try {
      const text = store.getItem(SAVE_KEY);
      if (text === null) {
        // Schreibprobe, damit ein gesperrter Speicher gleich beim Start erkannt wird.
        store.setItem(SAVE_KEY, JSON.stringify(emptySave()));
        return emptySave();
      }
      return migrate(JSON.parse(text));
    } catch (err) {
      // Kaputtes JSON (SyntaxError) ist lesbar, aber unbrauchbar; Speicherfehler machen den Speicher unbenutzbar.
      if (err instanceof SyntaxError) return emptySave();
      this.persistent = false;
      return emptySave();
    }
  }

  get(): Readonly<SaveData> {
    return this.data;
  }

  /** false, wenn der Speicher nicht verfuegbar ist (Fortschritt gilt nur fuer diese Sitzung). */
  isPersistent(): boolean {
    return this.persistent;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Aendert den Stand ueber eine Kopie und speichert ihn. */
  update(mutate: (draft: SaveData) => void): void {
    const draft = structuredClone(this.data);
    mutate(draft);
    this.data = clean(draft);
    this.persist();
    for (const cb of [...this.listeners]) cb();
  }

  private persist(): void {
    const store = this.storage();
    if (!store) {
      this.persistent = false;
      return;
    }
    try {
      store.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      this.persistent = false;
    }
  }

  // --- Kampagne ---

  /** Ergebnis eines Kampagnen-Levels: nur Verbesserungen werden uebernommen. */
  recordLevel(key: string, result: { stars: number; moves: number; stage: number }): void {
    this.update((d) => {
      const cur = d.levels[key] ?? { stars: 0, bestMoves: 0, completed: false };
      d.levels[key] = {
        completed: true,
        stars: Math.max(cur.stars, Math.min(MAX_STARS, Math.max(1, result.stars))),
        bestMoves: cur.bestMoves > 0 ? Math.min(cur.bestMoves, result.moves) : result.moves,
      };
      d.highestStage = Math.max(d.highestStage, clampStage(result.stage));
    });
  }

  // --- Tageslevel ---

  /** Tageslevel geschafft: Serie fortschreiben (aufeinanderfolgende lokale Tage). */
  recordDaily(today: string, result: { stars: number; moves: number }): void {
    this.update((d) => {
      if (d.daily.lastPlayed !== today) {
        d.daily.streak = d.daily.lastPlayed === previousDateKey(today) ? d.daily.streak + 1 : 1;
        d.daily.lastPlayed = today;
      }
      const prev = d.daily.history.find((e) => e.date === today);
      if (!prev) {
        d.daily.history.push({ date: today, stars: result.stars, moves: result.moves });
      } else if (result.stars > prev.stars) {
        prev.stars = result.stars;
        prev.moves = result.moves;
      }
    });
  }

  // --- Endlos ---

  recordEndless(score: number, stage: number): void {
    this.update((d) => {
      d.endless.best = Math.max(d.endless.best, score);
      d.endless.highestStage = Math.max(d.endless.highestStage, clampStage(stage));
    });
  }

  // --- Einstellungen ---

  setHold(enabled: boolean, stage?: number): void {
    this.update((d) => {
      d.hold.enabled = enabled;
      if (stage !== undefined) d.hold.stage = clampStage(stage);
      else if (enabled && d.hold.stage < 1) d.hold.stage = clampStage(d.highestStage || 1);
    });
  }

  setLanguage(language: LanguageSetting): void {
    this.update((d) => {
      d.settings.language = language;
    });
  }

  setMotion(motion: MotionSetting): void {
    this.update((d) => {
      d.settings.motion = motion;
    });
  }

  /** Zaehler fuer den Seed von "Aehnliches Level"; gibt den neuen Wert zurueck. */
  nextSimilarCounter(): number {
    this.update((d) => {
      d.similarCounter += 1;
    });
    return this.data.similarCounter;
  }

  /** Spielstand zusammenfuehren (Import). */
  merge(incoming: SaveData): void {
    this.update((d) => {
      Object.assign(d, mergeSaves(d, incoming));
    });
  }

  /** Alles loeschen, Einstellungen (Sprache/Bewegung) bleiben. */
  reset(): void {
    this.update((d) => {
      Object.assign(d, { ...emptySave(), settings: d.settings });
    });
  }

  // --- Abfragen ---

  completedCount(): number {
    return Object.values(this.data.levels).filter((l) => l.completed).length;
  }

  /** Hoechste erreichte Stufe (mindestens 1). */
  reachedStage(): number {
    return clampStage(Math.max(this.data.highestStage, this.data.endless.highestStage, 1));
  }

  currentStreak(today: string): number {
    const { lastPlayed, streak } = this.data.daily;
    if (lastPlayed === today || lastPlayed === previousDateKey(today)) return streak;
    return 0;
  }

  dailyDone(today: string): boolean {
    return this.data.daily.lastPlayed === today;
  }
}

/**
 * Freischaltregel: Level 1 ist immer offen; ein Level ist offen, wenn es selbst oder sein Vorgaenger
 * geschafft ist. `order` ist die Reihenfolge der Level-Schluessel.
 */
export function unlockedFlags(order: readonly string[], levels: SaveData['levels']): boolean[] {
  return order.map((key, i) => {
    if (i === 0) return true;
    const prev = order[i - 1];
    return Boolean(levels[key]?.completed) || Boolean(prev && levels[prev]?.completed);
  });
}

/** Summe der Sterne ueber die angegebenen Level. */
export function totalStars(order: readonly string[], levels: SaveData['levels']): number {
  return order.reduce((sum, key) => sum + (levels[key]?.stars ?? 0), 0);
}
