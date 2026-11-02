// Solver-Typen (gehoeren dem Solver-Paket).
import type { GameState } from '../engine';
import type { Level, ResolvedRules } from '../schema';

export interface AnalyzeOptions {
  /** Obergrenze fuer verschiedene Zustaende (Default 2_000_000). */
  maxStates?: number;
}

export interface FirstMoveInfo {
  vehicleId: string;
  /** Dezimaler BigInt-String. */
  winningPaths: string;
  totalPaths: string;
  /** Nach diesem Zug ist kein Sieg mehr moeglich. */
  deadEnd: boolean;
}

export interface LevelAnalysis {
  solvable: boolean;
  /** Zustandslimit erreicht: Zaehlungen sind untere Schranken bzw. unbekannt. */
  truncated: boolean;
  minMoves: number | null;
  /** Eine gewinnende Tipp-Reihenfolge (kuerzeste). */
  solution: string[] | null;
  /** Anzahl verschiedener Tipp-Folgen vom Start, die mit "won" enden (Dezimal-BigInt). */
  winningPaths: string;
  /** Anzahl verschiedener vollstaendiger Tipp-Folgen, die mit won oder lost enden. */
  totalPaths: string;
  /** winningPaths / totalPaths. */
  winRate: number;
  /** Siegchance, wenn in jedem Schritt ein gleichverteilt zufaelliger legaler Tipp gewaehlt wird. */
  randomPlayWinProbability: number;
  firstMoves: FirstMoveInfo[];
  statesExplored: number;
  /** Erreichbare, nicht terminale Zustaende, aus denen kein Sieg mehr moeglich ist. */
  deadStates: number;
  /**
   * Mittel ueber alle toten Zustaende der laengsten verbleibenden Tipp-Folge bis zur Niederlage:
   * wie spaet ein Fehler sichtbar wird. null ohne tote Zustaende.
   */
  avgDeadEndDepth: number | null;
  maxQueueUsedOnBestPath: number;
  /** 0-10, siehe computeDifficulty in analyze.ts. */
  difficulty: number;
}

export interface GeneratorParams {
  seed: number;
  width: number;
  height: number;
  vehicleCount: number;
  /** Teilmenge von rules.vehicles.colors. */
  colors: string[];
  /** Gewichte pro Fahrzeugtyp-Schluessel (Default: kleine Typen bevorzugt). */
  typeWeights?: Record<string, number>;
  /** Gewuenschter Schwierigkeitsbereich [min, max]. */
  targetDifficulty?: [number, number];
  maxAttempts?: number;
  /** Zustandslimit der Analyse pro Versuch (Default 20000); Level darueber werden verworfen. */
  maxStates?: number;
  /** Maximale Fahrgast-Verwuerfelung (Fenster ueber die naechsten Fahrzeuge, Default 3). */
  shuffleWindow?: number;
  /** Anteil bewusst blockierender Platzierungen 0-1 (Default 0.7). */
  blockiness?: number;
  /** Optionale Level-Felder. */
  id?: string;
  /** Ruleset-ID fuers Level (Default "classic"). */
  ruleset?: string;
  title?: Level['title'];
}

export interface GenerateResult {
  level: Level;
  analysis: LevelAnalysis;
  attempts: number;
  /** true, wenn targetDifficulty getroffen wurde (oder keins vorgegeben war). */
  matched: boolean;
}

export type SolveRequest =
  | { id: number; kind: 'analyze'; level: Level; rules: ResolvedRules; opts?: AnalyzeOptions }
  | { id: number; kind: 'hint'; state: GameState; rules: ResolvedRules }
  | { id: number; kind: 'generate'; params: GeneratorParams; rules: ResolvedRules };

export type SolveResponse =
  | { id: number; ok: true; kind: 'analyze'; result: LevelAnalysis }
  | { id: number; ok: true; kind: 'hint'; result: string | null }
  | { id: number; ok: true; kind: 'generate'; result: GenerateResult }
  | { id: number; ok: false; error: string };
