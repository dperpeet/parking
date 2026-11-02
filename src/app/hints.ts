// Tipps: Hilfe der App (nicht Teil des Rulesets). Die Engine kennt keine Tipps; ihr powerUpsUsed zaehlt sie nicht.
import type { GameState } from '../engine/types';
import type { ResolvedRules } from '../schema';
import type { SolverPort } from './solver-port';

/** Tipps pro Level (UI-Hilfe, bewusst nicht im Ruleset). */
export const HINTS_PER_LEVEL = 3;
/** So lange bleibt der Tipp am Fahrzeug markiert. */
export const HINT_DISPLAY_MS = 2000;
/** Hoechstzahl Sterne, wenn im Level ein Tipp genutzt wurde (Tipp zaehlt wie ein Power-Up). */
export const HINT_STAR_CAP = 2;

/**
 * Angezeigte und gespeicherte Sterne: Die Engine bewertet Tipps nicht (powerUpsUsed kennt sie nicht).
 * Wurde ein Tipp genutzt, gilt deshalb min(Engine-Sterne, HINT_STAR_CAP).
 */
export function displayStars(engineStars: number, hintUsed: boolean): number {
  return hintUsed ? Math.min(engineStars, HINT_STAR_CAP) : engineStars;
}

export type HintResult =
  | { kind: 'vehicle'; vehicleId: string }
  | { kind: 'none' }
  | { kind: 'error' }
  /** Nicht moeglich (keine Tipps uebrig, laeuft schon, Spiel zu Ende) oder der Zustand hat sich geaendert. */
  | { kind: 'ignored' };

export class HintTracker {
  private levelId: string | null = null;
  private usedCount = 0;
  private working = false;

  constructor(
    private readonly port: SolverPort,
    private readonly perLevel: number = HINTS_PER_LEVEL,
  ) {}

  /**
   * Meldet ein (neu) gestartetes Spiel. Ein Neustart desselben Levels behaelt den Tipp-Stand
   * (sonst liessen sich Tipps farmen); `fresh` setzt ihn zurueck (neues Level, Wiederholung nach Sieg).
   */
  begin(levelId: string, fresh: boolean): void {
    if (fresh || levelId !== this.levelId) this.usedCount = 0;
    this.levelId = levelId;
  }

  left(): number {
    return Math.max(0, this.perLevel - this.usedCount);
  }

  used(): boolean {
    return this.usedCount > 0;
  }

  busy(): boolean {
    return this.working;
  }

  async request(getState: () => GameState, rules: ResolvedRules): Promise<HintResult> {
    const state = getState();
    if (this.working || this.left() <= 0 || state.status !== 'playing') return { kind: 'ignored' };
    this.working = true;
    try {
      const id = await this.port.hint(state, rules);
      const now = getState();
      const stale =
        now.levelId !== state.levelId ||
        now.moves !== state.moves ||
        now.history.length !== state.history.length ||
        now.status !== 'playing';
      if (stale) return { kind: 'ignored' };
      this.usedCount += 1;
      return id === null ? { kind: 'none' } : { kind: 'vehicle', vehicleId: id };
    } catch {
      return { kind: 'error' };
    } finally {
      this.working = false;
    }
  }
}
