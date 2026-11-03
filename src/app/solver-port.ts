// Schmale Schnittstelle zum Solver-Worker. Der Solver wird erst bei Bedarf geladen (eigener Chunk + Worker),
// damit er das initiale Bundle nicht vergroessert. Tests ersetzen den Port durch ein Fake.
import type { GameState } from '../engine/types';
import type { Level, ResolvedRules } from '../schema';
import type { AnalyzeOptions, GeneratorParams, LevelAnalysis } from '../solver/types';

/** Zeitlimit fuer die Level-Generierung; danach faellt die App auf eine Variante zurueck. */
export const GENERATE_TIMEOUT_MS = 10_000;

export class GenerateTimeoutError extends Error {
  constructor() {
    super('generate timeout');
    this.name = 'GenerateTimeoutError';
  }
}

export interface GenerateOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SolverPort {
  /** Id des empfohlenen Fahrzeugs oder null, wenn es keine gewinnende Fortsetzung gibt. */
  hint(state: GameState, rules: ResolvedRules): Promise<string | null>;
  /** Vollanalyse (Loesbarkeit, Par, Schwierigkeit). Bei `signal` wird der Worker-Auftrag abgebrochen (AbortError). */
  analyze(
    level: Level,
    rules: ResolvedRules,
    opts?: AnalyzeOptions & { signal?: AbortSignal },
  ): Promise<LevelAnalysis>;
  /** Erzeugt ein Level; lehnt nach `timeoutMs` mit GenerateTimeoutError ab, bei `signal` mit AbortError. */
  generate(
    params: GeneratorParams,
    rules: ResolvedRules,
    opts?: GenerateOptions,
  ): Promise<{ level: Level; matched: boolean }>;
}

/** Echter Port ueber den SolverClient (Web Worker), lazy per dynamischem Import. */
export function createSolverPort(): SolverPort {
  let client: Promise<InstanceType<typeof import('../solver/client').SolverClient>> | null = null;
  const getClient = (): NonNullable<typeof client> => {
    client ??= import('../solver/client').then((m) => new m.SolverClient());
    return client;
  };
  return {
    async hint(state, rules) {
      return (await getClient()).hint(state, rules).promise;
    },
    async analyze(level, rules, opts = {}) {
      const { signal, ...analyzeOpts } = opts;
      const call = (await getClient()).analyze(level, rules, analyzeOpts);
      const onAbort = (): void => call.abort();
      if (signal?.aborted) onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        return await call.promise;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
    async generate(params, rules, opts = {}) {
      const call = (await getClient()).generate(params, rules);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        call.abort();
      }, opts.timeoutMs ?? GENERATE_TIMEOUT_MS);
      const onAbort = (): void => call.abort();
      if (opts.signal?.aborted) onAbort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await call.promise;
        return { level: res.level, matched: res.matched };
      } catch (err) {
        if (timedOut) throw new GenerateTimeoutError();
        throw err;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
