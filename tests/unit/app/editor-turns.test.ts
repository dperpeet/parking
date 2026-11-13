import { describe, expect, it } from 'vitest';
import {
  arrowsAllowed,
  checkLevel,
  exitOrder,
  fromLevel,
  moveVehicle,
  newEditorState,
  placeVehicle,
  removeArrow,
  resizeGrid,
  rotateArrow,
  rulesOfState,
  setTurnsRule,
  toLevel,
  toggleArrow,
  toggleFixed,
} from '../../../src/app/editor-model';
import type { EditResult, EditorState, VehicleSpec } from '../../../src/app/editor-model';
import { analyze } from '../../../src/solver/analyze';
import type { Ruleset } from '../../../src/schema';
import { classicRuleset as classic } from '../helpers';

/** Ruleset, das Abbiegepfeile selbst erlaubt (wie das spaetere world5). */
const turnsRuleset: Ruleset = {
  ...classic,
  id: 'turns-test',
  movement: { ...classic.movement, model: 'turns' },
  special: { ...classic.special, oneWay: true },
};

function ok(result: EditResult): EditorState {
  if (!result.ok) throw new Error(`unerwartet abgelehnt: ${result.error}`);
  return result.state;
}

const rulesetOf = (s: EditorState): Ruleset =>
  s.rulesetId === classic.id ? classic : turnsRuleset;
const rulesFor = (s: EditorState) => rulesOfState(s, rulesetOf(s));
const place = (s: EditorState, spec: VehicleSpec): EditorState =>
  ok(placeVehicle(s, rulesFor(s), spec));
const arrow = (s: EditorState, x: number, y: number, dir: 'N' | 'E' | 'S' | 'W'): EditorState =>
  ok(toggleArrow(s, rulesFor(s), x, y, dir));

/** classic mit eingeschaltetem Override fuer Abbiegepfeile. */
const classicTurns = (): EditorState => setTurnsRule(newEditorState('classic'), true);

describe('Editor: Abbiegepfeile freischalten', () => {
  it('erlaubt Pfeile nur mit special.oneWay und turns', () => {
    expect(arrowsAllowed(rulesFor(newEditorState('classic')))).toBe(false);
    expect(arrowsAllowed(rulesFor(newEditorState('turns-test')))).toBe(true);
    const s = classicTurns();
    expect(arrowsAllowed(rulesFor(s))).toBe(true);
    expect(setTurnsRule(s, false)).toEqual(newEditorState('classic'));
  });

  it('schreibt den Override nur, wenn das Ruleset Pfeile nicht selbst erlaubt', () => {
    let s = place(classicTurns(), { x: 1, y: 0, dir: 'E', type: 's', color: 'blue' });
    expect(toLevel(s, classic).overrides).toEqual({
      movement: { model: 'turns' },
      special: { oneWay: true },
    });
    s = { ...s, rulesetId: 'turns-test' };
    expect(toLevel(s, turnsRuleset).overrides).toBeUndefined();
  });
});

describe('Editor: Pfeil-Werkzeug', () => {
  it('setzt, dreht auf die gewaehlte Richtung und entfernt bei gleicher Richtung', () => {
    let s = arrow(classicTurns(), 3, 2, 'N');
    expect(s.arrows).toEqual([[3, 2, 'N']]);
    s = arrow(s, 1, 1, 'W');
    expect(s.arrows).toEqual([
      [1, 1, 'W'],
      [3, 2, 'N'],
    ]);
    s = arrow(s, 3, 2, 'E');
    expect(s.arrows).toContainEqual([3, 2, 'E']);
    s = arrow(s, 3, 2, 'E');
    expect(s.arrows).toEqual([[1, 1, 'W']]);
    expect(toggleArrow(s, rulesFor(s), 6, 0, 'N')).toEqual({ ok: false, error: 'outOfBounds' });
  });

  it('dreht im Uhrzeigersinn und entfernt per Taste', () => {
    let s = arrow(classicTurns(), 2, 2, 'W');
    s = ok(rotateArrow(s, rulesFor(s), 2, 2));
    expect(s.arrows).toEqual([[2, 2, 'N']]);
    expect(rotateArrow(s, rulesFor(s), 0, 0)).toEqual({ ok: false, error: 'noArrow' });
    expect(removeArrow(s, rulesFor(s), 0, 0)).toEqual({ ok: false, error: 'noArrow' });
    s = ok(removeArrow(s, rulesFor(s), 2, 2));
    expect(s.arrows).toEqual([]);
  });

  it('ohne Freischaltung: kein Setzen oder Drehen, aber Entfernen', () => {
    const plain = newEditorState('classic');
    expect(toggleArrow(plain, rulesFor(plain), 2, 2, 'N')).toEqual({
      ok: false,
      error: 'oneWayDisabled',
    });
    const s = setTurnsRule(arrow(classicTurns(), 2, 2, 'N'), false);
    expect(toggleArrow(s, rulesFor(s), 2, 2, 'E')).toEqual({ ok: false, error: 'oneWayDisabled' });
    expect(rotateArrow(s, rulesFor(s), 2, 2)).toEqual({ ok: false, error: 'oneWayDisabled' });
    expect(ok(toggleArrow(s, rulesFor(s), 2, 2, 'N')).arrows).toEqual([]);
    expect(ok(removeArrow(s, rulesFor(s), 2, 2)).arrows).toEqual([]);
  });

  it('keine Pfeile unter Fahrzeugen oder Pollern und umgekehrt', () => {
    let s = place(classicTurns(), { x: 2, y: 2, dir: 'E', type: 's', color: 'blue' });
    s = ok(toggleFixed(s, rulesFor(s), 4, 4));
    const rules = rulesFor(s);
    expect(toggleArrow(s, rules, 1, 2, 'N')).toEqual({ ok: false, error: 'overlap' });
    expect(toggleArrow(s, rules, 4, 4, 'N')).toEqual({ ok: false, error: 'overlap' });
    s = arrow(s, 0, 0, 'S');
    expect(toggleFixed(s, rulesFor(s), 0, 0)).toEqual({ ok: false, error: 'overlap' });
    expect(
      placeVehicle(s, rulesFor(s), { x: 1, y: 0, dir: 'E', type: 's', color: 'blue' }),
    ).toEqual({ ok: false, error: 'overlap' });
    expect(moveVehicle(s, rulesFor(s), 'v1', 1, 0)).toEqual({ ok: false, error: 'overlap' });
  });

  it('entfernt Pfeile ausserhalb beim Verkleinern', () => {
    let s = arrow(arrow(classicTurns(), 5, 5, 'N'), 1, 1, 'E');
    s = ok(resizeGrid(s, rulesFor(s), 5, 5));
    expect(s.arrows).toEqual([[1, 1, 'E']]);
  });
});

describe('Editor: Ausfahr-Reihenfolge ueber Pfeile', () => {
  /** A (v1) faehrt nach rechts; B (v2) steht auf (3,1)/(4,1). */
  function base(): EditorState {
    let s = classicTurns();
    s = place(s, { x: 1, y: 3, dir: 'E', type: 's', color: 'blue' });
    s = place(s, { x: 4, y: 1, dir: 'E', type: 's', color: 'green' });
    return s;
  }

  it('ohne Pfeile wie bisher geradeaus', () => {
    expect(exitOrder(base(), rulesFor(base()))).toEqual(['v1', 'v2']);
  });

  it('ein Abbiegepfeil lenkt A nach oben, B blockiert ihn', () => {
    const s = arrow(base(), 3, 3, 'N');
    expect(exitOrder(s, rulesFor(s))).toEqual(['v2', 'v1']);
    expect(s.passengers).toEqual(['green', 'green', 'blue', 'blue']);
    expect(checkLevel(s, classic)).toEqual([]);
    const level = toLevel(s, classic);
    expect(analyze(level, rulesFor(s)).minMoves).toBe(2);
  });

  it('Falschfahrt blockiert dauerhaft', () => {
    const s = arrow(base(), 3, 3, 'W');
    expect(exitOrder(s, rulesFor(s))).toEqual(['v2', 'v1']);
  });

  it('Pfeil-Schleife blockiert und meldet oneWayInvalid', () => {
    let s = classicTurns();
    s = place(s, { x: 1, y: 1, dir: 'E', type: 's', color: 'blue' });
    s = place(s, { x: 5, y: 5, dir: 'S', type: 's', color: 'green' });
    s = arrow(arrow(arrow(arrow(s, 2, 1, 'E'), 3, 1, 'S'), 3, 2, 'W'), 2, 2, 'N');
    expect(exitOrder(s, rulesFor(s))).toEqual(['v2', 'v1']);
    expect(checkLevel(s, classic).map((i) => i.code)).toContain('oneWayInvalid');
  });
});

describe('Editor: Pfeile im Level', () => {
  it('meldet oneWayDisabled, wenn die Freischaltung fehlt', () => {
    let s = place(classicTurns(), { x: 1, y: 3, dir: 'E', type: 's', color: 'blue' });
    s = arrow(s, 3, 3, 'N');
    expect(checkLevel(setTurnsRule(s, false), classic)).toEqual([{ code: 'oneWayDisabled' }]);
  });

  it('schreibt Pfeile als oneWay-Zellen und liest sie zurueck', () => {
    let s = place(classicTurns(), { x: 1, y: 3, dir: 'E', type: 's', color: 'blue' });
    s = ok(toggleFixed(s, rulesFor(s), 0, 0));
    s = arrow(arrow(s, 3, 3, 'N'), 3, 1, 'E');
    const level = toLevel(s, classic);
    expect(level.grid.cells).toEqual([
      { x: 0, y: 0, type: 'fixed' },
      { x: 3, y: 1, type: 'oneWay', dir: 'E' },
      { x: 3, y: 3, type: 'oneWay', dir: 'N' },
    ]);
    const back = fromLevel(level, classic);
    expect(back).toEqual(s);
    expect(back.turnsRule).toBe(true);
    expect(toLevel(back, classic)).toEqual(level);
    // Auf einem Ruleset mit Pfeilen ist der Override ueberfluessig.
    const native = fromLevel(
      { ...level, ruleset: 'turns-test', overrides: undefined },
      turnsRuleset,
    );
    expect(native.turnsRule).toBeUndefined();
    expect(native.arrows).toEqual(s.arrows);
  });

  it('ohne Pfeile bleiben die Zellen des Levels unveraendert', () => {
    let s = place(classicTurns(), { x: 1, y: 3, dir: 'E', type: 's', color: 'blue' });
    s = setTurnsRule(ok(toggleFixed(s, rulesFor(s), 0, 0)), false);
    expect(toLevel(s, classic).grid.cells).toEqual([{ x: 0, y: 0, type: 'fixed' }]);
    expect(toLevel(s, classic).overrides).toEqual({ special: { fixed: true } });
  });
});
