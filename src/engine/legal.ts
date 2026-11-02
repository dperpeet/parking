import type { ResolvedRules } from '../schema';
import { tappableVehicles } from './rules/tap';
import type { GameState } from './types';

/** Antippbare Fahrzeug-IDs, die ausfahren koennen (leer, sobald das Spiel beendet ist). */
export function legalMoves(state: GameState, rules: ResolvedRules): string[] {
  void rules; // Die Regeln des Antippens stecken im Zustand; Signatur laut Vertrag.
  return tappableVehicles(state);
}
