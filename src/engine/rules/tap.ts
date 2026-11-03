import type { ResolvedRules } from '../../schema';
import { cellKey, fixedCells, parkedOccupancy, pathToEdge } from '../geometry';
import type { Point } from '../geometry';
import type { GameEvent, GameState, VehicleState } from '../types';
import { hasEmptySlot, targetSlot } from './slots';

export type TapCheck =
  | { ok: true; path: Point[] }
  | { ok: false; reason: 'path' | 'queueFull' | 'locked'; blockerId: string | null };

export type Obstacle = { kind: 'fixed' } | { kind: 'vehicle'; vehicleId: string };

/** Erstes Hindernis (geparktes Fahrzeug oder fixed-Zelle) auf dem Weg von `v` zum Rand, sonst `null`. */
export function firstObstacle(state: GameState, v: VehicleState): Obstacle | null {
  const occupancy = parkedOccupancy(state);
  const fixed = fixedCells(state.grid);
  for (const [x, y] of pathToEdge(v, state.grid)) {
    const key = cellKey(x, y);
    const blocker = occupancy.get(key);
    if (blocker !== undefined) return { kind: 'vehicle', vehicleId: blocker };
    if (fixed.has(key)) return { kind: 'fixed' };
  }
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
  return { ok: true, path: pathToEdge(v, state.grid) };
}

/** IDs aller Fahrzeuge, die jetzt ausfahren koennen. */
export function tappableVehicles(state: GameState): string[] {
  if (state.status !== 'playing') return [];
  return state.vehicles
    .filter((v) => v.status === 'parked' && checkTap(state, v).ok)
    .map((v) => v.id);
}

/** Fuehrt einen erlaubten Zug auf der Arbeitskopie aus. */
export function applyExit(
  s: GameState,
  vehicleId: string,
  path: Point[],
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
  events.push({ type: 'vehicleExited', vehicleId, slotIndex, path });
  for (const other of s.vehicles) {
    if (other.locked && other.keyId === vehicleId) {
      other.locked = false;
      events.push({ type: 'vehicleUnlocked', vehicleId: other.id });
    }
  }
}
