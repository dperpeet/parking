import type { Dir, ResolvedRules } from '../../schema';
import { cellKey, exitPath, fixedCells, parkedOccupancy } from '../geometry';
import type { Point } from '../geometry';
import type { GameEvent, GameState, VehicleState } from '../types';
import { hasEmptySlot, targetSlot } from './slots';

export type TapCheck =
  | { ok: true; path: Point[]; exitDir: Dir }
  | { ok: false; reason: 'path' | 'queueFull' | 'locked'; blockerId: string | null };

export type Obstacle =
  { kind: 'fixed' } | { kind: 'wrongWay' } | { kind: 'vehicle'; vehicleId: string };

/**
 * Erstes Hindernis (geparktes Fahrzeug, fixed-Zelle oder Falschfahrt-Pfeil) auf dem (ggf. gebogenen) Weg von `v`
 * zum Rand, sonst `null`. Eine abgebrochene Pfeil-Schleife zaehlt wie eine Falschfahrt.
 */
export function firstObstacle(state: GameState, v: VehicleState): Obstacle | null {
  const occupancy = parkedOccupancy(state);
  const fixed = fixedCells(state.grid);
  const exit = exitPath(v, state.grid);
  for (const [x, y] of exit.path) {
    const key = cellKey(x, y);
    const blocker = occupancy.get(key);
    if (blocker !== undefined) return { kind: 'vehicle', vehicleId: blocker };
    if (fixed.has(key)) return { kind: 'fixed' };
  }
  if (exit.wrongWay !== null || exit.loop) return { kind: 'wrongWay' };
  return null;
}

/** Prueft die Regeln fuer das Antippen: locked > path > queueFull. */
export function checkTap(state: GameState, v: VehicleState): TapCheck {
  if (v.locked) return { ok: false, reason: 'locked', blockerId: null };
  const obstacle = firstObstacle(state, v);
  if (obstacle) {
    const blockerId = obstacle.kind === 'vehicle' ? obstacle.vehicleId : null;
    return { ok: false, reason: 'path', blockerId };
  }
  if (!hasEmptySlot(state.slots)) return { ok: false, reason: 'queueFull', blockerId: null };
  const { path, exitDir } = exitPath(v, state.grid);
  return { ok: true, path, exitDir };
}

/** IDs aller Fahrzeuge, die jetzt ausfahren koennen. */
export function tappableVehicles(state: GameState): string[] {
  if (state.status !== 'playing') return [];
  return state.vehicles
    .filter((v) => v.status === 'parked' && checkTap(state, v).ok)
    .map((v) => v.id);
}

/** Fuehrt einen erlaubten Zug auf der Arbeitskopie aus; `exitDir` nur im Event, wenn sie von `dir` abweicht. */
export function applyExit(
  s: GameState,
  vehicleId: string,
  path: Point[],
  exitDir: Dir,
  rules: ResolvedRules,
  events: GameEvent[],
): void {
  const vehicle = s.vehicles.find((v) => v.id === vehicleId)!;
  const slotIndex = targetSlot(s.slots, rules);
  vehicle.status = 'queued';
  s.slots[slotIndex] = {
    kind: 'vehicle',
    vehicleId,
    color: vehicle.color,
    capacity: vehicle.capacity,
    filled: 0,
  };
  s.moves += 1;
  events.push(
    exitDir === vehicle.dir
      ? { type: 'vehicleExited', vehicleId, slotIndex, path }
      : { type: 'vehicleExited', vehicleId, slotIndex, path, exitDir },
  );
  for (const other of s.vehicles) {
    if (other.locked && other.keyId === vehicleId) {
      other.locked = false;
      events.push({ type: 'vehicleUnlocked', vehicleId: other.id });
    }
  }
}
