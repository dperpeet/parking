import type { ResolvedRules } from '../../schema';
import { cellKey, fixedCells, parkedOccupancy, pathToEdge } from '../geometry';
import type { Point } from '../geometry';
import type { GameEvent, GameState, VehicleState } from '../types';
import { hasEmptySlot, targetSlot } from './slots';

export type TapCheck =
  | { ok: true; path: Point[] }
  | { ok: false; reason: 'path' | 'queueFull' | 'locked'; blockerId: string | null };

/** Prueft die Regeln fuer das Antippen: locked > path > queueFull. */
export function checkTap(state: GameState, v: VehicleState): TapCheck {
  if (v.locked) return { ok: false, reason: 'locked', blockerId: null };
  const path = pathToEdge(v, state.grid);
  const occupancy = parkedOccupancy(state);
  const fixed = fixedCells(state.grid);
  for (const [x, y] of path) {
    const key = cellKey(x, y);
    const blocker = occupancy.get(key);
    if (blocker !== undefined) return { ok: false, reason: 'path', blockerId: blocker };
    if (fixed.has(key)) return { ok: false, reason: 'path', blockerId: null };
  }
  if (!hasEmptySlot(state.slots)) return { ok: false, reason: 'queueFull', blockerId: null };
  return { ok: true, path };
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
