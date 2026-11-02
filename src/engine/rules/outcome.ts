import type { ResolvedRules } from '../../schema';
import type { GameEvent, GameState, LoseReason } from '../types';
import { hasEmptySlot } from './slots';
import { tappableVehicles } from './tap';

/**
 * Sterne nach scoring. Die Engine kennt weder Par noch Uhr: "moves" wertet die Zuege,
 * "time" liefert den Wert 0 (die App bewertet Zeit selbst).
 */
export function computeStars(s: GameState, rules: ResolvedRules): number {
  let value = 0;
  if (rules.scoring.starMode === 'powerupsUsed') value = s.powerUpsUsed;
  else if (rules.scoring.starMode === 'moves') value = s.moves;
  const { three, two } = rules.scoring.stars;
  if (value <= three) return 3;
  if (value <= two) return 2;
  return 1;
}

export function loseGame(s: GameState, reason: LoseReason, events: GameEvent[]): void {
  s.status = 'lost';
  s.loseReason = reason;
  events.push({ type: 'lost', reason });
}

/** Sieg bzw. Niederlage pruefen (Prioritaet: queueFull > noMoves > movesLimit). */
export function evaluateOutcome(s: GameState, rules: ResolvedRules, events: GameEvent[]): void {
  if (s.status !== 'playing') return;
  if (s.passengerIndex >= s.passengers.length) {
    s.status = 'won';
    s.stars = computeStars(s, rules);
    events.push({ type: 'won', moves: s.moves, stars: s.stars });
    return;
  }
  // Nach dem Einsteigen passt der vorderste Fahrgast nirgends, wenn kein Slot frei ist.
  if (rules.queue.loseOnFull && !hasEmptySlot(s.slots)) {
    loseGame(s, 'queueFull', events);
  } else if (tappableVehicles(s).length === 0) {
    loseGame(s, 'noMoves', events);
  } else if (rules.limits.moves !== null && s.moves >= rules.limits.moves) {
    loseGame(s, 'movesLimit', events);
  }
}
