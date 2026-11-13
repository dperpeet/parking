// Level-Editor: reiner, DOM-freier Zustand und Operationen (immutabel). Verbindet sich nur mit Schema und Engine.
import { createRng, nextRandom, validateLevel } from '../engine';
import type { LevelIssue } from '../engine';
import { cellKey, inBounds, pathToEdge, vehicleCells } from '../engine/geometry';
import { Level, Ruleset, resolveRules } from '../schema';
import type { Dir, ResolvedRules, RulesetOverrides } from '../schema';

/** Rasterbreite/-hoehe, Halteplaetze und sichtbare Fahrgaeste: Grenzen direkt aus den Schemas. */
export const EDITOR_LIMITS = {
  grid: {
    min: Level.shape.grid.shape.width.minValue ?? 3,
    max: Level.shape.grid.shape.width.maxValue ?? 12,
  },
  slots: {
    min: Ruleset.shape.queue.shape.slots.minValue ?? 1,
    max: Ruleset.shape.queue.shape.slots.maxValue ?? 12,
  },
  visible: {
    min: Ruleset.shape.passengers.shape.visible.minValue ?? 1,
    max: Ruleset.shape.passengers.shape.visible.maxValue ?? 20,
  },
} as const;

export const EDITOR_DEFAULT_SIZE = 6;
/** Fenster fuer das optionale Mischen der Fahrgaeste. */
export const SHUFFLE_WINDOW_DEFAULT = 3;
export const SHUFFLE_WINDOW_MAX = 8;
export const SHUFFLE_SEED_DEFAULT = 1;
/** ID des Editor-Levels (Schema: ^[a-z0-9-]{1,32}$). */
export const EDITOR_LEVEL_ID = 'editor';
/** Titel, wenn der Nutzer keinen vergibt. */
export const EDITOR_DEFAULT_TITLE = { de: 'Eigenes Level', en: 'Custom level' } as const;

/** Reihenfolge der Drehung (im Uhrzeigersinn). */
export const DIR_CYCLE: readonly Dir[] = ['N', 'E', 'S', 'W'];

export interface EditorVehicle {
  id: string;
  /** Kopfzelle. */
  x: number;
  y: number;
  dir: Dir;
  type: string;
  color: string;
  /** Gesperrt, bis dieses Fahrzeug ausgefahren ist. */
  keyId?: string;
  /** Mystery-Fahrzeug: Farbe verdeckt, bis der Weg frei ist (nur mit special.mysteryVehicles). */
  mystery?: true;
}

export interface EditorState {
  rulesetId: string;
  width: number;
  height: number;
  vehicles: EditorVehicle[];
  /** Poller-Zellen (`fixed`). */
  fixed: Array<[number, number]>;
  /** Override fuer queue.slots; null = Wert des Rulesets. */
  slots: number | null;
  /** Override fuer passengers.visible; null = Wert des Rulesets. */
  visible: number | null;
  /** Power-up-Overrides eines importierten Levels (z. B. Hupe auf classic); der Editor aendert sie nicht, bewahrt sie aber. */
  powerups?: RulesetOverrides['powerups'];
  /** Override `special.mysteryVehicles` eines importierten Levels; wie `powerups` bewahrt, nicht vom Editor gesetzt. */
  mysteryRule?: true;
  title: string;
  nextId: number;
  passengers: string[];
  /** true: Fahrgaeste wurden manuell umsortiert und werden nicht mehr automatisch erzeugt. */
  manual: boolean;
  shuffle: { enabled: boolean; window: number; seed: number };
}

export type EditError =
  | 'outOfBounds'
  | 'overlap'
  | 'unknownType'
  | 'unknownColor'
  | 'unknownVehicle'
  | 'keySelf'
  | 'keyCycle'
  | 'badIndex';

export type EditResult = { ok: true; state: EditorState } | { ok: false; error: EditError };

export interface EditorIssue {
  code: LevelIssue['code'] | 'empty' | 'schema';
  vehicleId?: string;
}

export interface VehicleSpec {
  x: number;
  y: number;
  dir: Dir;
  type: string;
  color: string;
}

export function newEditorState(rulesetId: string): EditorState {
  return {
    rulesetId,
    width: EDITOR_DEFAULT_SIZE,
    height: EDITOR_DEFAULT_SIZE,
    vehicles: [],
    fixed: [],
    slots: null,
    visible: null,
    title: '',
    nextId: 1,
    passengers: [],
    manual: false,
    shuffle: { enabled: false, window: SHUFFLE_WINDOW_DEFAULT, seed: SHUFFLE_SEED_DEFAULT },
  };
}

// --- Regeln ---

/** Overrides des Editor-Zustands inkl. Sonderregeln, die das Ruleset nicht erlaubt, aber das Level nutzt. */
export function overridesOf(state: EditorState, ruleset: Ruleset): RulesetOverrides | undefined {
  const out: RulesetOverrides = {};
  if (state.slots !== null) out.queue = { slots: state.slots };
  if (state.visible !== null) out.passengers = { visible: state.visible };
  if (state.powerups && Object.keys(state.powerups).length > 0) out.powerups = state.powerups;
  const special: NonNullable<RulesetOverrides['special']> = {};
  if (state.fixed.length > 0 && !ruleset.special.fixed) special.fixed = true;
  if (state.vehicles.some((v) => v.keyId !== undefined) && !ruleset.special.keyVehicles) {
    special.keyVehicles = true;
  }
  if (state.mysteryRule && !ruleset.special.mysteryVehicles) special.mysteryVehicles = true;
  if (Object.keys(special).length > 0) out.special = special;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function rulesOfState(state: EditorState, ruleset: Ruleset): ResolvedRules {
  return resolveRules(ruleset, overridesOf(state, ruleset));
}

// --- Geometrie ---

function cellsOf(
  v: Pick<EditorVehicle, 'x' | 'y' | 'dir' | 'type'>,
  rules: ResolvedRules,
): Array<[number, number]> {
  const type = rules.vehicles.types[v.type];
  return type ? vehicleCells({ x: v.x, y: v.y, dir: v.dir, length: type.length }) : [];
}

/** Zellen eines Fahrzeugs (leer bei unbekanntem Typ). */
export function vehicleCellsOf(v: EditorVehicle, rules: ResolvedRules): Array<[number, number]> {
  return cellsOf(v, rules);
}

/** Zelle -> Fahrzeug-ID. */
export function occupancy(
  state: EditorState,
  rules: ResolvedRules,
  skipId?: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of state.vehicles) {
    if (v.id === skipId) continue;
    for (const [x, y] of cellsOf(v, rules)) map.set(cellKey(x, y), v.id);
  }
  return map;
}

export function fixedSet(state: EditorState): Set<string> {
  return new Set(state.fixed.map(([x, y]) => cellKey(x, y)));
}

/** Prueft eine Platzierung gegen Raster, Fahrzeuge (ausser `skipId`) und Poller. */
export function placementError(
  state: EditorState,
  rules: ResolvedRules,
  spec: VehicleSpec,
  skipId?: string,
): EditError | null {
  if (!rules.vehicles.types[spec.type]) return 'unknownType';
  if (!rules.vehicles.colors.includes(spec.color)) return 'unknownColor';
  const cells = cellsOf(spec, rules);
  if (cells.some(([x, y]) => !inBounds(state, x, y))) return 'outOfBounds';
  const taken = occupancy(state, rules, skipId);
  const fixed = fixedSet(state);
  if (cells.some(([x, y]) => taken.has(cellKey(x, y)) || fixed.has(cellKey(x, y))))
    return 'overlap';
  return null;
}

// --- Fahrgaeste ---

/** Ausfahr-Reihenfolge: wiederholt alle Fahrzeuge mit freiem Weg (und entsperrt) entfernen. Rest haengt hinten an. */
export function exitOrder(state: EditorState, rules: ResolvedRules): string[] {
  const grid = { width: state.width, height: state.height };
  const fixed = fixedSet(state);
  let remaining = [...state.vehicles];
  const gone = new Set<string>();
  const order: string[] = [];
  while (remaining.length > 0) {
    const taken = new Set<string>();
    for (const v of remaining) for (const [x, y] of cellsOf(v, rules)) taken.add(cellKey(x, y));
    const free = remaining.filter((v) => {
      if (v.keyId !== undefined && !gone.has(v.keyId)) return false;
      return pathToEdge(v, grid).every(
        ([x, y]) => !taken.has(cellKey(x, y)) && !fixed.has(cellKey(x, y)),
      );
    });
    if (free.length === 0) {
      order.push(...remaining.map((v) => v.id));
      break;
    }
    for (const v of free) {
      order.push(v.id);
      gone.add(v.id);
    }
    remaining = remaining.filter((v) => !gone.has(v.id));
  }
  return order;
}

/** Mischt `seq` mit seedbarem PRNG: jede Stelle zieht aus den naechsten `window` Eintraegen. */
export function shuffleInWindow(seq: readonly string[], window: number, seed: number): string[] {
  const out = [...seq];
  let rng = createRng(seed);
  for (let i = 0; i < out.length; i++) {
    const span = Math.min(Math.max(window, 1), out.length - i);
    const [value, next] = nextRandom(rng);
    rng = next;
    const j = i + Math.floor(value * span);
    const tmp = out[i] as string;
    out[i] = out[j] as string;
    out[j] = tmp;
  }
  return out;
}

/** Fahrgaeste: je Fahrzeug in Ausfahr-Reihenfolge `capacity` Fahrgaeste seiner Farbe, optional gemischt. */
export function generatePassengers(state: EditorState, rules: ResolvedRules): string[] {
  const byId = new Map(state.vehicles.map((v) => [v.id, v]));
  const seq: string[] = [];
  for (const id of exitOrder(state, rules)) {
    const v = byId.get(id);
    const cap = v ? (rules.vehicles.types[v.type]?.capacity ?? 0) : 0;
    for (let i = 0; i < cap; i++) seq.push(v?.color ?? '');
  }
  return state.shuffle.enabled
    ? shuffleInWindow(seq, state.shuffle.window, state.shuffle.seed)
    : seq;
}

/** Erzeugt Fahrgaeste neu und hebt die manuelle Sortierung auf. */
export function regeneratePassengers(state: EditorState, rules: ResolvedRules): EditorState {
  return { ...state, manual: false, passengers: generatePassengers(state, rules) };
}

function refresh(state: EditorState, rules: ResolvedRules): EditorState {
  return state.manual ? state : { ...state, passengers: generatePassengers(state, rules) };
}

/** Vertauscht zwei Fahrgaeste (setzt `manual`). */
export function swapPassengers(state: EditorState, i: number, j: number): EditResult {
  const n = state.passengers.length;
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) {
    return { ok: false, error: 'badIndex' };
  }
  const passengers = [...state.passengers];
  passengers[i] = state.passengers[j] as string;
  passengers[j] = state.passengers[i] as string;
  return { ok: true, state: { ...state, manual: true, passengers } };
}

export function setShuffle(
  state: EditorState,
  rules: ResolvedRules,
  patch: Partial<EditorState['shuffle']>,
): EditorState {
  const window = Math.min(Math.max(patch.window ?? state.shuffle.window, 1), SHUFFLE_WINDOW_MAX);
  const next = { ...state, shuffle: { ...state.shuffle, ...patch, window } };
  return regeneratePassengers(next, rules);
}

// --- Operationen ---

const fail = (error: EditError): EditResult => ({ ok: false, error });

/** Fahrzeug setzen (Kopf auf x/y). */
export function placeVehicle(
  state: EditorState,
  rules: ResolvedRules,
  spec: VehicleSpec,
): EditResult {
  const error = placementError(state, rules, spec);
  if (error) return fail(error);
  const vehicle: EditorVehicle = { id: `v${state.nextId}`, ...spec };
  const next = { ...state, nextId: state.nextId + 1, vehicles: [...state.vehicles, vehicle] };
  return { ok: true, state: refresh(next, rules) };
}

function replaceVehicle(state: EditorState, rules: ResolvedRules, v: EditorVehicle): EditResult {
  const next = { ...state, vehicles: state.vehicles.map((o) => (o.id === v.id ? v : o)) };
  return { ok: true, state: refresh(next, rules) };
}

/** Kopf auf eine neue Zelle verschieben (Richtung bleibt). */
export function moveVehicle(
  state: EditorState,
  rules: ResolvedRules,
  id: string,
  x: number,
  y: number,
): EditResult {
  const v = state.vehicles.find((o) => o.id === id);
  if (!v) return fail('unknownVehicle');
  const moved = { ...v, x, y };
  const error = placementError(state, rules, moved, id);
  return error ? fail(error) : replaceVehicle(state, rules, moved);
}

/** Dreht im Uhrzeigersinn um die Kopfzelle; ungueltige Richtungen werden uebersprungen. */
export function rotateVehicle(state: EditorState, rules: ResolvedRules, id: string): EditResult {
  const v = state.vehicles.find((o) => o.id === id);
  if (!v) return fail('unknownVehicle');
  const start = DIR_CYCLE.indexOf(v.dir);
  let firstError: EditError = 'outOfBounds';
  for (let step = 1; step < DIR_CYCLE.length; step++) {
    const dir = DIR_CYCLE[(start + step) % DIR_CYCLE.length] as Dir;
    const error = placementError(state, rules, { ...v, dir }, id);
    if (!error) return replaceVehicle(state, rules, { ...v, dir });
    if (step === 1) firstError = error;
  }
  return fail(firstError);
}

/** Entfernt ein Fahrzeug; Fahrzeuge, die es als Schluessel hatten, werden entsperrt. */
export function removeVehicle(state: EditorState, rules: ResolvedRules, id: string): EditResult {
  if (!state.vehicles.some((v) => v.id === id)) return fail('unknownVehicle');
  const vehicles = state.vehicles
    .filter((v) => v.id !== id)
    .map((v) => {
      if (v.keyId !== id) return v;
      const { keyId, ...rest } = v;
      void keyId;
      return rest;
    });
  return { ok: true, state: refresh({ ...state, vehicles }, rules) };
}

/** Poller-Zelle umschalten; auf Fahrzeugen nicht erlaubt. */
export function toggleFixed(
  state: EditorState,
  rules: ResolvedRules,
  x: number,
  y: number,
): EditResult {
  if (!inBounds(state, x, y)) return fail('outOfBounds');
  const key = cellKey(x, y);
  const has = state.fixed.some(([fx, fy]) => cellKey(fx, fy) === key);
  if (!has && occupancy(state, rules).has(key)) return fail('overlap');
  const fixed: Array<[number, number]> = has
    ? state.fixed.filter(([fx, fy]) => cellKey(fx, fy) !== key)
    : sortCells([...state.fixed, [x, y]]);
  return { ok: true, state: refresh({ ...state, fixed }, rules) };
}

/** Sperrt `id` bis `keyId` ausgefahren ist (null = entsperren). Zyklen und Selbstbezug werden abgelehnt. */
export function setKey(
  state: EditorState,
  rules: ResolvedRules,
  id: string,
  keyId: string | null,
): EditResult {
  const v = state.vehicles.find((o) => o.id === id);
  if (!v) return fail('unknownVehicle');
  if (keyId === null) {
    const { keyId: dropped, ...rest } = v;
    void dropped;
    return replaceVehicle(state, rules, rest);
  }
  if (keyId === id) return fail('keySelf');
  if (!state.vehicles.some((o) => o.id === keyId)) return fail('unknownVehicle');
  // Kette ab dem Schluessel darf nicht zu `id` zurueckfuehren.
  const byId = new Map(state.vehicles.map((o) => [o.id, o]));
  const seen = new Set<string>();
  for (
    let cur: string | undefined = keyId;
    cur !== undefined && !seen.has(cur);
    cur = byId.get(cur)?.keyId
  ) {
    if (cur === id) return fail('keyCycle');
    seen.add(cur);
  }
  return replaceVehicle(state, rules, { ...v, keyId });
}

/**
 * Markiert `id` als Mystery-Fahrzeug oder hebt die Markierung auf. Erlaubt unabhaengig vom Ruleset, damit eine
 * Markierung nach einem Regelwerk-Wechsel entfernt werden kann; ohne `special.mysteryVehicles` meldet
 * `checkLevel` dann `mysteryDisabled`. Fahrgaeste bleiben unveraendert (reine Darstellung).
 */
export function setMystery(state: EditorState, id: string, mystery: boolean): EditResult {
  const v = state.vehicles.find((o) => o.id === id);
  if (!v) return fail('unknownVehicle');
  const { mystery: dropped, ...rest } = v;
  void dropped;
  const next: EditorVehicle = mystery ? { ...rest, mystery: true } : rest;
  return {
    ok: true,
    state: { ...state, vehicles: state.vehicles.map((o) => (o.id === id ? next : o)) },
  };
}

/** Rastergroesse aendern. Fahrzeuge muessen weiter passen (sonst abgelehnt); Poller ausserhalb entfallen. */
export function resizeGrid(
  state: EditorState,
  rules: ResolvedRules,
  width: number,
  height: number,
): EditResult {
  const { min, max } = EDITOR_LIMITS.grid;
  const w = Math.min(Math.max(Math.round(width), min), max);
  const h = Math.min(Math.max(Math.round(height), min), max);
  const next = {
    ...state,
    width: w,
    height: h,
    fixed: state.fixed.filter(([x, y]) => inBounds({ width: w, height: h }, x, y)),
  };
  for (const v of state.vehicles) {
    if (cellsOf(v, rules).some(([x, y]) => !inBounds(next, x, y))) return fail('outOfBounds');
  }
  return { ok: true, state: refresh(next, rules) };
}

// --- Level <-> Zustand ---

/** Editor-Zustand -> Level (nicht zwingend gueltig, siehe `checkLevel`). */
export function toLevel(state: EditorState, ruleset: Ruleset): Level {
  const title = state.title.trim();
  const overrides = overridesOf(state, ruleset);
  return {
    schema: 'parking.level/1',
    id: EDITOR_LEVEL_ID,
    title: title === '' ? { ...EDITOR_DEFAULT_TITLE } : title,
    ruleset: state.rulesetId,
    ...(overrides ? { overrides } : {}),
    grid: {
      width: state.width,
      height: state.height,
      cells: state.fixed.map(([x, y]) => ({ x, y, type: 'fixed' as const })),
    },
    vehicles: state.vehicles.map((v) => ({
      id: v.id,
      pos: [v.x, v.y] as [number, number],
      dir: v.dir,
      type: v.type,
      color: v.color,
      ...(v.keyId !== undefined ? { locked: true, keyId: v.keyId } : {}),
      ...(v.mystery ? { mystery: true } : {}),
    })),
    passengers: [...state.passengers],
  };
}

/** Level -> Editor-Zustand. Nur `fixed`-Zellen, Schluessel und Mystery-Markierungen werden uebernommen. */
export function fromLevel(level: Level, ruleset: Ruleset): EditorState {
  const vehicles: EditorVehicle[] = level.vehicles.map((v) => ({
    id: v.id,
    x: v.pos[0],
    y: v.pos[1],
    dir: v.dir,
    type: v.type,
    color: v.color,
    ...(v.locked && v.keyId !== undefined ? { keyId: v.keyId } : {}),
    ...(v.mystery ? { mystery: true as const } : {}),
  }));
  const nums = vehicles.map((v) => Number(/^v(\d+)$/.exec(v.id)?.[1] ?? 0));
  const base: EditorState = {
    ...newEditorState(level.ruleset),
    width: level.grid.width,
    height: level.grid.height,
    vehicles,
    fixed: level.grid.cells
      .filter((c) => c.type === 'fixed')
      .map((c) => [c.x, c.y] as [number, number]),
    slots: level.overrides?.queue?.slots ?? null,
    visible: level.overrides?.passengers?.visible ?? null,
    ...(level.overrides?.powerups ? { powerups: level.overrides.powerups } : {}),
    ...(level.overrides?.special?.mysteryVehicles && !ruleset.special.mysteryVehicles
      ? { mysteryRule: true as const }
      : {}),
    title:
      typeof level.title === 'string'
        ? level.title
        : isDefaultTitle(level.title)
          ? ''
          : level.title.de,
    nextId: Math.max(0, ...nums) + 1,
    passengers: [...level.passengers],
  };
  const rules = rulesOfState(base, ruleset);
  const auto = generatePassengers(base, rules);
  return { ...base, manual: auto.join() !== base.passengers.join() };
}

function isDefaultTitle(title: { de: string; en: string }): boolean {
  return title.de === EDITOR_DEFAULT_TITLE.de && title.en === EDITOR_DEFAULT_TITLE.en;
}

/** Probleme, die ein Teilen/Speichern/Testen verhindern (leer = Level ist gueltig). */
export function checkLevel(state: EditorState, ruleset: Ruleset): EditorIssue[] {
  if (state.vehicles.length === 0) return [{ code: 'empty' }];
  const level = toLevel(state, ruleset);
  const issues: EditorIssue[] = [];
  if (!Level.safeParse(level).success) issues.push({ code: 'schema' });
  for (const i of validateLevel(level, rulesOfState(state, ruleset))) {
    issues.push(
      i.vehicleId === undefined ? { code: i.code } : { code: i.code, vehicleId: i.vehicleId },
    );
  }
  return issues;
}

/** Zellen zeilenweise sortieren (stabile Reihenfolge fuer Level und Vergleiche). */
function sortCells(cells: Array<[number, number]>): Array<[number, number]> {
  return [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
