import type { GameEvent, GameState } from '../types';
import { firstObstacle } from './tap';

/**
 * Deckt jedes verdeckte, geparkte Mystery-Fahrzeug auf, dessen Weg zum Rand frei ist (gleiche Wegpruefung
 * wie beim Antippen, das Schloss ist egal). Ein Event `vehicleRevealed` je Fahrzeug, in Reihenfolge von
 * `s.vehicles`. Ersetzt das Array und die betroffenen Objekte, statt sie zu mutieren (sie koennen mit
 * Snapshots geteilt sein).
 */
export function revealVehicles(s: GameState, events: GameEvent[]): void {
  if (!s.vehicles.some((v) => v.hidden)) return;
  s.vehicles = s.vehicles.map((v) => {
    if (!v.hidden || v.status !== 'parked' || firstObstacle(s, v) !== null) return v;
    events.push({ type: 'vehicleRevealed', vehicleId: v.id, color: v.color });
    return { ...v, hidden: false };
  });
}
