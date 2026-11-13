import { deflateSync, inflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { getCampaign } from '../../../src/app/levels';
import {
  SHARED_DEFAULT_TITLE,
  SHARED_LEVEL_ID,
  decodeLevel,
  encodeLevel,
} from '../../../src/app/share';
import type { EncodeOptions, RulesLookup } from '../../../src/app/share';
import { createGame, hashState } from '../../../src/engine';
import {
  Level,
  SHARE_MAX_INFLATED,
  SHARE_MAX_LENGTH,
  SHARE_PREFIX,
  SHARE_TEXT_MAX,
  resolveRules,
} from '../../../src/schema';
import type { ShareError } from '../../../src/schema';
import {
  classicRuleset as classic,
  level as level007,
  world2Ruleset as world2,
  world3Ruleset as world3,
  world4Ruleset as world4,
} from '../helpers';

const campaign = getCampaign();

/** Wie der Session-Lookup: alle ausgelieferten Rulesets. */
const RULESETS = new Map([classic, world2, world3, world4].map((r) => [r.id, r]));
const lookup: RulesLookup = (id, overrides) => {
  const ruleset = RULESETS.get(id);
  return ruleset ? resolveRules(ruleset, overrides) : null;
};

const b64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

/** Baut einen Code aus beliebigem JSON. */
function codeOf(value: unknown): string {
  const bytes = deflateSync(new TextEncoder().encode(JSON.stringify(value)), { level: 9 });
  return SHARE_PREFIX + b64url(bytes);
}

/** Level mit Fahrzeug-IDs v1..vn, id "shared", ohne seed/meta (Soll-Ergebnis eines Round-Trips). */
function normalized(level: Level): Level {
  const ids = new Map(level.vehicles.map((v, i) => [v.id, `v${i + 1}`]));
  const out: Level = {
    ...level,
    id: SHARED_LEVEL_ID,
    title: { ...SHARED_DEFAULT_TITLE },
    vehicles: level.vehicles.map((v) => ({
      ...v,
      id: ids.get(v.id) ?? v.id,
      ...(v.keyId === undefined ? {} : { keyId: ids.get(v.keyId) }),
    })),
  };
  delete out.seed;
  delete out.meta;
  return out;
}

const PLAIN: EncodeOptions = { unchecked: false };

function roundTrip(level: Level, opts: EncodeOptions = PLAIN) {
  const enc = encodeLevel(level, opts);
  if (!enc.ok) throw new Error('encode failed');
  const dec = decodeLevel(enc.code, lookup);
  if (!dec.ok) throw new Error(`decode failed: ${dec.error}`);
  return { code: enc.code, dec };
}

function errorOf(code: string): ShareError | 'ok' {
  const res = decodeLevel(code, lookup);
  return res.ok ? 'ok' : res.error;
}

/** Gueltiger Rohinhalt als Ausgangspunkt fuer kaputte Varianten. */
const validRaw = (): Record<string, unknown> => ({
  r: 'classic',
  g: [4, 4],
  v: [[1, 0, 'E', 's', 'blue']],
  k: ['blue'],
  p: [0, 0],
});

describe('Share-Codec: Kampagne', () => {
  it('hat Kampagnen-Level', () => {
    expect(campaign.levels.length).toBeGreaterThan(0);
  });

  it.each(campaign.levels.map((l) => [l.key, l] as const))('Round-Trip %s', (_key, entry) => {
    const { code, dec } = roundTrip(entry.level);
    expect(code.startsWith(SHARE_PREFIX)).toBe(true);
    expect(code.length).toBeLessThanOrEqual(SHARE_MAX_LENGTH);
    expect(Level.safeParse(dec.level).success).toBe(true);
    expect(dec.level).toEqual(normalized(entry.level));
    const want = createGame(normalized(entry.level), entry.rules);
    expect(hashState(createGame(dec.level, dec.rules))).toBe(hashState(want));
  });
});

describe('Share-Codec: Inhalt', () => {
  const rich: Level = {
    ...level007,
    overrides: { queue: { slots: 7 }, special: { fixed: true, keyVehicles: true } },
    grid: { ...level007.grid, cells: [{ x: 3, y: 4, type: 'fixed' }] },
    vehicles: level007.vehicles.map((v, i) =>
      i === 0 ? { ...v, locked: true, keyId: level007.vehicles[2]?.id } : v,
    ),
  };

  it('behaelt fixed-Zellen, Schluessel und Overrides', () => {
    const { dec } = roundTrip(rich);
    expect(dec.level.grid.cells).toEqual([{ x: 3, y: 4, type: 'fixed' }]);
    expect(dec.level.vehicles[0]).toMatchObject({ locked: true, keyId: 'v3' });
    expect(dec.level.overrides).toEqual(rich.overrides);
    expect(dec.rules.queue.slots).toBe(7);
    expect(dec.rules.special.fixed).toBe(true);
    expect(hashState(createGame(dec.level, dec.rules))).toBe(
      hashState(createGame(normalized(rich), resolveRules(classic, rich.overrides))),
    );
  });

  it('uebernimmt Titel, Autor und unchecked', () => {
    const { dec } = roundTrip(level007, { unchecked: true, title: 'Mein Level', author: 'Ada' });
    expect(dec).toMatchObject({ unchecked: true, title: 'Mein Level', author: 'Ada' });
    expect(dec.level.title).toBe('Mein Level');
    expect(dec.level.meta).toEqual({ author: 'Ada' });
  });

  it('nutzt ohne Titel den Standardtitel und kuerzt zu lange Texte', () => {
    const plain = roundTrip(level007);
    expect(plain.dec).toMatchObject({ unchecked: false, title: null, author: null });
    expect(plain.dec.level.title).toEqual(SHARED_DEFAULT_TITLE);
    const long = roundTrip(level007, { unchecked: false, title: 'x'.repeat(100), author: '' });
    expect(long.dec.title).toBe('x'.repeat(SHARE_TEXT_MAX));
    expect(long.dec.author).toBeNull();
  });

  it('ordnet Farben in Reihenfolge des ersten Auftretens', () => {
    const passengers = [...level007.passengers].reverse();
    const json = inflateSync(
      Buffer.from(
        roundTrip({ ...level007, passengers }).code.slice(SHARE_PREFIX.length),
        'base64url',
      ),
    );
    const raw = JSON.parse(new TextDecoder().decode(json)) as { k: string[]; p: number[] };
    expect(raw.k).toEqual([...new Set(passengers)]);
    expect(raw.p).toEqual(passengers.map((c) => raw.k.indexOf(c)));
  });

  it('meldet tooLong, wenn der Code zu gross wird', () => {
    const colors = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const dirs = ['N', 'E', 'S', 'W'] as const;
    // Pseudozufaellige Folge, die sich schlecht komprimieren laesst.
    let x = 12345;
    const rnd = (n: number): number => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return (x >> 8) % n;
    };
    const vehicles = Array.from({ length: 60 }, (_, i) => ({
      id: `x${i}`,
      pos: [rnd(12), rnd(12)] as [number, number],
      dir: dirs[rnd(4)] ?? 'N',
      type: 's',
      color: colors[rnd(colors.length)] ?? 'a',
    }));
    const passengers = Array.from({ length: 400 }, () => colors[rnd(colors.length)] ?? 'a');
    // Viele zufaellige Fahrzeugtypen als Override blaehen den Code weit ueber die Grenze auf.
    const types = Object.fromEntries(
      Array.from({ length: 400 }, () => [
        Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[rnd(36)]).join(''),
        { length: 1 + rnd(6), capacity: 1 + rnd(12) },
      ]),
    );
    const overrides = { vehicles: { types } };
    const res = encodeLevel({ ...level007, vehicles, passengers, overrides }, PLAIN);
    expect(res).toEqual({ ok: false, error: 'tooLong' });
  });
});

describe('Share-Codec: Fehlercodes', () => {
  it('empty', () => expect(errorOf('')).toBe('empty'));
  it('tooLong', () => expect(errorOf(SHARE_PREFIX + 'A'.repeat(SHARE_MAX_LENGTH))).toBe('tooLong'));
  it('version', () => {
    expect(errorOf('2.abcd')).toBe('version');
    expect(errorOf('abcd')).toBe('version');
  });
  it('encoding', () => {
    expect(errorOf('1.ab+/')).toBe('encoding');
    expect(errorOf('1.abcde')).toBe('encoding');
    expect(errorOf('1.')).toBe('encoding');
  });
  it('inflate', () => {
    expect(errorOf('1.AAAA')).toBe('inflate');
    const bomb = SHARE_PREFIX + b64url(deflateSync(new Uint8Array(SHARE_MAX_INFLATED + 1)));
    expect(errorOf(bomb)).toBe('inflate');
  });
  it('json', () => {
    const bytes = deflateSync(new TextEncoder().encode('{kaputt'));
    expect(errorOf(SHARE_PREFIX + b64url(bytes))).toBe('json');
    expect(errorOf(SHARE_PREFIX + b64url(deflateSync(Uint8Array.of(0xff, 0xfe))))).toBe('json');
  });
  it('schema', () => {
    expect(errorOf(codeOf([1, 2]))).toBe('schema');
    expect(errorOf(codeOf({ ...validRaw(), g: [2, 2] }))).toBe('schema');
    expect(errorOf(codeOf({ ...validRaw(), p: [5] }))).toBe('schema');
  });
  it('unknownRuleset', () => {
    expect(errorOf(codeOf({ ...validRaw(), r: 'gibtsnicht' }))).toBe('unknownRuleset');
  });
  it('invalidLevel', () => {
    expect(errorOf(codeOf({ ...validRaw(), v: [[0, 0, 'E', 'ufo', 'red']] }))).toBe('invalidLevel');
    expect(errorOf(codeOf({ ...validRaw(), v: [[0, 0, 'E', 's', 'blue', 9]] }))).toBe(
      'invalidLevel',
    );
  });
  it('ok fuer das gueltige Grundgeruest', () => {
    expect(errorOf(codeOf(validRaw()))).toBe('ok');
  });
  it('wirft nie, wenn der Lookup wirft', () => {
    const res = decodeLevel(codeOf(validRaw()), () => {
      throw new Error('boom');
    });
    expect(res).toEqual({ ok: false, error: 'schema' });
  });
});
