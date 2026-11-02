import { PALETTE } from '../../render/theme';
import type { GameState } from '../../engine/types';
import { h, icon } from '../dom';
import { t } from '../../i18n';
import { colorName } from '../strings';

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
      title.textContent = t('slotsTitle', { used, total: usable });
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
            t('slotFilled', {
              i: i + 1,
              color: colorName(slot.color),
              filled: slot.filled,
              cap: slot.capacity,
            }),
          );
          filled.push(slot.filled);
          if (prevFilled[i] !== slot.filled) el.classList.add('pop');
        } else if (slot.kind === 'locked') {
          el.classList.add('slot-locked');
          el.append(icon('lock'));
          el.setAttribute('aria-label', t('slotState', { i: i + 1, state: t('slotLocked') }));
          filled.push(-1);
        } else {
          el.setAttribute('aria-label', t('slotState', { i: i + 1, state: t('slotEmpty') }));
          filled.push(-1);
        }
        slotsEl.append(el);
      });
      prevFilled = filled;
    },
  };
}
