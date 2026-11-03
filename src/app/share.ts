// Teilen per URL-Fragment: Level <-> Share-Code ("1.<base64url(deflate(JSON(ShareLevel)))>").
// Vertrag siehe docs/INTERFACES.md ("Teilen per URL"). Implementierung: Paket F1.
import type { Level, ResolvedRules, RulesetOverrides, ShareError } from '../schema';

/** Titel eines geteilten Levels ohne eigenen Titel. */
export const SHARED_DEFAULT_TITLE = { de: 'Geteiltes Level', en: 'Shared level' } as const;
/** Level-ID geteilter Level nach dem Dekodieren. */
export const SHARED_LEVEL_ID = 'shared';

export interface EncodeOptions {
  /** Vom Solver nicht als loesbar bestaetigt (setzt `u: 1`). */
  unchecked: boolean;
  title?: string;
  author?: string;
}

export type EncodeResult = { ok: true; code: string } | { ok: false; error: 'tooLong' };

export type DecodeResult =
  | {
      ok: true;
      level: Level;
      rules: ResolvedRules;
      unchecked: boolean;
      title: string | null;
      author: string | null;
    }
  | { ok: false; error: ShareError };

/** Liefert die aufgeloesten Regeln eines Rulesets oder null, wenn es unbekannt ist. */
export type RulesLookup = (rulesetId: string, overrides?: RulesetOverrides) => ResolvedRules | null;

/** Level -> Share-Code inkl. Praefix. Nie laenger als SHARE_MAX_LENGTH. */
export function encodeLevel(level: Level, opts: EncodeOptions): EncodeResult {
  void level;
  void opts;
  throw new Error('encodeLevel: noch nicht implementiert (Paket F1)');
}

/**
 * Share-Code -> Level. Wirft nie; jede Eingabe ergibt ok oder einen ShareError.
 * Prueft Laenge, Version, base64url, Inflate-Groesse, JSON, zod, Ruleset und validateLevel.
 * Die Loesbarkeit (Solver) prueft der Aufrufer asynchron.
 */
export function decodeLevel(code: string, rulesOf: RulesLookup): DecodeResult {
  void code;
  void rulesOf;
  throw new Error('decodeLevel: noch nicht implementiert (Paket F1)');
}
