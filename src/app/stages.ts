// Schwierigkeitsstufen 1-6: einzige Stelle, an der Schwierigkeit (meta.difficulty, 0-10) auf Stufen,
// Generator-Zielbereiche und Level-Formen abgebildet wird.
//
// Stufe = clamp(1..6, ceil((difficulty - 1) / 0.75)); Stufe 1 deckt also alles bis 1,75 ab, Stufe 2 bis 2,5,
// Stufe 3 bis 3,25, Stufe 4 bis 4,0, Stufe 5 bis 4,75 und Stufe 6 alles darueber.
// Die Grenzen sind kalibriert auf Pack 01 (Schwierigkeit 1,4 bis 5,5) und die Faehigkeiten des Generators.

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

/** Form generierter Level je Stufe (Raster, Fahrzeuge, Farben), kalibriert fuer < 2 s Generierzeit. */
export interface StageShape {
  width: number;
  height: number;
  vehicleCount: number;
  colorCount: number;
}

export const STAGE_SHAPES: readonly StageShape[] = [
  { width: 5, height: 5, vehicleCount: 5, colorCount: 2 },
  { width: 5, height: 5, vehicleCount: 6, colorCount: 3 },
  { width: 6, height: 6, vehicleCount: 8, colorCount: 3 },
  { width: 6, height: 6, vehicleCount: 10, colorCount: 4 },
  { width: 6, height: 6, vehicleCount: 12, colorCount: 4 },
  { width: 6, height: 6, vehicleCount: 14, colorCount: 5 },
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

export function stageShape(stage: number): StageShape {
  const shape = STAGE_SHAPES[clampStage(stage) - 1];
  if (!shape) throw new Error(`Keine Form fuer Stufe ${stage}`);
  return shape;
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
