import type { ResolvedRules } from '../schema';
import { compactQueue } from './rules/slots';
import type { GameEvent, GameState } from './types';

/** Einsteigen: vorderster Fahrgast in den Slot mit kleinstem Index (firstMatch), solange er passt. */
export function boardPassengers(s: GameState, rules: ResolvedRules, events: GameEvent[]): void {
  while (s.passengerIndex < s.passengers.length) {
    const color = s.passengers[s.passengerIndex]!;
    const slotIndex = s.slots.findIndex(
      (sl) => sl.kind === 'vehicle' && sl.color === color && sl.filled < sl.capacity,
    );
    const slot = s.slots[slotIndex];
    if (slot?.kind !== 'vehicle') return;

    slot.filled += 1;
    events.push({
      type: 'passengerBoarded',
      passengerIndex: s.passengerIndex,
      color,
      vehicleId: slot.vehicleId,
      slotIndex,
      filled: slot.filled,
    });
    s.passengerIndex += 1;

    if (slot.filled >= slot.capacity && rules.vehicles.departOnFull) {
      const vehicle = s.vehicles.find((v) => v.id === slot.vehicleId)!;
      vehicle.status = 'departed';
      s.slots[slotIndex] = { kind: 'empty' };
      events.push({ type: 'vehicleDeparted', vehicleId: slot.vehicleId, slotIndex });
      if (rules.queue.fillPolicy === 'fifo') compactQueue(s, events);
    }
  }
}
