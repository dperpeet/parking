import { takeSnapshot } from '../../draft';
import {
  DIR_VECTORS,
  cellKey,
  fixedCells,
  inBounds,
  parkedOccupancy,
  pathToEdge,
} from '../../geometry';
import type { Point } from '../../geometry';
import type { GameEvent, GameState, VehicleState } from '../../types';
import { firstObstacle } from '../tap';
import type { PowerUpOutcome } from './types';

/**
 * Kleinste Verschiebung des Blockers entlang seiner Achse (positiv = Blickrichtung), nach der
 * keine seiner Zellen mehr auf dem Weg liegt. Gleichstand: vorwaerts. `null`, wenn unmoeglich.
 */
function findShift(s: GameState, blocker: VehicleState, pathKeys: Set<string>): number | null {
  const occupancy = parkedOccupancy(s);
  const fixed = fixedCells(s.grid);
  const [dx, dy] = DIR_VECTORS[blocker.dir];
  const tailOffset = blocker.length - 1;

  const clearsPath = (shift: number): boolean => {
    for (let i = 0; i < blocker.length; i++) {
      const offset = shift - i;
      if (pathKeys.has(cellKey(blocker.x + dx * offset, blocker.y + dy * offset))) return false;
    }
    return true;
  };
  const isFree = (x: number, y: number): boolean => {
    const key = cellKey(x, y);
    return inBounds(s.grid, x, y) && !fixed.has(key) && !occupancy.has(key);
  };

  /** Zellzahl der kleinsten Verschiebung in Richtung `sign` (+1 vorwaerts, -1 rueckwaerts). */
  const search = (sign: 1 | -1): number | null => {
    for (let k = 1; ; k++) {
      // Neu betretene Zelle: vor dem Kopf bzw. hinter dem Heck.
      const reach = sign === 1 ? k : -(tailOffset + k);
      if (!isFree(blocker.x + dx * reach, blocker.y + dy * reach)) return null;
      if (clearsPath(sign * k)) return k;
    }
  };

  const forward = search(1);
  const backward = search(-1);
  if (forward === null) return backward === null ? null : -backward;
  if (backward === null || forward <= backward) return forward;
  return -backward;
}

/** Hupe: das erste Hindernis auf dem Weg des Fahrzeugs `vehicleId` weicht entlang seiner Achse aus. */
export function applyHonk(
  s: GameState,
  original: GameState,
  vehicleId: string | undefined,
  events: GameEvent[],
): PowerUpOutcome {
  if (vehicleId === undefined) return { ok: false, reason: 'noTarget' };
  const honker = s.vehicles.find((v) => v.id === vehicleId);
  if (!honker) return { ok: false, reason: 'unknownVehicle' };
  if (honker.status !== 'parked') return { ok: false, reason: 'notParked' };

  const obstacle = firstObstacle(s, honker);
  if (!obstacle) return { ok: false, reason: 'notBlocked' };
  if (obstacle.kind === 'fixed') return { ok: false, reason: 'blockedByBollard' };
  const blocker = s.vehicles.find((v) => v.id === obstacle.vehicleId)!;
  if (blocker.locked) return { ok: false, reason: 'blockerLocked' };

  const pathKeys = new Set(pathToEdge(honker, s.grid).map(([x, y]) => cellKey(x, y)));
  const shift = findShift(s, blocker, pathKeys);
  if (shift === null) return { ok: false, reason: 'cannotYield' };

  const from: Point = [blocker.x, blocker.y];
  const [dx, dy] = DIR_VECTORS[blocker.dir];
  blocker.x += dx * shift;
  blocker.y += dy * shift;
  s.history = [...s.history, takeSnapshot(original)];
  // Aus einer Niederlage durch fehlende Zuege wieder aufnehmen; evaluateOutcome bewertet neu.
  s.status = 'playing';
  s.loseReason = null;
  events.push({
    type: 'vehicleYielded',
    vehicleId: blocker.id,
    byVehicleId: honker.id,
    from,
    to: [blocker.x, blocker.y],
  });
  return { ok: true, settle: true };
}
