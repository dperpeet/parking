// Deutsche UI-Texte und Ansagen fuer Screenreader (i18n folgt spaeter).
import type { Dir } from '../schema';
import type { GameEvent, GameState, LoseReason, PowerUpId } from '../engine/types';
import { PALETTE } from '../render/theme';

export const de = {
  back: 'Zurück zum Menü (noch nicht verfügbar)',
  moves: 'Züge',
  movesAria: (n: number): string => `${n} Züge`,
  waiting: (n: number): string => `${n} warten`,
  nextPassengers: 'Nächste Fahrgäste',
  slotsTitle: (used: number, total: number): string => `Halteplätze ${used} / ${total} belegt`,
  slotEmpty: 'frei',
  slotLocked: 'gesperrt',
  board: 'Spielfeld',
  powerUps: 'Hilfen',
  powerUpLabel: {
    undo: 'Zurück',
    shuffle: 'Mischen',
    extraSlot: '+1 Platz',
    honk: 'Hupe',
  } satisfies Record<PowerUpId, string>,
  restart: 'Neustart',
  winTitle: 'Geschafft!',
  winSub: (moves: number): string => `In ${moves} Zügen`,
  next: 'Weiter',
  again: 'Nochmal',
  similar: 'Ähnliches Level',
  loseTitle: {
    queueFull: 'Kein Platz mehr',
    noMoves: 'Keine Züge mehr',
    movesLimit: 'Keine Züge übrig',
    timeUp: 'Zeit abgelaufen',
  } satisfies Record<LoseReason, string>,
  loseUndo: 'Zurück',
  stars: (n: number): string => `${n} von 3 Sternen`,
};

export function worldLabel(levelId: string): { world: string; level: string } {
  const m = /^w(\d+)-(\d+)/.exec(levelId);
  if (!m) return { world: 'ParKing', level: levelId };
  const worlds: Record<string, string> = { '1': 'Werkstatt' };
  const w = m[1] ?? '1';
  return {
    world: `Welt ${w} · ${worlds[w] ?? ''}`.replace(/ · $/, ''),
    level: `Level ${Number(m[2])}`,
  };
}

const DIR_DE: Record<Dir, string> = { N: 'oben', S: 'unten', E: 'rechts', W: 'links' };

export function colorName(colorId: string): string {
  return PALETTE[colorId]?.nameDe ?? colorId;
}

/** Deklination: "Blau" -> "Blaues"/"Blauer"; "Lila" bleibt, "Orange" -> "Oranges"/"Oranger". */
export function colorAdjective(colorId: string, suffix: 'es' | 'er'): string {
  const n = colorName(colorId);
  if (n.endsWith('a')) return n;
  if (n.endsWith('e')) return n + suffix.slice(1);
  return n + suffix;
}

export function vehicleLabel(v: { color: string; x: number; y: number; dir: Dir }): string {
  return `${colorAdjective(v.color, 'es')} Fahrzeug, Reihe ${v.y + 1}, Spalte ${v.x + 1}, fährt nach ${DIR_DE[v.dir]}`;
}

/** Ansagetext fuer ein Event (oder null, wenn es nichts anzusagen gibt). */
export function announce(event: GameEvent, state: GameState): string | null {
  const veh = (id: string): string => {
    const v = state.vehicles.find((o) => o.id === id);
    return v ? `${colorAdjective(v.color, 'es')} Fahrzeug` : 'Fahrzeug';
  };
  switch (event.type) {
    case 'vehicleBlocked':
      if (event.reason === 'queueFull') return 'Keine freie Halteposition';
      if (event.reason === 'locked') return `${veh(event.vehicleId)} ist gesperrt`;
      return `${veh(event.vehicleId)} ist blockiert`;
    case 'vehicleExited':
      return `${veh(event.vehicleId)} fährt zur Halteposition ${event.slotIndex + 1}`;
    case 'passengerBoarded':
      return `${colorAdjective(event.color, 'er')} Fahrgast steigt in Halteposition ${event.slotIndex + 1} ein`;
    case 'vehicleDeparted':
      return `${veh(event.vehicleId)} ist voll und fährt ab`;
    case 'vehicleUnlocked':
      return `${veh(event.vehicleId)} ist entsperrt`;
    case 'stateRestored':
      return 'Zug zurückgenommen';
    case 'passengersShuffled':
      return 'Fahrgäste gemischt';
    case 'slotAdded':
      return 'Zusätzlicher Halteplatz';
    case 'won':
      return `Geschafft! ${event.stars} von 3 Sternen in ${event.moves} Zügen`;
    case 'lost':
      return de.loseTitle[event.reason];
    case 'invalidAction':
    case 'powerUpUsed':
    case 'slotShifted':
      return null;
  }
}
