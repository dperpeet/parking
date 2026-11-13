// Texte fuer das Spielfeld-HUD und Screenreader-Ansagen. Woerter kommen aus src/i18n.
import type { Dir } from '../schema';
import type { GameEvent, GameState, LoseReason, PowerUpId } from '../engine/types';
import { getLanguage, t, tn } from '../i18n';
import type { StringKey } from '../i18n';
import type { LockMark } from '../render/lock-marks';
import { PALETTE } from '../render/theme';

const POWER_UP_KEYS: Record<PowerUpId, StringKey> = {
  undo: 'puUndo',
  shuffle: 'puShuffle',
  extraSlot: 'puExtraSlot',
  honk: 'puHonk',
};

const LOSE_KEYS: Record<LoseReason, StringKey> = {
  queueFull: 'loseQueueFull',
  noMoves: 'loseNoMoves',
  movesLimit: 'loseMovesLimit',
  timeUp: 'loseTimeUp',
};

const DIR_KEYS: Record<Dir, StringKey> = { N: 'dirN', S: 'dirS', E: 'dirE', W: 'dirW' };

export const powerUpLabel = (id: PowerUpId): string => t(POWER_UP_KEYS[id]);
export const loseTitle = (reason: LoseReason): string => t(LOSE_KEYS[reason]);

export function colorName(colorId: string): string {
  const c = PALETTE[colorId];
  if (!c) return colorId;
  return getLanguage() === 'de' ? c.nameDe : c.nameEn;
}

/** Deklination (de): "Blau" -> "Blaues"/"Blauer"; "Lila" bleibt, "Orange" -> "Oranges"/"Oranger". */
export function colorAdjective(colorId: string, suffix: 'es' | 'er'): string {
  const n = PALETTE[colorId]?.nameDe ?? colorId;
  if (n.endsWith('a')) return n;
  if (n.endsWith('e')) return n + suffix.slice(1);
  return n + suffix;
}

/** Bestimmter Artikel + Adjektiv, kleingeschrieben (de): "das blaue Fahrzeug". Lila und Orange bleiben. */
export function colorDefinite(colorId: string): string {
  if (getLanguage() !== 'de') return colorName(colorId).toLowerCase();
  const n = (PALETTE[colorId]?.nameDe ?? colorId).toLowerCase();
  return n.endsWith('a') || n.endsWith('e') ? n : `${n}e`;
}

/** Wie colorDefinite, aber Dativ (de): "mit dem blauen Fahrzeug". Lila bleibt, Orange -> "orangen". */
export function colorDative(colorId: string): string {
  if (getLanguage() !== 'de') return colorName(colorId).toLowerCase();
  const n = (PALETTE[colorId]?.nameDe ?? colorId).toLowerCase();
  if (n.endsWith('a')) return n;
  return n.endsWith('e') ? `${n}n` : `${n}en`;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Was Texte ueber ein Fahrzeug wissen: die Farbe und ob sie verdeckt ist (Mystery-Fahrzeug). */
export interface ShownVehicle {
  color: string;
  hidden?: boolean;
}

/** Farbe, die ein Text nennen darf; null bei verdeckter Farbe (nie die echte Farbe verraten). */
const shownColor = (v: ShownVehicle): string | null => (v.hidden === true ? null : v.color);

function vehicleNoun(colorId: string | null): string {
  if (colorId === null) return t('vehicleUnknown');
  if (getLanguage() === 'de') return `${colorAdjective(colorId, 'es')} ${t('annVehicleGeneric')}`;
  return `${capitalize(colorName(colorId))} ${t('annVehicleGeneric').toLowerCase()}`;
}

function passengerNoun(colorId: string): string {
  if (getLanguage() === 'de') return `${colorAdjective(colorId, 'er')} Fahrgast`;
  return `${capitalize(colorName(colorId))} passenger`;
}

/** Schloss-/Schluesselmarke eines Fahrzeugs und Anzahl der Schluessel im Level (Nummern nur bei mehreren). */
export interface VehicleLockInfo {
  mark: LockMark;
  count: number;
}

export function vehicleLabel(
  v: ShownVehicle & { x: number; y: number; dir: Dir },
  lock?: VehicleLockInfo,
): string {
  const base = t('vehicleLabel', {
    vehicle: vehicleNoun(shownColor(v)),
    row: v.y + 1,
    col: v.x + 1,
    dir: t(DIR_KEYS[v.dir]),
  });
  if (!lock) return base;
  const numbered = lock.count > 1;
  const parts = [base];
  if (lock.mark.lock !== null) {
    parts.push(numbered ? t('vehicleLockedN', { n: lock.mark.lock }) : t('vehicleLocked'));
  }
  if (lock.mark.key !== null) {
    parts.push(numbered ? t('vehicleKeyN', { n: lock.mark.key }) : t('vehicleKey'));
  }
  return parts.join(', ');
}

/**
 * Ansage fuer den Tipp; bei `honk` soll mit dem Fahrzeug gehupt statt es angetippt werden.
 * Ein verdecktes (oder unbekanntes) Fahrzeug heisst "das unbekannte Fahrzeug".
 */
export function hintAnnouncement(
  vehicle: ShownVehicle | undefined,
  action: 'tap' | 'honk' = 'tap',
): string {
  const color = vehicle ? shownColor(vehicle) : null;
  if (action === 'honk') {
    return t('hintHonk', { color: color === null ? t('colorUnknownDative') : colorDative(color) });
  }
  return t('hintVehicle', {
    color: color === null ? t('colorUnknownDefinite') : colorDefinite(color),
  });
}

const HONK_ERROR_KEYS: Record<string, StringKey> = {
  notBlocked: 'honkErrNotBlocked',
  blockedByBollard: 'honkErrBollard',
  blockerLocked: 'honkErrBlockerLocked',
  cannotYield: 'honkErrCannotYield',
  noTarget: 'honkErrNoTarget',
};

/** Verstaendliche Meldung zu einem abgelehnten Hupen (null: kein Hupen-Grund). */
export function honkErrorText(reason: string): string | null {
  const key = HONK_ERROR_KEYS[reason];
  return key ? t(key) : null;
}

/** Ansagetext fuer ein Event (oder null, wenn es nichts anzusagen gibt). */
export function announce(event: GameEvent, state: GameState): string | null {
  const veh = (id: string): string => {
    const v = state.vehicles.find((o) => o.id === id);
    return v ? vehicleNoun(shownColor(v)) : t('annVehicleGeneric');
  };
  switch (event.type) {
    case 'vehicleBlocked':
      if (event.reason === 'queueFull') return t('annBlockedQueue');
      if (event.reason === 'locked') {
        const keyId = state.vehicles.find((o) => o.id === event.vehicleId)?.keyId;
        return keyId
          ? t('annBlockedLockedKey', { vehicle: veh(event.vehicleId), key: veh(keyId) })
          : t('annBlockedLocked', { vehicle: veh(event.vehicleId) });
      }
      return t('annBlockedPath', { vehicle: veh(event.vehicleId) });
    case 'vehicleExited':
      return t('annExited', { vehicle: veh(event.vehicleId), n: event.slotIndex + 1 });
    case 'passengerBoarded':
      return t('annBoarded', { passenger: passengerNoun(event.color), n: event.slotIndex + 1 });
    case 'vehicleDeparted':
      return t('annDeparted', { vehicle: veh(event.vehicleId) });
    case 'vehicleUnlocked':
      return t('annUnlocked', { vehicle: veh(event.vehicleId) });
    case 'stateRestored':
      return t('annRestored');
    case 'passengersShuffled':
      return t('annShuffled');
    case 'slotAdded':
      return t('annSlotAdded');
    case 'won':
      return t('annWon', { stars: event.stars, moves: event.moves });
    case 'lost':
      return loseTitle(event.reason);
    case 'vehicleYielded': {
      const v = state.vehicles.find((o) => o.id === event.vehicleId);
      if (!v) return null;
      const color = shownColor(v);
      return t('annYielded', {
        color: color === null ? t('colorUnknownDefinite') : colorDefinite(color),
      });
    }
    case 'vehicleRevealed':
      return t('annRevealed', { vehicle: vehicleNoun(event.color) });
    case 'invalidAction':
      return honkErrorText(event.reason);
    case 'powerUpUsed':
    case 'slotShifted':
      return null;
  }
}

export const starsLabel = (n: number): string => tn('stars', n);
