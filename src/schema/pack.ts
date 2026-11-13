import { z } from 'zod';
import { LocalizedText } from './ruleset';

/** Spielmechanik, die eine Welt einfuehrt (Intro-Karte beim ersten Level mit dieser Mechanik). */
export const Mechanic = z.enum(['bollards', 'keys', 'honk', 'mystery', 'oneWay']);
export type Mechanic = z.infer<typeof Mechanic>;

/**
 * `src/content/levels/pack-XX/index.json`: Reihenfolge und Welt-Metadaten eines Packs.
 * Ein Pack ist genau eine Welt; Welten sind nach `world` aufsteigend sortiert.
 */
export const PackIndex = z.object({
  /** Weltnummer ab 1, eindeutig ueber alle Packs. */
  world: z.number().int().min(1),
  name: LocalizedText,
  /** Level-Dateinamen ohne Endung, in Spielreihenfolge. */
  levels: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)).min(1),
  /** Datei-ID -> Mechanik, deren Intro-Karte vor diesem Level gezeigt wird. */
  intros: z.record(z.string(), Mechanic).default({}),
});
export type PackIndex = z.infer<typeof PackIndex>;
