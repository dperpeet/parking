import { describe, expect, it } from 'vitest';
import classicJson from '../../../src/content/rulesets/classic.json';
import { createGame } from '../../../src/engine';
import { analyze } from '../../../src/solver/analyze';
import { Level, Ruleset } from '../../../src/schema';
import {
  EDITOR_LIMITS,
  checkLevel,
  exitOrder,
  fromLevel,
  generatePassengers,
  moveVehicle,
  newEditorState,
  placeVehicle,
  placementError,
  regeneratePassengers,
  removeVehicle,
  resizeGrid,
  rotateVehicle,
  rulesOfState,
  setKey,
  setShuffle,
  shuffleInWindow,
  swapPassengers,
  toLevel,
  toggleFixed,
} from '../../../src/app/editor-model';
import type { EditResult, EditorState, VehicleSpec } from '../../../src/app/editor-model';
import { loadRulesets } from '../../../src/app/editor-rulesets';
import { level as level007 } from '../helpers';

const ruleset = Ruleset.parse(classicJson);
const rulesFor = (s: EditorState) => rulesOfState(s, ruleset);

/** Operation ausfuehren und Erfolg erzwingen. */
function ok(result: EditResult): EditorState {
  if (!result.ok) throw new Error(`unerwartet abgelehnt: ${result.error}`);
  return result.state;
}

function place(state: EditorState, spec: VehicleSpec): EditorState {
  return ok(placeVehicle(state, rulesFor(state), spec));
}

/** B (gruen) blockiert A (blau): Reihenfolge B, A. A = v1, B = v2. */
function example(): EditorState {
  let s = newEditorState('classic');
  s = place(s, { x: 2, y: 2, dir: 'S', type: 's', color: 'blue' });
  s = place(s, { x: 3, y: 4, dir: 'E', type: 's', color: 'green' });
  return s;
}

describe('Grenzen und Rulesets', () => {
  it('leitet Grenzen aus den Schemas ab', () => {
    expect(EDITOR_LIMITS.grid).toEqual({ min: 3, max: 12 });
    expect(EDITOR_LIMITS.slots).toEqual({ min: 1, max: 12 });
    expect(EDITOR_LIMITS.visible).toEqual({ min: 1, max: 20 });
  });

  it('laedt Rulesets und ignoriert kaputte', () => {
    const list = loadRulesets({ a: classicJson, b: { nope: true } });
    expect(list.map((r) => r.id)).toEqual(['classic']);
    expect(loadRulesets().some((r) => r.id === 'classic')).toBe(true);
  });
});

describe('Platzieren', () => {
  it('setzt den Kopf auf die Zelle, Schwanz entgegen der Blickrichtung', () => {
    const s = place(newEditorState('classic'), { x: 2, y: 2, dir: 'S', type: 'm', color: 'blue' });
    expect(s.vehicles).toHaveLength(1);
    const level = toLevel(s, ruleset);
    expect(level.vehicles[0]?.pos).toEqual([2, 2]);
  });

  it('lehnt Platzierung ausserhalb, Ueberlappung und Poller ab', () => {
    let s = place(newEditorState('classic'), { x: 1, y: 0, dir: 'E', type: 's', color: 'blue' });
    const rules = rulesFor(s);
    // Schwanz ragt links aus dem Raster.
    expect(placeVehicle(s, rules, { x: 0, y: 3, dir: 'E', type: 's', color: 'blue' })).toEqual({
      ok: false,
      error: 'outOfBounds',
    });
    // Kopf ausserhalb rechts.
    expect(placementError(s, rules, { x: 6, y: 0, dir: 'W', type: 's', color: 'blue' })).toBe(
      'outOfBounds',
    );
    expect(placementError(s, rules, { x: 1, y: 0, dir: 'S', type: 's', color: 'blue' })).toBe(
      'outOfBounds',
    );
    // Ueberlappung mit dem ersten Fahrzeug.
    expect(placementError(s, rules, { x: 1, y: 1, dir: 'S', type: 's', color: 'blue' })).toBe(
      'overlap',
    );
    s = ok(toggleFixed(s, rules, 4, 4));
    expect(placementError(s, rules, { x: 4, y: 5, dir: 'S', type: 's', color: 'blue' })).toBe(
      'overlap',
    );
    expect(placementError(s, rules, { x: 3, y: 3, dir: 'E', type: 'x', color: 'blue' })).toBe(
      'unknownType',
    );
    expect(placementError(s, rules, { x: 3, y: 3, dir: 'E', type: 's', color: 'nope' })).toBe(
      'unknownColor',
    );
  });

  it('vergibt fortlaufende IDs, auch nach dem Entfernen', () => {
    let s = example();
    s = ok(removeVehicle(s, rulesFor(s), 'v1'));
    s = place(s, { x: 1, y: 5, dir: 'E', type: 's', color: 'pink' });
    expect(s.vehicles.map((v) => v.id)).toEqual(['v2', 'v3']);
  });
});

describe('Drehen, Verschieben, Entfernen', () => {
  it('dreht im Uhrzeigersinn und ueberspringt ungueltige Richtungen am Rand', () => {
    // Kopf in der Ecke oben links, Blick nach E (Schwanz links ausserhalb waere ungueltig, daher S/E).
    let s = place(newEditorState('classic'), { x: 0, y: 2, dir: 'S', type: 's', color: 'blue' });
    const rules = rulesFor(s);
    s = ok(rotateVehicle(s, rules, 'v1'));
    // E: Schwanz bei x=-1 ungueltig, W: Kopf bei 0,2 mit Schwanz bei x=1 gueltig.
    expect(s.vehicles[0]?.dir).toBe('W');
  });

  it('lehnt Drehen ab, wenn keine Richtung passt', () => {
    let s = newEditorState('classic');
    s = ok(resizeGrid(s, rulesFor(s), 3, 3));
    s = place(s, { x: 2, y: 0, dir: 'E', type: 'm', color: 'blue' });
    // Der Poller sperrt die letzte Richtung (N: Schwanz nach unten).
    s = ok(toggleFixed(s, rulesFor(s), 2, 1));
    expect(rotateVehicle(s, rulesFor(s), 'v1')).toEqual({ ok: false, error: 'outOfBounds' });
  });

  it('verschiebt mit Kollisionspruefung', () => {
    const s = example();
    const rules = rulesFor(s);
    expect(moveVehicle(s, rules, 'v1', 2, 4)).toEqual({ ok: false, error: 'overlap' });
    expect(moveVehicle(s, rules, 'v1', 2, 5)).toEqual({ ok: false, error: 'overlap' });
    expect(moveVehicle(s, rules, 'v1', 9, 9)).toEqual({ ok: false, error: 'outOfBounds' });
    expect(moveVehicle(s, rules, 'zz', 1, 1)).toEqual({ ok: false, error: 'unknownVehicle' });
    // Das Fahrzeug darf seine eigenen Zellen ueberdecken.
    const moved = ok(moveVehicle(s, rules, 'v1', 2, 3));
    expect(moved.vehicles[0]).toMatchObject({ x: 2, y: 3 });
  });

  it('entfernt Fahrzeuge und entsperrt abhaengige', () => {
    let s = example();
    s = ok(setKey(s, rulesFor(s), 'v1', 'v2'));
    expect(s.vehicles[0]?.keyId).toBe('v2');
    s = ok(removeVehicle(s, rulesFor(s), 'v2'));
    expect(s.vehicles[0]?.keyId).toBeUndefined();
    expect(removeVehicle(s, rulesFor(s), 'v2')).toEqual({ ok: false, error: 'unknownVehicle' });
  });

  it('schaltet Poller um, nicht auf Fahrzeugen und nicht ausserhalb', () => {
    let s = example();
    const rules = rulesFor(s);
    expect(toggleFixed(s, rules, 2, 2)).toEqual({ ok: false, error: 'overlap' });
    expect(toggleFixed(s, rules, 6, 0)).toEqual({ ok: false, error: 'outOfBounds' });
    s = ok(toggleFixed(s, rules, 5, 5));
    s = ok(toggleFixed(s, rules, 0, 5));
    expect(s.fixed).toEqual([
      [0, 5],
      [5, 5],
    ]);
    s = ok(toggleFixed(s, rules, 0, 5));
    expect(s.fixed).toEqual([[5, 5]]);
  });

  it('aendert die Rastergroesse nur, wenn alles passt', () => {
    let s = example();
    const rules = rulesFor(s);
    s = ok(toggleFixed(s, rules, 5, 5));
    expect(resizeGrid(s, rules, 3, 3)).toEqual({ ok: false, error: 'outOfBounds' });
    const small = ok(resizeGrid(s, rules, 5, 5));
    expect(small.fixed).toEqual([]);
    expect(ok(resizeGrid(s, rules, 99, 6)).width).toBe(EDITOR_LIMITS.grid.max);
  });
});

describe('Schluessel', () => {
  function three(): EditorState {
    let s = newEditorState('classic');
    s = place(s, { x: 1, y: 0, dir: 'E', type: 's', color: 'blue' });
    s = place(s, { x: 1, y: 2, dir: 'E', type: 's', color: 'green' });
    s = place(s, { x: 1, y: 4, dir: 'E', type: 's', color: 'pink' });
    return s;
  }

  it('lehnt Selbstbezug, Unbekanntes und Zyklen ab', () => {
    let s = three();
    const rules = rulesFor(s);
    expect(setKey(s, rules, 'v1', 'v1')).toEqual({ ok: false, error: 'keySelf' });
    expect(setKey(s, rules, 'v1', 'v9')).toEqual({ ok: false, error: 'unknownVehicle' });
    s = ok(setKey(s, rules, 'v1', 'v2'));
    expect(setKey(s, rules, 'v2', 'v1')).toEqual({ ok: false, error: 'keyCycle' });
    s = ok(setKey(s, rules, 'v2', 'v3'));
    // v3 -> v1 schliesst den Kreis v1 -> v2 -> v3 -> v1.
    expect(setKey(s, rules, 'v3', 'v1')).toEqual({ ok: false, error: 'keyCycle' });
    s = ok(setKey(s, rules, 'v1', null));
    expect(s.vehicles[0]?.keyId).toBeUndefined();
  });

  it('beachtet Schluessel in der Ausfahr-Reihenfolge und im Level', () => {
    let s = three();
    s = ok(setKey(s, rulesFor(s), 'v1', 'v3'));
    expect(exitOrder(s, rulesFor(s))).toEqual(['v2', 'v3', 'v1']);
    const level = toLevel(s, ruleset);
    expect(level.vehicles[0]).toMatchObject({ locked: true, keyId: 'v3' });
    // classic erlaubt keine Schluessel: das Level schaltet die Sonderregel per Override frei.
    expect(level.overrides?.special).toEqual({ keyVehicles: true });
    expect(checkLevel(s, ruleset)).toEqual([]);
  });
});

describe('Fahrgaeste', () => {
  it('erzeugt je Farbe die Summe der Kapazitaeten', () => {
    let s = example();
    s = place(s, { x: 5, y: 0, dir: 'E', type: 'l', color: 'blue' });
    const counts = new Map<string, number>();
    for (const c of s.passengers) counts.set(c, (counts.get(c) ?? 0) + 1);
    // s: 2 Plaetze, l: 6 Plaetze.
    expect(counts.get('blue')).toBe(8);
    expect(counts.get('green')).toBe(2);
    expect(s.passengers).toHaveLength(10);
  });

  it('folgt der Ausfahr-Reihenfolge (Blocker zuerst)', () => {
    const s = example();
    expect(exitOrder(s, rulesFor(s))).toEqual(['v2', 'v1']);
    expect(s.passengers).toEqual(['green', 'green', 'blue', 'blue']);
  });

  it('haengt blockierte Zyklen hinten an und beachtet Poller', () => {
    let s = newEditorState('classic');
    s = place(s, { x: 1, y: 0, dir: 'E', type: 's', color: 'blue' });
    s = place(s, { x: 5, y: 3, dir: 'S', type: 's', color: 'green' });
    expect(exitOrder(s, rulesFor(s))).toEqual(['v1', 'v2']);
    s = ok(toggleFixed(s, rulesFor(s), 4, 0));
    // v1 ist durch den Poller blockiert, v2 faehrt zuerst.
    expect(exitOrder(s, rulesFor(s))).toEqual(['v2', 'v1']);
    expect(s.passengers).toEqual(['green', 'green', 'blue', 'blue']);
    expect(toLevel(s, ruleset).overrides?.special).toEqual({ fixed: true });
  });

  it('mischt deterministisch mit Seed und innerhalb des Fensters', () => {
    const seq = Array.from({ length: 30 }, (_, i) => `c${i}`);
    expect(shuffleInWindow(seq, 4, 7)).toEqual(shuffleInWindow(seq, 4, 7));
    expect(shuffleInWindow(seq, 4, 7)).not.toEqual(shuffleInWindow(seq, 4, 8));
    expect(shuffleInWindow(seq, 1, 7)).toEqual(seq);
    expect([...shuffleInWindow(seq, 4, 7)].sort()).toEqual([...seq].sort());
  });

  it('setShuffle erzeugt neu und bleibt kapazitaetsgleich', () => {
    let s = example();
    s = place(s, { x: 2, y: 5, dir: 'E', type: 'm', color: 'orange' });
    s = place(s, { x: 4, y: 0, dir: 'N', type: 'l', color: 'pink' });
    const base = [...s.passengers];
    const a = setShuffle(s, rulesFor(s), { enabled: true, window: 6, seed: 3 });
    const b = setShuffle(s, rulesFor(s), { enabled: true, window: 6, seed: 3 });
    expect(a.passengers).toEqual(b.passengers);
    expect([...a.passengers].sort()).toEqual([...base].sort());
    expect(a.passengers).not.toEqual(base);
    expect(generatePassengers(a, rulesFor(a))).toEqual(a.passengers);
    // Fenster wird auf die Grenzen begrenzt.
    expect(setShuffle(a, rulesFor(a), { window: 0 }).shuffle.window).toBe(1);
  });

  it('tauscht manuell und erzeugt danach nicht mehr automatisch', () => {
    let s = example();
    s = ok(swapPassengers(s, 0, 3));
    expect(s.manual).toBe(true);
    expect(s.passengers).toEqual(['blue', 'green', 'blue', 'green']);
    expect(swapPassengers(s, 0, 9)).toEqual({ ok: false, error: 'badIndex' });
    const before = [...s.passengers];
    s = place(s, { x: 1, y: 0, dir: 'E', type: 's', color: 'pink' });
    expect(s.passengers).toEqual(before);
    expect(checkLevel(s, ruleset).map((i) => i.code)).toContain('passengerMismatch');
    s = regeneratePassengers(s, rulesFor(s));
    expect(s.manual).toBe(false);
    expect(checkLevel(s, ruleset)).toEqual([]);
  });
});

describe('Level-Umwandlung', () => {
  it('ergibt ein gueltiges, loesbares Level', () => {
    let s = example();
    s = { ...s, title: '  Mein Level ' };
    expect(checkLevel(s, ruleset)).toEqual([]);
    const level = toLevel(s, ruleset);
    expect(Level.safeParse(level).success).toBe(true);
    expect(level.title).toBe('Mein Level');
    const rules = rulesFor(s);
    expect(() => createGame(level, rules)).not.toThrow();
    const result = analyze(level, rules);
    expect(result.solvable).toBe(true);
    expect(result.minMoves).toBe(2);
  });

  it('schreibt Overrides nur bei Abweichung', () => {
    let s = example();
    expect(toLevel(s, ruleset).overrides).toBeUndefined();
    s = { ...s, slots: 3, visible: 4 };
    expect(toLevel(s, ruleset).overrides).toEqual({
      queue: { slots: 3 },
      passengers: { visible: 4 },
    });
    expect(rulesFor(s).queue.slots).toBe(3);
  });

  it('meldet leere und ungueltige Level', () => {
    expect(checkLevel(newEditorState('classic'), ruleset)).toEqual([{ code: 'empty' }]);
    let s = example();
    s = { ...s, vehicles: s.vehicles.map((v) => ({ ...v, type: 'zz' })) };
    expect(checkLevel(s, ruleset).length).toBeGreaterThan(0);
  });

  it('fromLevel(toLevel(x)) ist stabil', () => {
    let s = example();
    s = place(s, { x: 2, y: 5, dir: 'E', type: 'm', color: 'orange' });
    s = ok(toggleFixed(s, rulesFor(s), 5, 0));
    s = ok(setKey(s, rulesFor(s), 'v1', 'v2'));
    s = { ...s, title: 'Titel', slots: 4, visible: 6 };
    const level = toLevel(s, ruleset);
    const back = fromLevel(level, ruleset);
    expect(back).toEqual({ ...s, rulesetId: 'classic' });
    expect(toLevel(back, ruleset)).toEqual(level);
  });

  it('uebernimmt Kampagnenlevel und markiert abweichende Fahrgaeste als manuell', () => {
    const state = fromLevel(level007, ruleset);
    const level = toLevel(state, ruleset);
    expect(level.vehicles).toHaveLength(level007.vehicles.length);
    expect(level.passengers).toEqual(level007.passengers);
    expect(checkLevel(state, ruleset)).toEqual([]);
    const regenerated = regeneratePassengers(state, rulesFor(state));
    expect(regenerated.passengers).toHaveLength(level007.passengers.length);
    expect(analyze(toLevel(regenerated, ruleset), rulesFor(regenerated)).solvable).toBe(true);
  });

  it('behandelt lokalisierte Titel', () => {
    const level: Level = { ...toLevel(example(), ruleset), title: { de: 'Hallo', en: 'Hello' } };
    expect(fromLevel(level, ruleset).title).toBe('Hallo');
    expect(fromLevel(toLevel(example(), ruleset), ruleset).title).toBe('');
  });
});
