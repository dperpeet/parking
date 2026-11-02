import type { ResolvedRules } from '../../../schema';
import type { GameEvent, GameState } from '../../types';
import { compactQueue } from '../slots';
import type { PowerUpOutcome } from './types';

/** Entsperrt den ersten gesperrten Slot, sonst haengt es einen neuen leeren Slot an. */
export function applyExtraSlot(
  s: GameState,
  rules: ResolvedRules,
  events: GameEvent[],
): PowerUpOutcome {
  const locked = s.slots.findIndex((sl) => sl.kind === 'locked');
  let slotIndex: number;
  if (locked >= 0) {
    s.slots[locked] = { kind: 'empty' };
    slotIndex = locked;
  } else {
    s.slots.push({ kind: 'empty' });
    slotIndex = s.slots.length - 1;
  }
  events.push({ type: 'slotAdded', slotIndex });
  if (rules.queue.fillPolicy === 'fifo') compactQueue(s, events);
  return { ok: true, settle: true };
}
