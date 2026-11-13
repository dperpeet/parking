import { createGame, step } from '../../../src/engine';
import type { Action, GameEvent, GameState } from '../../../src/engine';
import { resolveRules } from '../../../src/schema';
import type {
  Dir,
  Level,
  LevelVehicle,
  ResolvedRules,
  RulesetOverrides,
} from '../../../src/schema';

import { classicRuleset } from '../helpers';

export const classic = classicRuleset;

export function rulesWith(overrides: RulesetOverrides = {}): ResolvedRules {
  return resolveRules(classic, overrides);
}

type VehicleExtras = Pick<LevelVehicle, 'locked' | 'keyId' | 'mystery'>;

/** Fahrzeug-Kurzform: Kopf (x, y), Blickrichtung, Typ (s/m/l), Farbe. */
export function v(
  id: string,
  x: number,
  y: number,
  dir: Dir,
  type: string,
  color: string,
  extra: VehicleExtras = {},
): LevelVehicle {
  return { id, pos: [x, y], dir, type, color, ...extra };
}

export interface LevelSpec {
  vehicles: LevelVehicle[];
  passengers: string[];
  cells?: Level['grid']['cells'];
  overrides?: RulesetOverrides;
  meta?: Level['meta'];
  seed?: number;
  size?: number;
}

export function makeLevel(spec: LevelSpec): Level {
  const size = spec.size ?? 6;
  return {
    schema: 'parking.level/1',
    id: 'test',
    title: 'Test',
    ruleset: 'classic',
    seed: spec.seed,
    overrides: spec.overrides,
    grid: { width: size, height: size, cells: spec.cells ?? [] },
    vehicles: spec.vehicles,
    passengers: spec.passengers,
    meta: spec.meta,
  };
}

export function setup(spec: LevelSpec, seed?: number): { state: GameState; rules: ResolvedRules } {
  const rules = rulesWith(spec.overrides);
  return { state: createGame(makeLevel(spec), rules, seed), rules };
}

export const tap = (vehicleId: string): Action => ({ type: 'tapVehicle', vehicleId });
export const power = (powerUp: 'undo' | 'shuffle' | 'extraSlot' | 'honk'): Action => ({
  type: 'usePowerUp',
  powerUp,
});

/** Fuehrt Aktionen nacheinander aus und sammelt alle Events. */
export function run(
  state: GameState,
  rules: ResolvedRules,
  actions: Action[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let cur = state;
  for (const action of actions) {
    const res = step(cur, action, rules);
    events.push(...res.events);
    cur = res.state;
  }
  return { state: cur, events };
}

export const taps = (ids: string[]): Action[] => ids.map(tap);

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Zwei einfache Fahrzeuge, die direkt am Rand stehen: a (blau), b (gruen). */
export const BASIC: LevelSpec = {
  vehicles: [v('a', 5, 0, 'E', 's', 'blue'), v('b', 5, 1, 'E', 's', 'green')],
  passengers: ['blue', 'blue', 'green', 'green'],
};

/** Vier Fahrzeuge am Rand, Fahrgaeste so, dass Warteschlangen-Effekte sichtbar werden. */
export const QUEUE4: LevelSpec = {
  vehicles: [
    v('a', 5, 0, 'E', 's', 'blue'),
    v('b', 5, 1, 'E', 's', 'green'),
    v('c', 5, 2, 'E', 's', 'pink'),
    v('d', 5, 3, 'E', 's', 'orange'),
  ],
  passengers: ['green', 'green', 'blue', 'blue', 'orange', 'orange', 'pink', 'pink'],
};

/** x und y blockieren sich gegenseitig, z ist frei. */
export const DEADLOCK: LevelSpec = {
  vehicles: [
    v('x', 1, 2, 'E', 's', 'green'),
    v('y', 3, 2, 'W', 's', 'green'),
    v('z', 5, 5, 'E', 's', 'blue'),
  ],
  passengers: ['blue', 'blue', 'green', 'green', 'green', 'green'],
};
