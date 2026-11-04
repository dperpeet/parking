// Hinweis: bester naechster Tipp aus beliebigem Zustand.
import type { GameState } from '../engine';
import type { ResolvedRules } from '../schema';
import { HONK_PREFIX, Searcher } from './analyze';
import type { HintMove } from './types';

/** Bester gewinnender Tipp (Gewinnfolgen, dann Siegchance, dann Reihenfolge) aus einem laufenden Spiel. */
function bestTap(searcher: Searcher, state: GameState): string | null {
  if (state.status !== 'playing') return null;
  return bestAction(searcher, state);
}

/**
 * Aktion mit den meisten Gewinnfolgen unter den Kindern der Wurzel; Gleichstand: hoehere
 * Siegchance, dann Reihenfolge (Tipps stehen vor Hupen). null, wenn keine gewinnt.
 */
function bestAction(searcher: Searcher, state: GameState): string | null {
  const root = searcher.evaluate({ ...state, history: [] }, true);
  let bestId: string | null = null;
  let bestWins = 0n;
  let bestP = -1;
  for (const { id, node } of root.kids ?? []) {
    if (node.wins === 0n) continue;
    if (node.wins > bestWins || (node.wins === bestWins && node.p > bestP)) {
      bestId = id;
      bestWins = node.wins;
      bestP = node.p;
    }
  }
  return bestId;
}

/**
 * Legaler Tipp mit den meisten Gewinnfolgen; Gleichstand: hoehere Zufallsspiel-Siegchance,
 * dann Fahrzeugreihenfolge. null, wenn es keine gewinnende Fortsetzung gibt.
 */
export function hint(state: GameState, rules: ResolvedRules, maxStates?: number): string | null {
  return bestTap(new Searcher(rules, maxStates), state);
}

/**
 * Tipp fuer den Worker-Vertrag (`HintMove`): gewinnender Tipp ohne Hupe bevorzugt. Sonst, wenn eine
 * Hupe uebrig ist (auch nach einer Niederlage durch fehlende Zuege), Suche mit Hupe: der Tipp oder
 * die Hupe mit den meisten Gewinnfolgen (Gleichstand: Siegchance, dann Tipp vor Hupe). So kommt in
 * Leveln mit Pflicht-Hupe zuerst der Tipp, der die Hupe vorbereitet.
 */
export function hintMove(
  state: GameState,
  rules: ResolvedRules,
  maxStates?: number,
): HintMove | null {
  const tap = bestTap(new Searcher(rules, maxStates), state);
  if (tap !== null) return { action: 'tap', vehicleId: tap };
  if (state.powerUps.honk <= 0) return null;
  if (state.status !== 'playing' && !(state.status === 'lost' && state.loseReason === 'noMoves'))
    return null;
  const id = bestAction(new Searcher(rules, maxStates, true), state);
  if (id === null) return null;
  return id.startsWith(HONK_PREFIX)
    ? { action: 'honk', vehicleId: id.slice(HONK_PREFIX.length) }
    : { action: 'tap', vehicleId: id };
}
