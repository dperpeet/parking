import type { GameEvent, GameState } from '../../types';
import type { PowerUpOutcome } from './types';

export function applyUndo(s: GameState, events: GameEvent[]): PowerUpOutcome {
  const snapshot = s.history[s.history.length - 1];
  if (!snapshot) return { ok: false, reason: 'noHistory' };
  // Aufgedeckte Mystery-Fahrzeuge bleiben aufgedeckt (hidden = im Snapshot und jetzt verdeckt).
  s.vehicles = snapshot.vehicles.map((v, i) =>
    v.hidden && !s.vehicles[i]!.hidden ? { ...v, hidden: false } : v,
  );
  // Per Power-Up hinzugefuegte oder entsperrte Slots bleiben erhalten (Undo nimmt nur Zuege zurueck).
  const slots = snapshot.slots.map((sl, i) =>
    sl.kind === 'locked' && s.slots[i]?.kind !== 'locked' ? { kind: 'empty' as const } : sl,
  );
  while (slots.length < s.slots.length) slots.push({ kind: 'empty' });
  s.slots = slots;
  s.passengers = snapshot.passengers;
  s.passengerIndex = snapshot.passengerIndex;
  s.moves = snapshot.moves;
  s.rng = snapshot.rng;
  s.history = s.history.slice(0, -1);
  // Snapshot einer Hupe: Undo gibt sie zurueck (das Undo selbst zaehlt in step() als Power-Up).
  if (snapshot.honk) {
    s.powerUps.honk += 1;
    s.powerUpsUsed -= 1;
  }
  s.status = 'playing';
  s.loseReason = null;
  s.stars = 0;
  events.push({ type: 'stateRestored' });
  return { ok: true, settle: false };
}
