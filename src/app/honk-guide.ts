// Proaktiver Hupen-Hinweis: fragt im Hintergrund den Solver, ob das Level die Hupe braucht und ob jetzt der
// Moment dafuer ist. Zaehlt nicht als Tipp (kein Sterndeckel, kein Tipp-Verbrauch).
import type { GameState } from '../engine/types';
import type { ResolvedRules } from '../schema';
import type { HintMove } from '../solver/types';
import type { SolverPort } from './solver-port';

/** So lange wartet die App auf den Solver, bevor sie auf den Sackgassen-Hinweis zurueckfaellt. */
export const GUIDE_TIMEOUT_MS = 4000;

export type HonkAdvice =
  /** Jetzt hupen: Hupen-Knopf pulsieren lassen; `move` ist der Solver-Vorschlag. */
  { kind: 'honk'; move: HintMove } | { kind: 'none' };

const NONE: HonkAdvice = { kind: 'none' };

/** Der Startzustand eines Levels: noch kein Zug, keine Hilfe benutzt. */
function isStartState(state: GameState): boolean {
  return state.moves === 0 && state.history.length === 0 && state.powerUpsUsed === 0;
}

export class HonkGuide {
  private levelId: string | null = null;
  /** null: unbekannt; true: das Level braucht die Hupe (schon der Startzustand braucht sie). */
  private required: boolean | null = null;
  private seq = 0;

  constructor(
    private readonly port: SolverPort,
    private readonly timeoutMs: number = GUIDE_TIMEOUT_MS,
  ) {}

  /** Meldet ein (neu) gestartetes Spiel; ein anderes Level vergisst die Pflicht-Erkennung. */
  begin(levelId: string): void {
    if (levelId !== this.levelId) this.required = null;
    this.levelId = levelId;
    this.seq += 1;
  }

  /** Pflicht-Hupe-Level (erst nach der Auswertung des Startzustands bekannt). */
  isRequired(): boolean {
    return this.required === true;
  }

  /**
   * Fragt den Solver zum aktuellen Zustand. Liefert nur dann `honk`, wenn das Level die Hupe braucht,
   * eine Hupe uebrig ist und der Zustand noch zu keinem Sieg ohne Hupe fuehrt. Veraltete Antworten,
   * Fehler und Zeitueberschreitungen ergeben `none`.
   */
  async check(getState: () => GameState, rules: ResolvedRules): Promise<HonkAdvice> {
    const state = getState();
    if (
      !rules.powerups.honk.enabled ||
      state.status !== 'playing' ||
      state.powerUps.honk <= 0 ||
      this.required === false
    ) {
      return NONE;
    }
    const seq = ++this.seq;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), this.timeoutMs);
      });
      const move = await Promise.race([this.port.hint(state, rules), timeout]);
      if (move === 'timeout' || seq !== this.seq) return NONE;
      const now = getState();
      const stale =
        now.levelId !== state.levelId ||
        now.moves !== state.moves ||
        now.history.length !== state.history.length ||
        now.powerUpsUsed !== state.powerUpsUsed ||
        now.status !== state.status;
      if (stale) return NONE;
      if (isStartState(state)) this.required = move?.needsHonk === true;
      if (this.required !== true || move === null || move.needsHonk !== true) return NONE;
      return { kind: 'honk', move };
    } catch {
      return NONE;
    } finally {
      clearTimeout(timer);
    }
  }
}
