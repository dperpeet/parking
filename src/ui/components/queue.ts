import { PALETTE } from '../../render/theme';
import type { GameState } from '../../engine/types';
import { h, icon } from '../dom';
import { colorName, de } from '../strings';

export interface QueueView {
  update(state: GameState): void;
}

export function createQueue(parent: HTMLElement): QueueView {
  const title = h('div', { class: 'queue-title' });
  const slotsEl = h('div', { class: 'slots', role: 'list' });
  parent.append(h('section', { class: 'queue-row' }, title, slotsEl));
  let prevFilled: number[] = [];

  return {
    update(state) {
      const used = state.slots.filter((s) => s.kind !== 'empty' && s.kind !== 'locked').length;
      const usable = state.slots.filter((s) => s.kind !== 'locked').length;
      title.textContent = de.slotsTitle(used, usable);
      slotsEl.replaceChildren();
      const filled: number[] = [];
      state.slots.forEach((slot, i) => {
        const el = h('div', { class: 'slot', role: 'listitem' });
        if (slot.kind === 'vehicle') {
          const style = PALETTE[slot.color];
          el.classList.add('slot-filled');
          el.setAttribute('style', `background:${style?.fill ?? ''};color:${style?.ink ?? ''}`);
          el.append(
            h('span', { class: 'slot-glyph' }, style?.glyph ?? '?'),
            h('span', { class: 'slot-count' }, `${slot.filled}/${slot.capacity}`),
          );
          el.setAttribute(
            'aria-label',
            `Halteposition ${i + 1}: ${colorName(slot.color)}, ${slot.filled} von ${slot.capacity}`,
          );
          filled.push(slot.filled);
          if (prevFilled[i] !== slot.filled) el.classList.add('pop');
        } else if (slot.kind === 'locked') {
          el.classList.add('slot-locked');
          el.append(icon('lock'));
          el.setAttribute('aria-label', `Halteposition ${i + 1}: ${de.slotLocked}`);
          filled.push(-1);
        } else {
          el.setAttribute('aria-label', `Halteposition ${i + 1}: ${de.slotEmpty}`);
          filled.push(-1);
        }
        slotsEl.append(el);
      });
      prevFilled = filled;
    },
  };
}
