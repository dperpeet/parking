// Pack-Konfiguration (tools/pack-XX.config.json) -> Generator-Parameter je Level.
// Gemeinsam fuer `pnpm level:generate` und die Content-Tests (Reproduzierbarkeit).
import { readFileSync } from 'node:fs';
import type { GeneratorOptions } from '../../src/solver/types';
import { resolveRules } from '../../src/schema';
import type { ResolvedRules, Ruleset } from '../../src/schema';
import { rulesetById } from './rulesets';

const PAD = 2;
const DEFAULT_TOLERANCE = 0.3;
const DEFAULT_MAX_STATES = 200_000;
const DEFAULT_MAX_ATTEMPTS = 120;
const DEFAULT_RULESET = 'classic';

/** Eintrag pro Level; fehlende Felder kommen aus `defaults`. */
export interface LevelConfig {
  /** Level unveraendert lassen (nur Zielkurve dokumentiert). */
  keep?: boolean;
  /** Basis-Seed des Generators; aendern, wenn kein Treffer gefunden wird. */
  seed: number;
  /** Kantenlaenge des quadratischen Rasters. */
  grid: number;
  vehicles: number;
  colors: number;
  /** Ziel-Schwierigkeit; Treffer, wenn |difficulty - target| <= tolerance. */
  target: number;
  tolerance?: number;
  slots?: number;
  /** Nur Darstellung (Solver kennt volle Information), siehe GeneratorTuning. */
  visible?: number;
  shuffleWindow?: number;
  blockiness?: number;
  typeWeights?: Record<string, number>;
  preferDeadEnds?: boolean;
  minDeadEndDepth?: number;
  maxRandomPlayWin?: number;
  maxAttempts?: number;
  /** Ruleset-ID (Datei unter src/content/rulesets), Default classic. */
  ruleset?: string;
  /** Poller: Zahl oder [min, max]. */
  bollards?: number | [number, number];
  /** Gesperrte Fahrzeuge: Zahl oder [min, max]. */
  keys?: number | [number, number];
  keyChainDepth?: number;
  /** Pflicht-Hupe: nur Level, die ohne Hupe unloesbar und mit Hupe loesbar sind. */
  requireHonk?: boolean;
  /** Mystery-Fahrzeuge: Zahl oder [min, max] (Ruleset mit special.mysteryVehicles). */
  mystery?: number | [number, number];
  /** Fairness-Filter: Mindest-Siegquote des blinden Spielers (Default 0.25). */
  mysteryMinBlindWin?: number;
  mysteryPlayouts?: number;
}

export interface PackConfig {
  pack: string;
  /** Weltnummer fuer das Level-ID-Praefix `w<world>-` und index.json (Default: Pack-Nummer). */
  world?: number;
  maxStates?: number;
  maxAttempts?: number;
  defaults: Partial<LevelConfig>;
  levels: LevelConfig[];
}

export function readPackConfig(path: string): PackConfig {
  return JSON.parse(readFileSync(path, 'utf8')) as PackConfig;
}

export interface LevelJob {
  /** Level-Eintrag mit eingemischten `defaults`. */
  config: LevelConfig;
  rules: ResolvedRules;
  params: GeneratorOptions;
}

/** Generator-Parameter fuer Level `n` (ab 1) eines Packs. */
export function levelJob(config: PackConfig, n: number, rulesets: Map<string, Ruleset>): LevelJob {
  const entry = config.levels[n - 1];
  if (!entry) throw new Error(`level ${n} not in config`);
  const c = { ...config.defaults, ...entry } as LevelConfig;
  const rules = resolveRules(rulesetById(rulesets, c.ruleset ?? DEFAULT_RULESET));
  const world = config.world ?? Number(config.pack);
  const tol = c.tolerance ?? DEFAULT_TOLERANCE;
  const params: GeneratorOptions = {
    seed: c.seed,
    width: c.grid,
    height: c.grid,
    vehicleCount: c.vehicles,
    colors: rules.vehicles.colors.slice(0, c.colors),
    targetDifficulty: [c.target - tol, c.target + tol],
    maxAttempts: c.maxAttempts ?? config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    maxStates: config.maxStates ?? DEFAULT_MAX_STATES,
    id: `w${world}-${String(n).padStart(PAD, '0')}`,
    ruleset: rules.id,
    title: { de: `Level ${n}`, en: `Level ${n}` },
    ...(c.slots !== undefined && { slots: c.slots }),
    ...(c.visible !== undefined && { visiblePassengers: c.visible }),
    ...(c.shuffleWindow !== undefined && { shuffleWindow: c.shuffleWindow }),
    ...(c.blockiness !== undefined && { blockiness: c.blockiness }),
    ...(c.typeWeights !== undefined && { typeWeights: c.typeWeights }),
    ...(c.preferDeadEnds !== undefined && { preferDeadEnds: c.preferDeadEnds }),
    ...(c.minDeadEndDepth !== undefined && { minDeadEndDepth: c.minDeadEndDepth }),
    ...(c.maxRandomPlayWin !== undefined && { maxRandomPlayWin: c.maxRandomPlayWin }),
    ...(c.bollards !== undefined && { bollards: c.bollards }),
    ...(c.keys !== undefined && { keys: c.keys }),
    ...(c.keyChainDepth !== undefined && { keyChainDepth: c.keyChainDepth }),
    ...(c.requireHonk !== undefined && { requireHonk: c.requireHonk }),
    ...(c.mystery !== undefined && { mystery: c.mystery }),
    ...(c.mysteryMinBlindWin !== undefined && { mysteryMinBlindWin: c.mysteryMinBlindWin }),
    ...(c.mysteryPlayouts !== undefined && { mysteryPlayouts: c.mysteryPlayouts }),
  };
  return { config: c, rules, params };
}
