// Promise-Wrapper um den Solver-Worker.
import type { GameState } from '../engine';
import type { Level, ResolvedRules } from '../schema';
import type {
  AnalyzeOptions,
  GenerateResult,
  GeneratorOptions,
  LevelAnalysis,
  SolveRequest,
  SolveResponse,
} from './types';

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;
type RequestBody = Distribute<SolveRequest>;
type Ok = Extract<SolveResponse, { ok: true }>;

interface Pending {
  request: SolveRequest;
  resolve: (r: Ok) => void;
  reject: (e: Error) => void;
}

export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

export interface SolverCall<T> {
  promise: Promise<T>;
  /** Bricht diese Anfrage ab. Der Worker wird beendet und neu gestartet (Berechnung ist synchron). */
  abort(): void;
}

export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<SolveResponse>) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res);
      else p.reject(new Error(res.error));
    };
    w.onerror = (e) => {
      const err = new Error(e.message || 'worker error');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private call<T>(body: RequestBody, pick: (r: Ok) => T): SolverCall<T> {
    const id = this.nextId++;
    const request = { ...body, id } as SolveRequest;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { request, resolve: (r) => resolve(pick(r)), reject });
      this.ensureWorker().postMessage(request);
    });
    return {
      promise,
      abort: () => {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        p.reject(new AbortError());
        // Worker neu starten und uebrige Anfragen erneut senden.
        this.worker?.terminate();
        this.worker = null;
        if (this.pending.size > 0) {
          const w = this.ensureWorker();
          for (const q of this.pending.values()) w.postMessage(q.request);
        }
      },
    };
  }

  analyze(level: Level, rules: ResolvedRules, opts?: AnalyzeOptions): SolverCall<LevelAnalysis> {
    return this.call({ kind: 'analyze', level, rules, opts }, (r) => r.result as LevelAnalysis);
  }

  hint(state: GameState, rules: ResolvedRules): SolverCall<string | null> {
    return this.call({ kind: 'hint', state, rules }, (r) => r.result as string | null);
  }

  generate(params: GeneratorOptions, rules: ResolvedRules): SolverCall<GenerateResult> {
    return this.call({ kind: 'generate', params, rules }, (r) => r.result as GenerateResult);
  }

  /** Beendet den Worker; offene Anfragen werden abgelehnt. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new AbortError());
    this.pending.clear();
  }
}
