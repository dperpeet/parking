import { z } from 'zod';
import { ColorId, LocalizedText, RulesetOverrides } from './ruleset';

/** Blickrichtung. Koordinaten: x nach rechts, y nach unten, Ursprung oben links. */
export const Dir = z.enum(['N', 'E', 'S', 'W']);
export type Dir = z.infer<typeof Dir>;

export const Cell = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  /** fixed: Hindernis. oneWay: Durchfahrt nur in dir. barrier: Schranke. gate: Ausfahrt (bei movement.exits = gates). */
  type: z.enum(['fixed', 'oneWay', 'barrier', 'gate']),
  dir: Dir.optional(),
});
export type Cell = z.infer<typeof Cell>;

export const LevelVehicle = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/),
  /** Zelle des Fahrzeugkopfs. Das Fahrzeug belegt `length` Zellen entgegen der Blickrichtung. */
  pos: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  dir: Dir,
  /** Schlüssel in rules.vehicles.types. */
  type: z.string(),
  color: ColorId,
  /** Gesperrt, bis das Fahrzeug `keyId` das Spielfeld verlassen hat. */
  locked: z.boolean().optional(),
  keyId: z.string().optional(),
  /**
   * Mystery-Fahrzeug: Farbe verdeckt, bis der Weg zum Rand frei ist (nur mit special.mysteryVehicles).
   * Reine Darstellung, die Mechanik bleibt unveraendert.
   */
  mystery: z.boolean().optional(),
});
export type LevelVehicle = z.infer<typeof LevelVehicle>;

export const Level = z.object({
  schema: z.literal('parking.level/1'),
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  title: LocalizedText,
  seed: z.number().int().min(0).optional(),
  /** ID des Rulesets. */
  ruleset: z.string(),
  overrides: RulesetOverrides.optional(),
  grid: z.object({
    width: z.number().int().min(3).max(12),
    height: z.number().int().min(3).max(12),
    cells: z.array(Cell).default([]),
  }),
  vehicles: z.array(LevelVehicle).min(1).max(60),
  /** Reihenfolge der Fahrgäste, vorderster zuerst. */
  passengers: z.array(ColorId).min(1).max(400),
  meta: z
    .object({
      author: z.string().optional(),
      par: z
        .object({ moves: z.number().int().optional(), timeSec: z.number().int().optional() })
        .optional(),
      difficulty: z.number().min(0).max(10).optional(),
      solverVersion: z.string().optional(),
      /** Erlaubt mehr Fahrzeugkapazität als Fahrgäste einer Farbe. */
      allowSurplus: z.boolean().optional(),
    })
    .optional(),
});
export type Level = z.infer<typeof Level>;
