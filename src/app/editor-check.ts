// Live-Check im Editor: entprellt, bricht veraltete Auftraege ab und uebersetzt das Solver-Ergebnis in einen Status.
import type { Level, ResolvedRules } from '../schema';
import type { SolverPort } from './solver-port';

/** Wartezeit nach der letzten Aenderung, bevor der Solver startet. */
export const CHECK_DEBOUNCE_MS = 300;

export type CheckStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'solvable'; par: number | null; difficulty: number }
  | { kind: 'unsolvable' }
  | { kind: 'truncated' }
  | { kind: 'error' };

export interface LiveCheck {
  /** Plant eine Pruefung; ein laufender Auftrag wird abgebrochen. */
  schedule(level: Level, rules: ResolvedRules): void;
  /** Bricht alles ab und setzt den Status auf `idle`. */
  cancel(): void;
  dispose(): void;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export function createLiveCheck(
  solver: Pick<SolverPort, 'analyze'>,
  onStatus: (status: CheckStatus) => void,
  debounceMs: number = CHECK_DEBOUNCE_MS,
): LiveCheck {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let generation = 0;

  const stop = (): void => {
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };

  const run = async (
    level: Level,
    rules: ResolvedRules,
    gen: number,
    signal: AbortSignal,
  ): Promise<void> => {
    try {
      const res = await solver.analyze(level, rules, { signal });
      if (gen !== generation) return;
      if (res.solvable)
        onStatus({ kind: 'solvable', par: res.minMoves, difficulty: res.difficulty });
      else onStatus({ kind: res.truncated ? 'truncated' : 'unsolvable' });
    } catch (err) {
      if (gen !== generation || isAbort(err)) return;
      onStatus({ kind: 'error' });
    }
  };

  return {
    schedule(level, rules) {
      stop();
      const gen = generation;
      onStatus({ kind: 'checking' });
      timer = setTimeout(() => {
        timer = null;
        const ctl = new AbortController();
        controller = ctl;
        void run(level, rules, gen, ctl.signal);
      }, debounceMs);
    },
    cancel() {
      stop();
      onStatus({ kind: 'idle' });
    },
    dispose: stop,
  };
}
