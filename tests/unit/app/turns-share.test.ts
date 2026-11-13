import { deflateSync, inflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  newEditorState,
  placeVehicle,
  rulesOfState,
  setTurnsRule,
  toLevel,
  toggleArrow,
  toggleFixed,
} from '../../../src/app/editor-model';
import type { EditResult, EditorState } from '../../../src/app/editor-model';
import { SHARED_DEFAULT_TITLE, decodeLevel, encodeLevel } from '../../../src/app/share';
import type { RulesLookup } from '../../../src/app/share';
import { createGame, validateLevel } from '../../../src/engine';
import { SHARE_PREFIX, resolveRules } from '../../../src/schema';
import type { Level } from '../../../src/schema';
import { classicRuleset as classic, world2Ruleset as world2 } from '../helpers';

const RULESETS = new Map([classic, world2].map((r) => [r.id, r]));
const lookup: RulesLookup = (id, overrides) => {
  const ruleset = RULESETS.get(id);
  return ruleset ? resolveRules(ruleset, overrides) : null;
};
const rawOf = (code: string): Record<string, unknown> =>
  JSON.parse(
    new TextDecoder().decode(
      inflateSync(Buffer.from(code.slice(SHARE_PREFIX.length), 'base64url')),
    ),
  ) as Record<string, unknown>;
const codeOf = (value: unknown): string =>
  SHARE_PREFIX +
  Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(value)), { level: 9 })).toString(
    'base64url',
  );

function ok(result: EditResult): EditorState {
  if (!result.ok) throw new Error(`unerwartet abgelehnt: ${result.error}`);
  return result.state;
}

/** Editor-Level auf world2: A faehrt ueber einen Pfeil nach oben, B blockiert ihn dort. */
function editorLevel(withArrows: boolean): Level {
  let s = newEditorState('world2');
  if (withArrows) s = setTurnsRule(s, true);
  const r = (): ReturnType<typeof rulesOfState> => rulesOfState(s, world2);
  s = ok(placeVehicle(s, r(), { x: 1, y: 3, dir: 'E', type: 's', color: 'blue' }));
  s = ok(placeVehicle(s, r(), { x: 4, y: 1, dir: 'E', type: 's', color: 'green' }));
  s = ok(toggleFixed(s, r(), 0, 0));
  if (withArrows) {
    s = ok(toggleArrow(s, r(), 3, 3, 'N'));
    s = ok(toggleArrow(s, r(), 3, 0, 'E'));
  }
  return toLevel(s, world2);
}

describe('Share-Format: Abbiegepfeile', () => {
  it('kodiert Pfeile als [x, y, "oneWay", dir] und stellt sie wieder her', () => {
    const level = editorLevel(true);
    const enc = encodeLevel(level, { unchecked: false });
    if (!enc.ok) throw new Error('encode failed');
    const raw = rawOf(enc.code);
    expect(raw.c).toEqual([
      [0, 0, 'fixed'],
      [3, 0, 'oneWay', 'E'],
      [3, 3, 'oneWay', 'N'],
    ]);
    expect(raw.o).toEqual({ movement: { model: 'turns' }, special: { oneWay: true } });
    const dec = decodeLevel(enc.code, lookup);
    if (!dec.ok) throw new Error(`decode failed: ${dec.error}`);
    expect(dec.level).toEqual({
      ...level,
      id: 'shared',
      title: { ...SHARED_DEFAULT_TITLE },
    });
    expect(dec.rules.movement.model).toBe('turns');
    expect(validateLevel(dec.level, dec.rules)).toEqual([]);
    expect(createGame(dec.level, dec.rules).grid.cells).toEqual(level.grid.cells);
    // Erneutes Kodieren ist bitgleich.
    expect(encodeLevel(dec.level, { unchecked: false })).toEqual(enc);
  });

  it('Level ohne Pfeile kodieren bitgleich wie bisher', () => {
    const level = editorLevel(false);
    const enc = encodeLevel(level, { unchecked: false });
    expect(enc).toEqual({
      ok: true,
      code: codeOf({
        r: 'world2',
        g: [6, 6],
        v: [
          [1, 3, 'E', 's', 'blue'],
          [4, 1, 'E', 's', 'green'],
        ],
        k: ['blue', 'green'],
        p: [0, 0, 1, 1],
        c: [[0, 0, 'fixed']],
      }),
    });
  });

  it('lehnt Pfeile ohne Freischaltung als invalidLevel ab', () => {
    const { overrides, ...level } = editorLevel(true);
    void overrides;
    const enc = encodeLevel(level, { unchecked: false });
    if (!enc.ok) throw new Error('encode failed');
    expect(decodeLevel(enc.code, lookup)).toEqual({ ok: false, error: 'invalidLevel' });
  });
});
