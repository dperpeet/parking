import type { GameEvent, GameState } from '../../types';
import type { PowerUpOutcome } from './types';

export function applyUndo(s: GameState, events: GameEvent[]): PowerUpOutcome {
  const snapshot = s.history[s.history.length - 1];
  if (!snapshot) return { ok: false, reason: 'noHistory' };
  s.vehicles = snapshot.vehicles;
  s.slots = snapshot.slots;
  s.passengers = snapshot.passengers;
  s.passengerIndex = snapshot.passengerIndex;
  s.moves = snapshot.moves;
  s.rng = snapshot.rng;
  s.history = s.history.slice(0, -1);
  s.status = 'playing';
  s.loseReason = null;
  s.stars = 0;
  events.push({ type: 'stateRestored' });
  return { ok: true, settle: false };
}
