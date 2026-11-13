import { deflateSync, inflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeLevel, encodeLevel } from '../../../src/app/share';
import type { EncodeOptions, RulesLookup } from '../../../src/app/share';
import { createGame } from '../../../src/engine';
import { SHARE_PREFIX, resolveRules } from '../../../src/schema';
import type { Level, Ruleset, ShareError } from '../../../src/schema';
import {
  classicRuleset as classic,
  level as level007,
  world2Ruleset as world2,
  world3Ruleset as world3,
} from '../helpers';
import fixtures from './fixtures/share-codes-v1.json';

/** Test-Ruleset mit Mystery-Fahrzeugen (die Welt-4-Datei kommt spaeter). */
const mysteryRuleset: Ruleset = {
  ...world2,
  id: 'mystery-test',
  special: { ...world2.special, mysteryVehicles: true },
};
const RULESETS = new Map([classic, world2, world3, mysteryRuleset].map((r) => [r.id, r]));
const lookup: RulesLookup = (id, overrides) => {
  const ruleset = RULESETS.get(id);
  return ruleset ? resolveRules(ruleset, overrides) : null;
};

const b64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const codeOf = (value: unknown): string =>
  SHARE_PREFIX + b64url(deflateSync(new TextEncoder().encode(JSON.stringify(value)), { level: 9 }));
const rawOf = (code: string): Record<string, unknown> =>
  JSON.parse(
    new TextDecoder().decode(
      inflateSync(Buffer.from(code.slice(SHARE_PREFIX.length), 'base64url')),
    ),
  ) as Record<string, unknown>;
const errorOf = (code: string): ShareError | 'ok' => {
  const res = decodeLevel(code, lookup);
  return res.ok ? 'ok' : res.error;
};

const mysteryLevel: Level = {
  ...level007,
  ruleset: mysteryRuleset.id,
  vehicles: level007.vehicles.map((v, i) => (i === 1 || i === 3 ? { ...v, mystery: true } : v)),
};

describe('Share-Format v1: Abwaertskompatibilitaet', () => {
  it.each(fixtures.map((f) => [f.name, f] as const))(
    '%s dekodiert und kodiert bitgleich',
    (_n, f) => {
      const dec = decodeLevel(f.code, lookup);
      expect(dec.ok).toBe(true);
      if (!dec.ok) return;
      expect(dec.level).toEqual(f.decoded);
      expect(dec.level.vehicles.some((v) => 'mystery' in v)).toBe(false);
      const enc = encodeLevel(f.source as Level, f.options as EncodeOptions);
      expect(enc).toEqual({ ok: true, code: f.code });
    },
  );
});

describe('Share-Format: Mystery-Fahrzeuge', () => {
  it('traegt das Flag als Indexliste m und stellt es wieder her', () => {
    const enc = encodeLevel(mysteryLevel, { unchecked: false });
    if (!enc.ok) throw new Error('encode failed');
    expect(rawOf(enc.code).m).toEqual([1, 3]);
    const dec = decodeLevel(enc.code, lookup);
    if (!dec.ok) throw new Error(`decode failed: ${dec.error}`);
    expect(dec.level.vehicles.map((v) => v.mystery === true)).toEqual(
      mysteryLevel.vehicles.map((v) => v.mystery === true),
    );
    const hidden = createGame(dec.level, dec.rules).vehicles.filter((v) => v.hidden);
    const want = createGame(mysteryLevel, lookup(mysteryLevel.ruleset)!).vehicles;
    expect(hidden.length).toBe(want.filter((v) => v.hidden).length);
  });

  it('laesst m ohne Mystery-Fahrzeuge (und bei mystery: false) weg', () => {
    const plain = {
      ...level007,
      vehicles: level007.vehicles.map((v) => ({ ...v, mystery: false })),
    };
    const enc = encodeLevel(plain, { unchecked: false });
    if (!enc.ok) throw new Error('encode failed');
    expect(rawOf(enc.code)).not.toHaveProperty('m');
    expect(enc).toEqual(encodeLevel(level007, { unchecked: false }));
  });

  const base = { r: mysteryRuleset.id, g: [4, 4], k: ['blue'], p: [0, 0, 0, 0] };
  const v = [
    [1, 0, 'E', 's', 'blue'],
    [1, 2, 'E', 's', 'blue'],
  ];

  it('akzeptiert gueltige Indizes', () => {
    expect(errorOf(codeOf({ ...base, v, m: [0, 1] }))).toBe('ok');
  });

  it.each([
    ['ausserhalb', [2]],
    ['doppelt', [1, 1]],
    ['unsortiert', [1, 0]],
    ['leer', []],
    ['negativ', [-1]],
  ])('meldet schema fuer m %s', (_n, m) => {
    expect(errorOf(codeOf({ ...base, v, m }))).toBe('schema');
  });

  it('meldet invalidLevel, wenn das Ruleset keine Mystery-Fahrzeuge kennt', () => {
    expect(errorOf(codeOf({ ...base, r: 'world2', v, m: [0] }))).toBe('invalidLevel');
  });
});
