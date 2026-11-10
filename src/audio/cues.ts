// Welcher Klang zu welchem Engine-Event gehoert. Reine Abbildung, ohne Web Audio.
import type { GameEvent } from '../engine/types';

export type CueId =
  | 'exit'
  | 'bump'
  | 'board'
  | 'depart'
  | 'honk'
  | 'unlock'
  | 'undo'
  | 'shuffle'
  | 'slot'
  | 'won'
  | 'lost';

export interface Cue {
  id: CueId;
  /** Tonhoehe in Halbtonschritten ueber dem Grundton (Einsteigen steigt mit jedem Fahrgast). */
  step: number;
}

const cue = (id: CueId, step = 0): Cue => ({ id, step });

/** Klang zu einem Event oder `null`, wenn das Event still bleibt. */
export function cueFor(event: GameEvent): Cue | null {
  switch (event.type) {
    case 'vehicleExited':
      return cue('exit');
    case 'vehicleBlocked':
    case 'invalidAction':
      return cue('bump');
    case 'passengerBoarded':
      return cue('board', event.filled);
    case 'vehicleDeparted':
      return cue('depart');
    case 'vehicleYielded':
      return cue('honk');
    case 'vehicleUnlocked':
      return cue('unlock');
    case 'stateRestored':
      return cue('undo');
    case 'passengersShuffled':
      return cue('shuffle');
    case 'slotAdded':
      return cue('slot');
    case 'won':
      return cue('won');
    case 'lost':
      return cue('lost');
    case 'slotShifted':
    case 'powerUpUsed':
      return null;
  }
}
