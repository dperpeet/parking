// Solver-Typen (siehe docs/INTERFACES.md).
import type { GameState } from '../engine';
import type { Level, ResolvedRules } from '../schema';

export interface AnalyzeOptions {
  /** Obergrenze fuer verschiedene Zustaende (Default 2_000_000). */
  maxStates?: number;
  /**
   * Hupe (`usePowerUp` honk, je parked Fahrzeug) als zusaetzliche Aktion im Zustandsraum
   * (Zaehler `powerUps.honk` begrenzt). Default false: nur Tipps (pack-01/02 und Schwierigkeit
   * unveraendert). Mit true beziehen sich alle Zaehlungen, `solution` und `difficulty` auf
   * Tipps und Hupen; Hupen stehen in `solution` als `honk:<vehicleId>`.
   */
  allowHonk?: boolean;
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

/**
 * Zusaetzliche, optionale Parameter (additiv zu GeneratorParams, Defaults aendern nichts).
 * Hinweis: `visiblePassengers` wirkt nur auf die Darstellung; Solver und Schwierigkeit kennen
 * volle Information und ignorieren es.
 */
export interface GeneratorTuning {
  /** Halteplaetze; wird als overrides.queue.slots ins Level geschrieben und fuer Analyse/Fenster genutzt. */
  slots?: number;
  /** Sichtbare Fahrgaeste; wird als overrides.passengers.visible ins Level geschrieben. */
  visiblePassengers?: number;
  /**
   * Bevorzugt Kandidaten mit toten Zustaenden (Fehler zeigen sich spaeter): Kandidaten ohne tote
   * Zustaende bekommen SOFT_PENALTY auf die Zielabstands-Metrik und zaehlen nicht als Treffer.
   */
  preferDeadEnds?: boolean;
  /** Mindest-Tiefe (avgDeadEndDepth) fuer preferDeadEnds; Default 0 (nur deadStates > 0). */
  minDeadEndDepth?: number;
  /** Kandidaten mit hoeherer Zufallsspiel-Siegchance bekommen SOFT_PENALTY (Default: aus). */
  maxRandomPlayWin?: number;
  /**
   * Anzahl Poller (Zellen `fixed`), Zahl oder Bereich [min, max] (seed-deterministisch gewaehlt).
   * Default 0. Poller stehen nie auf einem Fahrzeug und nie auf dem Ausfahrweg eines Fahrzeugs;
   * mindestens einer begrenzt eine Platzierung (liegt in einer Zeile/Spalte mit einem Fahrzeug).
   */
  bollards?: number | [number, number];
  /**
   * Anzahl gesperrter Fahrzeuge (`locked` + `keyId`), Zahl oder Bereich. Default 0.
   * Der Schluessel faehrt in der konstruierten Loesung vor dem Schloss aus; das Schloss wuerde
   * ohne Sperre frueher tippbar sein (die Sperre aendert die Analyse). Ketten bleiben azyklisch.
   */
  keys?: number | [number, number];
  /** Maximale Laenge einer Schluesselkette (A sperrt B sperrt C ... ), Default 1. */
  keyChainDepth?: number;
  /**
   * Pflicht-Hupe (Default false): nur Kandidaten, die mit reinen Tipps unloesbar und mit Hupe
   * (`analyze` mit `allowHonk`, Zaehler aus den Regeln, mindestens 1) loesbar sind. Die
   * Schwierigkeit kommt dann aus der Analyse mit Hupe. Erfordert `powerups.honk` in den Regeln.
   */
  requireHonk?: boolean;
}

/** Generator-Eingabe inklusive Tuning. */
export type GeneratorOptions = GeneratorParams & GeneratorTuning;

export interface GenerateResult {
  level: Level;
  analysis: LevelAnalysis;
  attempts: number;
  /** true, wenn targetDifficulty getroffen wurde (oder keins vorgegeben war). */
  matched: boolean;
}

/** Tipp: Fahrzeug antippen oder mit diesem Fahrzeug hupen (Power-Up `honk`, siehe docs/INTERFACES.md). */
export interface HintMove {
  action: 'tap' | 'honk';
  vehicleId: string;
  /**
   * true: vom Zustand aus gewinnt kein reiner Tipp-Verlauf mehr, mit Hupe aber schon
   * (der Zug stammt aus der Suche mit Hupe). Fehlt bzw. false: es gibt einen Sieg ohne Hupe.
   */
  needsHonk?: boolean;
}

export type SolveRequest =
  | { id: number; kind: 'analyze'; level: Level; rules: ResolvedRules; opts?: AnalyzeOptions }
  | { id: number; kind: 'hint'; state: GameState; rules: ResolvedRules }
  | { id: number; kind: 'generate'; params: GeneratorOptions; rules: ResolvedRules };

export type SolveResponse =
  | { id: number; ok: true; kind: 'analyze'; result: LevelAnalysis }
  | { id: number; ok: true; kind: 'hint'; result: HintMove | null }
  | { id: number; ok: true; kind: 'generate'; result: GenerateResult }
  | { id: number; ok: false; error: string };
