import { deflateSync } from 'fflate';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import { decodeLevel, encodeLevel } from '../../../src/app/share';
import type { RulesLookup } from '../../../src/app/share';
import { Level, SHARE_MAX_LENGTH, SHARE_PREFIX, resolveRules } from '../../../src/schema';
import type { ShareError } from '../../../src/schema';
import {
  classicRuleset as classic,
  world2Ruleset as world2,
  world3Ruleset as world3,
} from '../helpers';

const RULESETS = new Map([classic, world2, world3].map((r) => [r.id, r]));
const lookup: RulesLookup = (id, overrides) => {
  const ruleset = RULESETS.get(id);
  return ruleset ? resolveRules(ruleset, overrides) : null;
};

const KNOWN_ERRORS: readonly ShareError[] = [
  'empty',
  'tooLong',
  'version',
  'encoding',
  'inflate',
  'json',
  'schema',
  'unknownRuleset',
  'invalidLevel',
];

/** Laufzahl je Property; haelt die ganze Suite unter wenigen Sekunden. */
const RUNS = 300;
const ZERO_BOMB_BYTES = 1_000_000; // ergibt ca. 1 KB Deflate, passt in den Code

const b64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const deflateJson = (value: unknown): string =>
  SHARE_PREFIX + b64url(deflateSync(new TextEncoder().encode(JSON.stringify(value))));

/** decodeLevel darf nicht werfen; Ergebnis ist ein valides Level oder ein bekannter Fehler. */
function expectSane(code: string): void {
  const res = decodeLevel(code, lookup);
  if (res.ok) {
    expect(Level.safeParse(res.level).success).toBe(true);
  } else {
    expect(KNOWN_ERRORS).toContain(res.error);
  }
}

const validCodes = getCampaign().levels.map((l) => {
  const res = encodeLevel(l.level, { unchecked: false });
  if (!res.ok) throw new Error('encode failed');
  return res.code;
});

describe('Share-Codec: Fuzz', () => {
  it('beliebige Strings', () => {
    fc.assert(fc.property(fc.string({ maxLength: SHARE_MAX_LENGTH + 20 }), expectSane), {
      numRuns: RUNS,
    });
    fc.assert(fc.property(fc.string({ unit: 'binary' }), expectSane), { numRuns: RUNS });
  });

  it('beliebige Strings mit Praefix', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (s) => expectSane(SHARE_PREFIX + s)),
      { numRuns: RUNS },
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9_-]{0,400}$/), (s) => expectSane(SHARE_PREFIX + s)),
      { numRuns: RUNS },
    );
  });

  it('beliebige Bytes, deflated und base64url', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) =>
        expectSane(SHARE_PREFIX + b64url(deflateSync(bytes))),
      ),
      { numRuns: RUNS },
    );
    // Rohe Bytes ohne gueltigen Deflate-Strom.
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) =>
        expectSane(SHARE_PREFIX + b64url(bytes)),
      ),
      { numRuns: RUNS },
    );
  });

  it('zufaellige JSON-Werte, deflated', () => {
    fc.assert(
      fc.property(fc.json(), (text) => {
        expectSane(deflateJson(JSON.parse(text) as unknown));
      }),
      { numRuns: RUNS },
    );
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expectSane(deflateJson(value));
      }),
      { numRuns: RUNS },
    );
  });

  it('Mutationen gueltiger Codes', () => {
    const mutation = fc.oneof(
      fc.record({
        kind: fc.constant('replace' as const),
        at: fc.nat(),
        ch: fc.string({ maxLength: 2 }),
      }),
      fc.record({
        kind: fc.constant('insert' as const),
        at: fc.nat(),
        ch: fc.string({ maxLength: 4 }),
      }),
      fc.record({ kind: fc.constant('cut' as const), at: fc.nat(), ch: fc.constant('') }),
      fc.record({ kind: fc.constant('delete' as const), at: fc.nat(), ch: fc.constant('') }),
    );
    fc.assert(
      fc.property(
        fc.nat({ max: validCodes.length - 1 }),
        fc.array(mutation, { minLength: 1, maxLength: 4 }),
        (index, edits) => {
          let code = validCodes[index] ?? '';
          for (const e of edits) {
            const at = e.at % (code.length + 1);
            if (e.kind === 'replace')
              code = code.slice(0, at) + e.ch + code.slice(at + e.ch.length);
            else if (e.kind === 'insert') code = code.slice(0, at) + e.ch + code.slice(at);
            else if (e.kind === 'cut') code = code.slice(0, at);
            else code = code.slice(0, at) + code.slice(at + 1);
          }
          expectSane(code);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('gueltige Codes bleiben gueltig', () => {
    for (const code of validCodes) expect(decodeLevel(code, lookup).ok).toBe(true);
  });

  it('Deflate-Bombe: Fehler statt Absturz', () => {
    const code = SHARE_PREFIX + b64url(deflateSync(new Uint8Array(ZERO_BOMB_BYTES), { level: 9 }));
    expect(code.length).toBeLessThanOrEqual(SHARE_MAX_LENGTH);
    const res = decodeLevel(code, lookup);
    expect(res).toEqual({ ok: false, error: 'inflate' });
  });
});
