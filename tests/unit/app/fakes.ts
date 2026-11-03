import { createGame, step } from '../../../src/engine';
import type { EngineApi } from '../../../src/app/engine-port';
import type { GenerateOptions, SolverPort } from '../../../src/app/solver-port';
import type { Level, ResolvedRules } from '../../../src/schema';
import { analyze } from '../../../src/solver';
import type {
  AnalyzeOptions,
  GeneratorParams,
  HintMove,
  LevelAnalysis,
} from '../../../src/solver/types';
import { level } from '../helpers';

export const realEngine: EngineApi = { createGame, step };

export type GenerateCall = { params: GeneratorParams; opts: GenerateOptions | undefined };

/** Solver-Port ohne Worker: Tipps und Generierung sind frei steuerbar. */
export class FakeSolver implements SolverPort {
  hintCalls = 0;
  hintResult: HintMove | null | Error = { action: 'tap', vehicleId: 'v1' };
  hintGate: Promise<void> | null = null;
  generateCalls: GenerateCall[] = [];
  /** Standard: liefert Level 007 unter einer eindeutigen Id. */
  generateImpl: (params: GeneratorParams) => Promise<Level> = (params) =>
    Promise.resolve({ ...level, id: params.id ?? 'gen-x', overrides: undefined });

  async hint(): Promise<HintMove | null> {
    this.hintCalls += 1;
    if (this.hintGate) await this.hintGate;
    if (this.hintResult instanceof Error) throw this.hintResult;
    return this.hintResult;
  }

  analyzeCalls = 0;
  /** Standard: echte Analyse im selben Thread. */
  async analyze(
    level: Level,
    rules: ResolvedRules,
    opts?: AnalyzeOptions & { signal?: AbortSignal },
  ): Promise<LevelAnalysis> {
    this.analyzeCalls += 1;
    return analyze(level, rules, opts);
  }

  async generate(
    params: GeneratorParams,
    _rules: ResolvedRules,
    opts?: GenerateOptions,
  ): Promise<{ level: Level; matched: boolean }> {
    this.generateCalls.push({ params, opts });
    return { level: await this.generateImpl(params), matched: true };
  }
}
