import { z } from 'zod';
import { ColorId, RulesetOverrides } from './ruleset';
import { Dir } from './level';

// Kompaktes Level-Format zum Teilen per URL-Fragment (#/play?l=<SHARE_PREFIX><base64url(deflate(JSON))>).
// Fahrzeug-IDs werden beim Dekodieren neu vergeben (v1, v2, ... in Array-Reihenfolge).

/** Formatversion; steht als `<version>.` vor dem Payload. */
export const SHARE_VERSION = 1;
export const SHARE_PREFIX = `${SHARE_VERSION}.`;
/** Obergrenze fuer den Code inkl. Praefix (Zeichen). Laengere Codes werden abgelehnt. */
export const SHARE_MAX_LENGTH = 2048;
/** Obergrenze fuer das entpackte JSON (Bytes), Schutz gegen Deflate-Bomben. */
export const SHARE_MAX_INFLATED = 32_768;
/** Laenge fuer Titel und Autor im geteilten Level. */
export const SHARE_TEXT_MAX = 40;

const Coord = z.number().int().min(0).max(11);
const ShareText = z.string().min(1).max(SHARE_TEXT_MAX);

/** Zelle: [x, y, typ] oder [x, y, typ, dir]. */
export const ShareCell = z.union([
  z.tuple([Coord, Coord, z.enum(['fixed', 'oneWay', 'barrier', 'gate'])]),
  z.tuple([Coord, Coord, z.enum(['fixed', 'oneWay', 'barrier', 'gate']), Dir]),
]);
export type ShareCell = z.infer<typeof ShareCell>;

/**
 * Fahrzeug: [x, y, dir, typ, farbe] oder mit Schluessel [x, y, dir, typ, farbe, keyIndex].
 * keyIndex = Index des Schluessel-Fahrzeugs in `v`; ein Fahrzeug mit keyIndex ist gesperrt.
 */
export const ShareVehicle = z.union([
  z.tuple([Coord, Coord, Dir, z.string().min(1).max(8), ColorId]),
  z.tuple([Coord, Coord, Dir, z.string().min(1).max(8), ColorId, z.number().int().min(0).max(59)]),
]);
export type ShareVehicle = z.infer<typeof ShareVehicle>;

export const ShareLevel = z.object({
  /** Ruleset-ID. */
  r: z.string().regex(/^[a-z0-9-]{1,32}$/),
  o: RulesetOverrides.optional(),
  /** [Breite, Hoehe]. */
  g: z.tuple([z.number().int().min(3).max(12), z.number().int().min(3).max(12)]),
  c: z.array(ShareCell).max(144).optional(),
  v: z.array(ShareVehicle).min(1).max(60),
  /** Fahrgaeste als Indizes in die Farbliste `k`. */
  k: z.array(ColorId).min(1).max(10),
  p: z.array(z.number().int().min(0).max(9)).min(1).max(400),
  /**
   * Mystery-Fahrzeuge als aufsteigende, eindeutige Indizes in `v` (fehlt = keine). Eigenes Feld statt
   * Tupel-Erweiterung, damit Codes ohne Mystery-Fahrzeuge bitgleich bleiben.
   */
  m: z.array(z.number().int().min(0).max(59)).min(1).max(60).optional(),
  t: ShareText.optional(),
  a: ShareText.optional(),
  /** Vom Solver ungeprueft geteilt. */
  u: z.literal(1).optional(),
});
export type ShareLevel = z.infer<typeof ShareLevel>;

/** Gruende, aus denen ein Share-Code abgelehnt wird (Reihenfolge = Pruefreihenfolge). */
export type ShareError =
  | 'empty'
  | 'tooLong'
  | 'version'
  | 'encoding'
  | 'inflate'
  | 'json'
  | 'schema'
  | 'unknownRuleset'
  | 'invalidLevel';
