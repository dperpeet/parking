import type { ResolvedRules } from '../../schema';
import type { GameEvent, GameState, SlotState } from '../types';

export function initialSlots(rules: ResolvedRules): SlotState[] {
  const slots: SlotState[] = [];
  for (let i = 0; i < rules.queue.slots; i++) {
    slots.push(rules.queue.lockedSlots.includes(i) ? { kind: 'locked' } : { kind: 'empty' });
  }
  return slots;
}

export function hasEmptySlot(slots: SlotState[]): boolean {
  return slots.some((s) => s.kind === 'empty');
}

/** Slot-Index fuer ein neu ausfahrendes Fahrzeug gemaess fillPolicy (-1: keiner frei). */
export function targetSlot(slots: SlotState[], rules: ResolvedRules): number {
  if (rules.queue.fillPolicy === 'fifo') {
    let lastOccupied = -1;
    slots.forEach((s, i) => {
      if (s.kind === 'vehicle') lastOccupied = i;
    });
    const after = slots.findIndex((s, i) => i > lastOccupied && s.kind === 'empty');
    if (after >= 0) return after;
  }
  return slots.findIndex((s) => s.kind === 'empty');
}

/** fifo: Fahrzeuge rutschen auf die vordersten nicht gesperrten Slots. */
export function compactQueue(s: GameState, events: GameEvent[]): void {
  const open: number[] = [];
  const moving: Array<{ from: number; slot: SlotState }> = [];
  s.slots.forEach((slot, i) => {
    if (slot.kind === 'locked') return;
    open.push(i);
    if (slot.kind === 'vehicle') moving.push({ from: i, slot });
  });
  for (const i of open) s.slots[i] = { kind: 'empty' };
  moving.forEach(({ from, slot }, n) => {
    const to = open[n]!;
    s.slots[to] = slot;
    if (slot.kind === 'vehicle' && to !== from) {
      events.push({ type: 'slotShifted', vehicleId: slot.vehicleId, from, to });
    }
  });
}
