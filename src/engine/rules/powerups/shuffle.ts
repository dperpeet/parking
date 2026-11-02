import type { ResolvedRules } from '../../../schema';
import { takeSnapshot } from '../../draft';
import { nextRandom } from '../../rng';
import type { GameEvent, GameState } from '../../types';
import type { PowerUpOutcome } from './types';

/** Mischt das Fahrgastfenster [passengerIndex, passengerIndex + visible) per Fisher-Yates. */
export function applyShuffle(
  s: GameState,
  original: GameState,
  rules: ResolvedRules,
  events: GameEvent[],
): PowerUpOutcome {
  const from = s.passengerIndex;
  const to = Math.min(from + rules.passengers.visible, s.passengers.length);
  if (to - from < 2) return { ok: false, reason: 'nothingToShuffle' };

  s.history = [...s.history, takeSnapshot(original)];
  const passengers = [...s.passengers];
  let rng = s.rng;
  for (let i = to - 1; i > from; i--) {
    const [value, next] = nextRandom(rng);
    rng = next;
    const j = from + Math.floor(value * (i - from + 1));
    [passengers[i], passengers[j]] = [passengers[j]!, passengers[i]!];
  }
  s.passengers = passengers;
  s.rng = rng;
  events.push({ type: 'passengersShuffled', from, to });
  return { ok: true, settle: true };
}
