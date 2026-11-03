// Teilbarer Ergebnistext fuers Tageslevel (reine Funktionen) und der Teilen-Weg (share/clipboard).
import { t, tn } from '../i18n';

/** Ab dieser Serie wird sie im Text genannt. */
const MIN_STREAK = 2;
/** Anzahl der Sterne im Ergebnis (gefuellt + leer). */
const STAR_COUNT = 3;
const STAR_FILLED = '★';
const STAR_EMPTY = '☆';
const SEPARATOR = ' · ';

export interface DailyShareData {
  /** Lokaler Datumsschluessel (YYYY-MM-DD). */
  date: string;
  stars: number;
  moves: number;
  streak: number;
}

export function starBar(stars: number): string {
  const n = Math.max(0, Math.min(STAR_COUNT, Math.round(stars)));
  return STAR_FILLED.repeat(n) + STAR_EMPTY.repeat(STAR_COUNT - n);
}

/** "ParKing 2026-11-03: ★★★ in 9 Zuegen · Serie 4" (+ optional URL in der zweiten Zeile). */
export function buildDailyShareText(data: DailyShareData, url?: string): string {
  let line = tn('shareDaily', data.moves, { date: data.date, stars: starBar(data.stars) });
  if (data.streak >= MIN_STREAK) line += SEPARATOR + t('shareStreak', { streak: data.streak });
  return url ? `${line}\n${url}` : line;
}

/** Seiten-URL ohne Hash und Query. */
export function pageUrl(loc: Pick<Location, 'origin' | 'pathname'>): string {
  return loc.origin + loc.pathname;
}

export type ShareOutcome = 'shared' | 'copied' | 'manual' | 'cancelled';

export interface ShareEnv {
  share?: (data: { text: string }) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

/** Aktuelle Browser-Faehigkeiten; Zugriffe koennen werfen, daher gekapselt. */
export function browserShareEnv(): ShareEnv {
  const env: ShareEnv = {};
  try {
    if (typeof navigator.share === 'function') {
      env.share = (d) => navigator.share(d);
    }
  } catch {
    // nicht verfuegbar
  }
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      env.writeText = (s) => navigator.clipboard.writeText(s);
    }
  } catch {
    // nicht verfuegbar
  }
  return env;
}

/** Teilen, sonst Zwischenablage, sonst 'manual'. Wirft nie; Abbruch des Share-Dialogs ist 'cancelled'. */
export async function shareText(text: string, env: ShareEnv): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share({ text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // anderer Fehler: weiter mit Zwischenablage
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(text);
      return 'copied';
    } catch {
      // weiter mit manuellem Weg
    }
  }
  return 'manual';
}
