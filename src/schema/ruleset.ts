import { z } from 'zod';

/** Farb-ID, z. B. "blue". Die Darstellung (Hex-Wert + Symbol) kommt aus der Render-Palette. */
export const ColorId = z.string().regex(/^[a-z][a-z0-9-]{0,15}$/);
export type ColorId = z.infer<typeof ColorId>;

/** Text, entweder einsprachig oder pro Sprache. */
export const LocalizedText = z.union([
  z.string().min(1),
  z.object({ de: z.string().min(1), en: z.string().min(1) }),
]);
export type LocalizedText = z.infer<typeof LocalizedText>;

export const VehicleType = z.object({
  length: z.number().int().min(1).max(6),
  capacity: z.number().int().min(1).max(12),
});
export type VehicleType = z.infer<typeof VehicleType>;

export const PowerUpConfig = z.object({
  enabled: z.boolean(),
  uses: z.number().int().min(0).max(99),
});
export type PowerUpConfig = z.infer<typeof PowerUpConfig>;

export const QueueRules = z.object({
  /** Anzahl Halteplätze (inkl. gesperrter). */
  slots: z.number().int().min(1).max(12),
  /** firstFree: ausfahrendes Fahrzeug nimmt den ersten freien Slot. fifo: Schlange rückt nach Abfahrten auf. */
  fillPolicy: z.enum(['firstFree', 'fifo']),
  /** Indizes gesperrter Slots (Extra-Slot-Power-Up schaltet den ersten frei). */
  lockedSlots: z.array(z.number().int().min(0).max(11)),
  /** Niederlage, wenn alle Slots belegt sind und der vorderste Fahrgast nirgends passt. */
  loseOnFull: z.boolean(),
});

export const VehicleRules = z.object({
  types: z.record(z.string().regex(/^[a-z0-9]{1,8}$/), VehicleType),
  colors: z.array(ColorId).min(1).max(10),
  dualColor: z.boolean(),
  departOnFull: z.boolean(),
});

export const MovementRules = z.object({
  model: z.enum(['straight', 'turns', 'pathfinding']),
  exits: z.enum(['edges', 'gates']),
  reversible: z.boolean(),
});

export const PassengerRules = z.object({
  order: z.enum(['strict', 'lookahead', 'free']),
  lookahead: z.number().int().min(1).max(8),
  /** Nur Darstellung: wie viele Fahrgäste sichtbar sind. Shuffle wirkt auf dieses Fenster. */
  visible: z.number().int().min(1).max(20),
  mysteryRate: z.number().min(0).max(1),
  boardPolicy: z.enum(['firstMatch', 'largestFree', 'playerChoice']),
});

export const LimitRules = z.object({
  timeSec: z.number().int().positive().nullable(),
  moves: z.number().int().positive().nullable(),
});

export const ScoringRules = z.object({
  /**
   * moves: Wert = Züge - Par. time: Wert = Sekunden - Par-Zeit. powerupsUsed: Wert = Anzahl genutzter Power-Ups.
   * Hinweis: Bei movement.model "straight" braucht jede Lösung gleich viele Züge, daher Default "powerupsUsed".
   */
  starMode: z.enum(['moves', 'time', 'powerupsUsed']),
  /** 3 Sterne bei Wert <= three, 2 Sterne bei Wert <= two, sonst 1 Stern. */
  stars: z.object({ three: z.number().int().min(0), two: z.number().int().min(0) }),
});

export const SpecialRules = z.object({
  barriers: z.boolean(),
  oneWay: z.boolean(),
  keyVehicles: z.boolean(),
  fixed: z.boolean(),
  mysteryVehicles: z.boolean(),
});

export const PowerUpRules = z.object({
  undo: PowerUpConfig,
  shuffle: PowerUpConfig,
  extraSlot: PowerUpConfig,
  honk: PowerUpConfig,
  earnRule: z.enum(['none', 'perLevel', 'byStars']),
});

export const Ruleset = z.object({
  schema: z.literal('parking.ruleset/1'),
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  name: LocalizedText,
  queue: QueueRules,
  vehicles: VehicleRules,
  movement: MovementRules,
  passengers: PassengerRules,
  limits: LimitRules,
  scoring: ScoringRules,
  special: SpecialRules,
  powerups: PowerUpRules,
});
export type Ruleset = z.infer<typeof Ruleset>;

/** Teilweise Überschreibungen pro Level (eine Ebene tief pro Gruppe). */
export const RulesetOverrides = z
  .object({
    queue: QueueRules.partial(),
    vehicles: VehicleRules.partial(),
    movement: MovementRules.partial(),
    passengers: PassengerRules.partial(),
    limits: LimitRules.partial(),
    scoring: ScoringRules.partial(),
    special: SpecialRules.partial(),
    powerups: PowerUpRules.partial(),
  })
  .partial();
export type RulesetOverrides = z.infer<typeof RulesetOverrides>;

/** Ruleset nach Anwendung der Level-Overrides. Das ist, was die Engine bekommt. */
export type ResolvedRules = Omit<Ruleset, 'schema' | 'name'>;

/** Wendet Overrides auf ein Ruleset an (pro Gruppe flach gemergt) und validiert das Ergebnis. */
export function resolveRules(ruleset: Ruleset, overrides: RulesetOverrides = {}): ResolvedRules {
  const merged = {
    ...ruleset,
    queue: { ...ruleset.queue, ...overrides.queue },
    vehicles: { ...ruleset.vehicles, ...overrides.vehicles },
    movement: { ...ruleset.movement, ...overrides.movement },
    passengers: { ...ruleset.passengers, ...overrides.passengers },
    limits: { ...ruleset.limits, ...overrides.limits },
    scoring: { ...ruleset.scoring, ...overrides.scoring },
    special: { ...ruleset.special, ...overrides.special },
    powerups: { ...ruleset.powerups, ...overrides.powerups },
  };
  const parsed: Partial<Ruleset> = Ruleset.parse(merged);
  delete parsed.schema;
  delete parsed.name;
  return parsed as ResolvedRules;
}
