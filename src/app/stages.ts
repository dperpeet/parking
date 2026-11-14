// Schwierigkeitsstufen 1-6: einzige Stelle, an der Schwierigkeit (meta.difficulty, 0-10) auf Stufen,
// Generator-Zielbereiche, Level-Formen und Mechanik-Varianten abgebildet wird.
//
// Stufe = clamp(1..6, ceil((difficulty - 1) / 0.75)); Stufe 1 deckt also alles bis 1,75 ab, Stufe 2 bis 2,5,
// Stufe 3 bis 3,25, Stufe 4 bis 4,0, Stufe 5 bis 4,75 und Stufe 6 alles darueber.
// Die Grenzen sind kalibriert auf Pack 01 (Schwierigkeit 1,4 bis 5,5) und die Faehigkeiten des Generators.

import type { Level } from '../schema';
import type { GeneratorOptions } from '../solver/types';
import { hashString } from './seed';

export const STAGE_COUNT = 6;
export const MIN_STAGE = 1;

/** Obere Grenze (inklusive) der Stufen 1 bis 5; Stufe 6 hat keine. */
export const STAGE_UPPER_BOUNDS: readonly number[] = [1.75, 2.5, 3.25, 4.0, 4.75];
/** Untere Grenze der Stufe 1 und Obergrenze, bis zu der der Generator fuer Stufe 6 zielt. */
export const STAGE_FLOOR_DIFFICULTY = 1;
export const STAGE_CEILING_DIFFICULTY = 6.5;

/**
 * Versuche pro Generierung. Weniger als der Generator-Standard (40), damit die Wartezeit unter dem Zeitlimit bleibt;
 * der Generator liefert dann das Level mit der kleinsten Abweichung vom Zielbereich.
 */
export const GENERATE_MAX_ATTEMPTS = 16;

/** Halbe Breite des Zielbereichs fuer "Aehnliches Level" ohne Stufe halten (Skala 0-10). */
export const SIMILAR_DIFFICULTY_TOLERANCE = 0.5;

/** Anzahl: Zahl oder Bereich [min, max], seed-deterministisch vom Generator gewaehlt. */
type Count = number | [number, number];

/** Form generierter Level je Stufe (Raster, Fahrzeuge, Farben), kalibriert fuer < 2 s Generierzeit. */
export interface StageShape {
  width: number;
  height: number;
  vehicleCount: number;
  colorCount: number;
  /** Ruleset der generierten Level (aus der Variante, siehe `STAGE_VARIANT_RULES`). */
  ruleset: StageRuleset;
  /** Anzahl Poller, Zahl oder Bereich [min, max] (wie `GeneratorTuning.bollards`). */
  bollards: Count;
  /** Anzahl gesperrter Fahrzeuge, Zahl oder Bereich (wie `GeneratorTuning.keys`). */
  keys: Count;
}

export type StageRuleset = 'classic' | 'world2' | 'world3' | 'world4' | 'world5';

/**
 * Mechanik-Variante einer Stufe: `classic` und `world2` ohne neue Mechanik (Grundvariante), `honk` mit
 * Pflicht-Hupe (`world3`), `mystery` mit Mystery-Fahrzeugen (`world4`), `turns` mit Abbiegepfeilen (`world5`).
 */
export type StageVariantId = 'classic' | 'world2' | 'honk' | 'mystery' | 'turns';

/** Was eine Variante unabhaengig von der Stufe festlegt: Ruleset, Pflicht-Hupe und Versuchszahl. */
export interface StageVariantRules {
  ruleset: StageRuleset;
  requireHonk?: true;
  /** Versuche pro Generierung (Default `GENERATE_MAX_ATTEMPTS`). */
  maxAttempts?: number;
}

/**
 * Pflicht-Hupe verwirft die meisten Versuche schon bei der Konstruktion (jeder kostet unter 1 ms), daher
 * deutlich mehr Versuche; mit 16 fand der Generator in 15 von 20 Seeds kein Level.
 */
export const HONK_MAX_ATTEMPTS = 800;

export const STAGE_VARIANT_RULES: Readonly<Record<StageVariantId, StageVariantRules>> = {
  classic: { ruleset: 'classic' },
  world2: { ruleset: 'world2' },
  honk: { ruleset: 'world3', requireHonk: true, maxAttempts: HONK_MAX_ATTEMPTS },
  mystery: { ruleset: 'world4' },
  turns: { ruleset: 'world5' },
};

/** Eintrag der Stufentabelle: Variante, Gewicht und Form (das Ruleset kommt aus der Variante). */
export interface StageVariantEntry extends Omit<StageShape, 'ruleset'> {
  variant: StageVariantId;
  /** Relatives Gewicht der seed-deterministischen Auswahl innerhalb der Stufe. */
  weight: number;
  /** Mystery-Fahrzeuge (wie `GeneratorTuning.mystery`). */
  mystery?: Count;
  /** Abbiegepfeile (wie `GeneratorTuning.oneWay`). */
  oneWay?: Count;
  /** Hoechstzahl Knicke je Ausfahrweg (wie `GeneratorTuning.maxTurns`). */
  maxTurns?: number;
}

export type StageVariant = StageVariantEntry & StageVariantRules;

/** Maximale Schluesselkette fuer generierte Level (ein Schluessel sperrt hoechstens ein Fahrzeug). */
export const STAGE_KEY_CHAIN_DEPTH = 1;

/** Tabellenzeile: Variante, Gewicht, quadratisches Raster, Fahrzeuge, Farben, Poller, Schluessel, Extras. */
function row(
  variant: StageVariantId,
  weight: number,
  grid: number,
  vehicleCount: number,
  colorCount: number,
  bollards: Count,
  keys: Count,
  extra: Pick<StageVariantEntry, 'mystery' | 'oneWay' | 'maxTurns'> = {},
): StageVariantEntry {
  return {
    variant,
    weight,
    width: grid,
    height: grid,
    vehicleCount,
    colorCount,
    bollards,
    keys,
    ...extra,
  };
}

/**
 * Varianten je Stufe, die erste ist die Grundvariante (auch Rueckfall, wenn eine Variante kein Level findet).
 * Stufe 1-2 nur `classic`; ab Stufe 3 `world2` (Poller, ab Stufe 5 ein Schluessel) neben Pflicht-Hupe,
 * Mystery und Abbiegepfeilen. Stufe 3 gewichtet die Grundvariante doppelt, damit die neuen Mechaniken
 * dort seltener sind. Die Formen folgen den Kampagnen-Welten 3-5, bei gleichem Zielbereich der Stufe.
 * Gemessen mit 20 Seeds je Variante (Node, siehe docs/DESIGN.md): neue Varianten hoechstens 1,3 s,
 * Grundvariante Stufe 6 bis 2,1 s; kein Fehlschlag, Pflicht-Hupe nie mit Tipps allein loesbar. Mystery mit
 * 10 Fahrzeugen in Stufe 4 brauchte bis 2,0 s (daher 9); mehr als 10 Fahrzeuge sprengen das Zeitbudget.
 */
export const STAGE_VARIANTS: readonly (readonly StageVariantEntry[])[] = [
  [row('classic', 1, 5, 5, 2, 0, 0)],
  [row('classic', 1, 5, 6, 3, 0, 0)],
  [
    row('world2', 2, 6, 8, 3, [1, 2], 0),
    row('honk', 1, 5, 6, 3, 0, 0),
    row('mystery', 1, 6, 8, 3, [1, 2], 0, { mystery: 1 }),
    row('turns', 1, 6, 9, 3, 0, 0, { oneWay: 2, maxTurns: 1 }),
  ],
  [
    row('world2', 1, 6, 10, 4, 2, 0),
    row('honk', 1, 6, 8, 3, 1, 0),
    row('mystery', 1, 6, 9, 4, 2, 0, { mystery: 1 }),
    row('turns', 1, 6, 9, 4, 1, 0, { oneWay: [2, 3], maxTurns: 1 }),
  ],
  [
    row('world2', 1, 6, 10, 4, [1, 2], 1),
    row('honk', 1, 6, 8, 4, [1, 2], 0),
    row('mystery', 1, 6, 10, 4, [1, 2], 1, { mystery: [1, 2] }),
    row('turns', 1, 6, 10, 4, [1, 2], 1, { oneWay: 3, maxTurns: 2 }),
  ],
  [
    row('world2', 1, 6, 11, 5, [1, 2], 1),
    row('honk', 1, 6, 10, 5, [1, 2], 1),
    row('mystery', 1, 6, 10, 5, [1, 2], 1, { mystery: 2 }),
    row('turns', 1, 6, 10, 5, 2, 1, { oneWay: 4, maxTurns: 2 }),
  ],
];

/** Endlos ohne "Stufe halten": Die Stufe steigt alle N geloesten Level um 1 (bis zur Stufe 6). */
export const ENDLESS_LEVELS_PER_STAGE = 2;

/** Tageslevel: Stufe je Wochentag, Index = Date.getDay() (0 = Sonntag). Mo leicht, So schwer. */
export const DAILY_STAGE_BY_WEEKDAY: readonly number[] = [6, 1, 2, 3, 3, 4, 5];

export function clampStage(stage: number): number {
  return Math.min(STAGE_COUNT, Math.max(MIN_STAGE, Math.round(stage)));
}

/** Stufe zu einer Level-Schwierigkeit (fehlende Angabe zaehlt als Stufe 1). */
export function stageForDifficulty(difficulty: number | undefined): number {
  if (difficulty === undefined || !Number.isFinite(difficulty)) return MIN_STAGE;
  const idx = STAGE_UPPER_BOUNDS.findIndex((bound) => difficulty <= bound);
  return idx < 0 ? STAGE_COUNT : idx + 1;
}

/** Zielbereich [min, max] fuer den Generator in einer Stufe. */
export function difficultyRange(stage: number): [number, number] {
  const s = clampStage(stage);
  const lo = s === MIN_STAGE ? STAGE_FLOOR_DIFFICULTY : (STAGE_UPPER_BOUNDS[s - 2] ?? 0);
  const hi = STAGE_UPPER_BOUNDS[s - 1] ?? STAGE_CEILING_DIFFICULTY;
  return [lo, hi];
}

/** Alle Varianten einer Stufe (die erste ist die Grundvariante). */
export function stageVariants(stage: number): StageVariant[] {
  const entries = STAGE_VARIANTS[clampStage(stage) - 1];
  if (!entries?.length) throw new Error(`Keine Varianten fuer Stufe ${stage}`);
  return entries.map((e) => ({ ...e, ...STAGE_VARIANT_RULES[e.variant] }));
}

/** Grundvariante einer Stufe (ohne Hupe, Mystery und Pfeile). */
export function stageShape(stage: number): StageVariant {
  return stageVariants(stage)[0]!;
}

/**
 * Variante einer Stufe fuer einen Seed, gewichtet und deterministisch. Der Seed wird eigens gehasht,
 * damit die Wahl nicht mit dem Zufall des Generators zusammenhaengt.
 */
export function stageVariant(stage: number, seed: number): StageVariant {
  const variants = stageVariants(stage);
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  let x = hashString(`variant:${seed >>> 0}`) % total;
  for (const v of variants) {
    x -= v.weight;
    if (x < 0) return v;
  }
  return variants[0]!;
}

/** Endlos-Stufe fuer das k-te Level eines Runs (k ab 1) ohne "Stufe halten". */
export function endlessStage(levelNumber: number): number {
  return clampStage(
    MIN_STAGE + Math.floor((Math.max(1, levelNumber) - 1) / ENDLESS_LEVELS_PER_STAGE),
  );
}

/** Tageslevel-Stufe fuer ein lokales Datum. */
export function dailyStage(date: Date): number {
  return clampStage(DAILY_STAGE_BY_WEEKDAY[date.getDay()] ?? MIN_STAGE);
}

/** Generator-Parameter einer Stufen-Variante: Form, Zielbereich, Ruleset und Mechaniken. */
export function stageParams(
  stage: number,
  variant: StageVariant,
  palette: readonly string[],
  extra: { seed: number; id: string; title: Level['title'] },
): GeneratorOptions {
  return {
    ...extra,
    width: variant.width,
    height: variant.height,
    vehicleCount: variant.vehicleCount,
    colors: palette.slice(0, variant.colorCount),
    targetDifficulty: difficultyRange(stage),
    maxAttempts: variant.maxAttempts ?? GENERATE_MAX_ATTEMPTS,
    ruleset: variant.ruleset,
    bollards: variant.bollards,
    keys: variant.keys,
    ...(variant.keys ? { keyChainDepth: STAGE_KEY_CHAIN_DEPTH } : {}),
    ...(variant.requireHonk && { requireHonk: true }),
    ...(variant.mystery !== undefined && { mystery: variant.mystery }),
    ...(variant.oneWay !== undefined && { oneWay: variant.oneWay }),
    ...(variant.maxTurns !== undefined && { maxTurns: variant.maxTurns }),
  };
}
