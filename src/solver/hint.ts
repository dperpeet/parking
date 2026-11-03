// Hinweis: bester naechster Tipp aus beliebigem Zustand.
import { step } from '../engine';
import type { GameState } from '../engine';
import type { ResolvedRules } from '../schema';
import { Searcher } from './analyze';
import type { HintMove } from './types';

/** Bester gewinnender Tipp (Gewinnfolgen, dann Siegchance, dann Reihenfolge) aus einem laufenden Spiel. */
function bestTap(searcher: Searcher, state: GameState): string | null {
  if (state.status !== 'playing') return null;
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
 * Hupe mit den meisten Gewinnfolgen (danach nur Tipps) unter allen erfolgreichen Hupen; Gleichstand:
 * hoehere Siegchance, dann Fahrzeugreihenfolge. Der Searcher (und sein Zustandsbudget) ist geteilt:
 * der Zustandsraum nach einer Hupe ueberlappt stark mit dem bisherigen.
 */
function bestHonk(searcher: Searcher, state: GameState, rules: ResolvedRules): string | null {
  let bestId: string | null = null;
  let bestWins = 0n;
  let bestP = -1;
  for (const v of state.vehicles) {
    if (v.status !== 'parked') continue;
    const { state: next, events } = step(
      state,
      { type: 'usePowerUp', powerUp: 'honk', vehicleId: v.id },
      rules,
    );
    if (events.some((e) => e.type === 'invalidAction')) continue;
    const node = searcher.evaluate({ ...next, history: [] });
    if (node.wins === 0n) continue;
    if (node.wins > bestWins || (node.wins === bestWins && node.p > bestP)) {
      bestId = v.id;
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
 * Tipp fuer den Worker-Vertrag (`HintMove`): gewinnender Tipp bevorzugt; gewinnt keiner und ist
 * eine Hupe uebrig, die beste Hupe (auch aus einer Niederlage durch fehlende Zuege).
 */
export function hintMove(
  state: GameState,
  rules: ResolvedRules,
  maxStates?: number,
): HintMove | null {
  const searcher = new Searcher(rules, maxStates);
  const tap = bestTap(searcher, state);
  if (tap !== null) return { action: 'tap', vehicleId: tap };
  if (state.powerUps.honk <= 0) return null;
  if (state.status !== 'playing' && !(state.status === 'lost' && state.loseReason === 'noMoves'))
    return null;
  const honk = bestHonk(searcher, state, rules);
  return honk === null ? null : { action: 'honk', vehicleId: honk };
}
