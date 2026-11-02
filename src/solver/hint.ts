// Hinweis: bester naechster Tipp aus beliebigem Zustand.
import type { GameState } from '../engine';
import type { ResolvedRules } from '../schema';
import { Searcher } from './analyze';

/**
 * Legaler Tipp mit den meisten Gewinnfolgen; Gleichstand: hoehere Zufallsspiel-Siegchance,
 * dann Fahrzeugreihenfolge. null, wenn es keine gewinnende Fortsetzung gibt.
 */
export function hint(state: GameState, rules: ResolvedRules, maxStates?: number): string | null {
  const searcher = new Searcher(rules, maxStates);
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
