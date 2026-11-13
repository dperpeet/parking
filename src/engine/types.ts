// Engine-Vertrag (siehe docs/INTERFACES.md).
import type { ColorId, Dir, Level, ResolvedRules } from '../schema';

export type VehicleStatus = 'parked' | 'queued' | 'departed';

export interface VehicleState {
  id: string;
  type: string;
  length: number;
  capacity: number;
  color: ColorId;
  /** Kopfzelle und Blickrichtung. Die Blickrichtung ist bei "straight" fest; die Kopfzelle aendert nur die Hupe. */
  x: number;
  y: number;
  dir: Dir;
  status: VehicleStatus;
  locked: boolean;
  keyId: string | null;
  /**
   * Mystery-Fahrzeug, dessen Farbe noch verdeckt ist (nur Darstellung; `color` bleibt gesetzt, die Mechanik
   * ignoriert das Feld). Wird aufgedeckt, sobald es `parked` ist und sein Weg zum Rand frei ist; nie wieder verdeckt.
   */
  hidden: boolean;
}

export type SlotState =
  | { kind: 'empty' }
  | { kind: 'locked' }
  | { kind: 'vehicle'; vehicleId: string; color: ColorId; capacity: number; filled: number };

export type GameStatus = 'playing' | 'won' | 'lost';
export type LoseReason = 'queueFull' | 'noMoves' | 'movesLimit' | 'timeUp';
export type PowerUpId = 'undo' | 'shuffle' | 'extraSlot' | 'honk';

/** Was Undo wiederherstellt (ohne Power-Up-Zaehler und Verlauf). */
export interface Snapshot {
  vehicles: VehicleState[];
  slots: SlotState[];
  passengers: ColorId[];
  passengerIndex: number;
  moves: number;
  rng: number;
  /** Snapshot vor einer Hupe: Undo gibt die Hupe zurueck (Zaehler + 1, powerUpsUsed - 1). */
  honk?: true;
}

export interface GameState {
  v: 1;
  levelId: string;
  grid: Level['grid'];
  /** Reihenfolge wie im Level. */
  vehicles: VehicleState[];
  slots: SlotState[];
  /** Fahrgast-Reihenfolge (kann durch Shuffle umsortiert werden). */
  passengers: ColorId[];
  /** Index des vordersten wartenden Fahrgasts. */
  passengerIndex: number;
  moves: number;
  /** Verbleibende Nutzungen pro Power-Up. */
  powerUps: Record<PowerUpId, number>;
  powerUpsUsed: number;
  history: Snapshot[];
  /** Zustand des seedbaren PRNG (mulberry32). */
  rng: number;
  status: GameStatus;
  loseReason: LoseReason | null;
  /** 1-3 bei Sieg, sonst 0. */
  stars: number;
}

export type Action =
  | { type: 'tapVehicle'; vehicleId: string }
  /**
   * Power-Up nutzen. `vehicleId` braucht nur `honk`: das hupende Fahrzeug, dessen erster Blocker ausweicht
   * (siehe docs/INTERFACES.md, Spielregeln 6). Bei anderen Power-Ups wird es ignoriert.
   */
  | { type: 'usePowerUp'; powerUp: PowerUpId; vehicleId?: string }
  /** Von der App gesendet, wenn limits.timeSec abgelaufen ist (die Engine kennt keine Uhr). */
  | { type: 'timeUp' };

export type GameEvent =
  | {
      type: 'vehicleBlocked';
      vehicleId: string;
      reason: 'path' | 'queueFull' | 'locked';
      blockerId: string | null;
    }
  /**
   * `path`: Zellen vor der Kopfzelle bis zur letzten Zelle im Raster (bei `movement.model = turns` ein
   * zusammenhaengender Linienzug mit Knicken). `exitDir`: Richtung beim Verlassen des Rasters, nur gesetzt,
   * wenn sie von `dir` des Fahrzeugs abweicht (Abbiegepfeile, siehe docs/adr/0002-einbahn-und-abbiegen.md).
   */
  | {
      type: 'vehicleExited';
      vehicleId: string;
      slotIndex: number;
      path: Array<[number, number]>;
      exitDir?: Dir;
    }
  | { type: 'vehicleUnlocked'; vehicleId: string }
  /** Mystery-Fahrzeug aufgedeckt (Weg frei); `color` = nun sichtbare Farbe. */
  | { type: 'vehicleRevealed'; vehicleId: string; color: ColorId }
  /** Hupe: `vehicleId` (Blocker) rutscht entlang seiner Achse von Kopfzelle `from` nach `to`; gehupt hat `byVehicleId`. */
  | {
      type: 'vehicleYielded';
      vehicleId: string;
      byVehicleId: string;
      from: [number, number];
      to: [number, number];
    }
  | {
      type: 'passengerBoarded';
      passengerIndex: number;
      color: ColorId;
      vehicleId: string;
      slotIndex: number;
      filled: number;
    }
  | { type: 'vehicleDeparted'; vehicleId: string; slotIndex: number }
  /** Nur bei fillPolicy "fifo": Fahrzeug rueckt von einem Slot in einen anderen. */
  | { type: 'slotShifted'; vehicleId: string; from: number; to: number }
  | { type: 'powerUpUsed'; powerUp: PowerUpId; remaining: number }
  | { type: 'stateRestored' }
  | { type: 'passengersShuffled'; from: number; to: number }
  | { type: 'slotAdded'; slotIndex: number }
  | { type: 'won'; moves: number; stars: number }
  | { type: 'lost'; reason: LoseReason }
  /** `vehicleId`: betroffenes Fahrzeug, wenn die Aktion eins nennt (z. B. hupendes Fahrzeug). */
  | { type: 'invalidAction'; reason: string; vehicleId?: string };

export interface StepResult {
  state: GameState;
  /** Geordnet; der Renderer spielt sie nacheinander ab. */
  events: GameEvent[];
}

export interface LevelIssue {
  code:
    | 'unknownVehicleType'
    | 'unknownColor'
    | 'outOfBounds'
    | 'overlap'
    | 'duplicateId'
    | 'passengerMismatch'
    | 'unknownKey'
    | 'keyCycle'
    | 'mysteryDisabled'
    /** `oneWay`-Zelle, aber Regeln ohne `special.oneWay` oder mit `movement.model` != `turns`. */
    | 'oneWayDisabled'
    /** `oneWay`-Zelle ohne `dir`, oder ein Weg ueber Pfeilzellen bildet eine Schleife. */
    | 'oneWayInvalid'
    | 'unsupportedRule';
  message: string;
  vehicleId?: string;
}

export class LevelError extends Error {
  constructor(public readonly issues: LevelIssue[]) {
    super(issues.map((i) => i.message).join('; '));
    this.name = 'LevelError';
  }
}

/**
 * Oeffentliche Engine-API (implementiert in src/engine, exportiert aus src/engine/index.ts):
 *
 * createGame(level: Level, rules: ResolvedRules, seed?: number): GameState
 *   - wirft LevelError, wenn validateLevel Issues liefert.
 * step(state: GameState, action: Action, rules: ResolvedRules): StepResult
 *   - rein, deterministisch, mutiert `state` nicht.
 * validateLevel(level: Level, rules: ResolvedRules): LevelIssue[]
 * legalMoves(state: GameState, rules: ResolvedRules): string[]   // antippbare Fahrzeug-IDs, die ausfahren koennen
 * hashState(state: GameState): string                             // kanonisch, ohne history/powerUps/rng/hidden
 * createRng(seed: number): number; nextRandom(rng: number): [value: number, next: number]
 */
export type CreateGame = (level: Level, rules: ResolvedRules, seed?: number) => GameState;
export type Step = (state: GameState, action: Action, rules: ResolvedRules) => StepResult;
