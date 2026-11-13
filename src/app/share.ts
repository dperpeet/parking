// Teilen per URL-Fragment: Level <-> Share-Code ("1.<base64url(deflate(JSON(ShareLevel)))>").
// Vertrag siehe docs/INTERFACES.md ("Teilen per URL").
import { deflateSync, inflateSync } from 'fflate';
import { validateLevel } from '../engine';
import {
  Level as LevelSchema,
  SHARE_MAX_INFLATED,
  SHARE_MAX_LENGTH,
  SHARE_PREFIX,
  SHARE_TEXT_MAX,
  ShareLevel,
} from '../schema';
import type {
  Cell,
  Level,
  LevelVehicle,
  ResolvedRules,
  RulesetOverrides,
  ShareCell,
  ShareError,
} from '../schema';

/** Deflate-Stufe (hoechste Kompression, Codes sollen kurz sein). */
const DEFLATE_LEVEL = 9;
/** Zeichensatz von base64url (RFC 4648, Abschnitt 5). */
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_VALID = /^[A-Za-z0-9_-]+$/;
const BITS_PER_CHAR = 6;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 0xff;
const CHAR_MASK = 0x3f;
/** Ein einzelnes uebrig bleibendes Zeichen (Laenge mod 4 = 1) kann kein Byte darstellen. */
const B64_BAD_REMAINDER = 1;
const B64_GROUP = 4;

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

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << BITS_PER_BYTE) | byte;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_CHAR) {
      bits -= BITS_PER_CHAR;
      out += B64_ALPHABET[(acc >> bits) & CHAR_MASK];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B64_ALPHABET[(acc << (BITS_PER_CHAR - bits)) & CHAR_MASK];
  return out;
}

/** null bei ungueltigen Zeichen oder unmoeglicher Laenge. */
function fromBase64Url(text: string): Uint8Array | null {
  if (!B64_VALID.test(text) || text.length % B64_GROUP === B64_BAD_REMAINDER) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    acc = (acc << BITS_PER_CHAR) | B64_ALPHABET.indexOf(ch);
    bits += BITS_PER_CHAR;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      out.push((acc >> bits) & BYTE_MASK);
    }
    acc &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}

function clipText(text: string | undefined): string | undefined {
  const clipped = text?.slice(0, SHARE_TEXT_MAX);
  return clipped === '' ? undefined : clipped;
}

function toShareCell(c: Cell): ShareCell {
  return c.dir ? [c.x, c.y, c.type, c.dir] : [c.x, c.y, c.type];
}

/** Level -> Share-Code inkl. Praefix. Nie laenger als SHARE_MAX_LENGTH. */
export function encodeLevel(level: Level, opts: EncodeOptions): EncodeResult {
  const colors: string[] = [];
  const indexOf = (color: string): number => {
    let i = colors.indexOf(color);
    if (i < 0) i = colors.push(color) - 1;
    return i;
  };
  const vehicleIndex = new Map(level.vehicles.map((v, i) => [v.id, i]));
  const passengers = level.passengers.map(indexOf);

  const payload: ShareLevel = {
    r: level.ruleset,
    g: [level.grid.width, level.grid.height],
    v: level.vehicles.map((v) => {
      const key = v.locked && v.keyId !== undefined ? vehicleIndex.get(v.keyId) : undefined;
      const base = [v.pos[0], v.pos[1], v.dir, v.type, v.color] as const;
      return key === undefined ? [...base] : [...base, key];
    }) as ShareLevel['v'],
    k: colors,
    p: passengers,
  };
  if (level.overrides) payload.o = level.overrides;
  if (level.grid.cells.length > 0) payload.c = level.grid.cells.map(toShareCell);
  const mystery = level.vehicles.flatMap((v, i) => (v.mystery ? [i] : []));
  if (mystery.length > 0) payload.m = mystery;
  const title = clipText(opts.title);
  const author = clipText(opts.author);
  if (title) payload.t = title;
  if (author) payload.a = author;
  if (opts.unchecked) payload.u = 1;

  const bytes = deflateSync(new TextEncoder().encode(JSON.stringify(payload)), {
    level: DEFLATE_LEVEL,
  });
  const code = SHARE_PREFIX + toBase64Url(bytes);
  return code.length > SHARE_MAX_LENGTH ? { ok: false, error: 'tooLong' } : { ok: true, code };
}

/** Entpackt mit festem Ausgabepuffer (+1 Byte als Ueberlauf-Marke); null bei Fehler oder Ueberlauf. */
function inflateBounded(data: Uint8Array): Uint8Array | null {
  try {
    const out = inflateSync(data, { out: new Uint8Array(SHARE_MAX_INFLATED + 1) });
    return out.length > SHARE_MAX_INFLATED ? null : out;
  } catch {
    return null;
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/** `m` muss streng aufsteigend sein und auf vorhandene Fahrzeuge zeigen. */
function validMystery(s: ShareLevel): boolean {
  const m = s.m ?? [];
  return m.every((i, n) => i < s.v.length && (n === 0 || i > (m[n - 1] ?? i)));
}

function buildLevel(s: ShareLevel): Level {
  const ids = s.v.map((_, i) => `v${i + 1}`);
  const mystery = new Set(s.m ?? []);
  const vehicles: LevelVehicle[] = s.v.map((v, i) => {
    const out: LevelVehicle = {
      id: ids[i] ?? '',
      pos: [v[0], v[1]],
      dir: v[2],
      type: v[3],
      color: v[4],
    };
    const key = v[5];
    if (key !== undefined) {
      out.locked = true;
      out.keyId = `v${key + 1}`;
    }
    if (mystery.has(i)) out.mystery = true;
    return out;
  });
  const cells: Cell[] = (s.c ?? []).map((c) => {
    const cell: Cell = { x: c[0], y: c[1], type: c[2] };
    if (c[3]) cell.dir = c[3];
    return cell;
  });
  return {
    schema: 'parking.level/1',
    id: SHARED_LEVEL_ID,
    title: s.t ?? { ...SHARED_DEFAULT_TITLE },
    ruleset: s.r,
    ...(s.o ? { overrides: s.o } : {}),
    grid: { width: s.g[0], height: s.g[1], cells },
    vehicles,
    passengers: s.p.map((i) => s.k[i] ?? ''),
    ...(s.a ? { meta: { author: s.a } } : {}),
  };
}

/**
 * Share-Code -> Level. Wirft nie; jede Eingabe ergibt ok oder einen ShareError.
 * Prueft Laenge, Version, base64url, Inflate-Groesse, JSON, zod, Ruleset und validateLevel.
 * Die Loesbarkeit (Solver) prueft der Aufrufer asynchron.
 */
export function decodeLevel(code: string, rulesOf: RulesLookup): DecodeResult {
  const fail = (error: ShareError): DecodeResult => ({ ok: false, error });
  if (typeof code !== 'string' || code === '') return fail('empty');
  if (code.length > SHARE_MAX_LENGTH) return fail('tooLong');
  if (!code.startsWith(SHARE_PREFIX)) return fail('version');
  const bytes = fromBase64Url(code.slice(SHARE_PREFIX.length));
  if (!bytes) return fail('encoding');
  const json = inflateBounded(bytes);
  if (!json) return fail('inflate');
  const raw = parseJson(json);
  if (raw === undefined) return fail('json');
  const parsed = ShareLevel.safeParse(raw);
  if (!parsed.success) return fail('schema');
  const share = parsed.data;
  if (share.p.some((i) => i >= share.k.length) || !validMystery(share)) return fail('schema');

  let rules: ResolvedRules | null;
  try {
    rules = rulesOf(share.r, share.o);
  } catch {
    return fail('schema');
  }
  if (!rules) return fail('unknownRuleset');

  const level = buildLevel(share);
  if (!LevelSchema.safeParse(level).success) return fail('invalidLevel');
  if (validateLevel(level, rules).length > 0) return fail('invalidLevel');
  return {
    ok: true,
    level,
    rules,
    unchecked: share.u === 1,
    title: share.t ?? null,
    author: share.a ?? null,
  };
}
