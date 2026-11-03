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

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function vehicleNoun(colorId: string): string {
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
  v: { color: string; x: number; y: number; dir: Dir },
  lock?: VehicleLockInfo,
): string {
  const base = t('vehicleLabel', {
    vehicle: vehicleNoun(v.color),
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

/** Ansage fuer den Tipp. */
export function hintAnnouncement(color: string): string {
  return t('hintVehicle', { color: colorDefinite(color) });
}

/** Ansagetext fuer ein Event (oder null, wenn es nichts anzusagen gibt). */
export function announce(event: GameEvent, state: GameState): string | null {
  const veh = (id: string): string => {
    const v = state.vehicles.find((o) => o.id === id);
    return v ? vehicleNoun(v.color) : t('annVehicleGeneric');
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
    case 'invalidAction':
    case 'powerUpUsed':
    case 'slotShifted':
      return null;
  }
}

export const starsLabel = (n: number): string => tn('stars', n);
