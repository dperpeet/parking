// Intro-Karte einer neuen Mechanik (Poller, Schluessel): kurzer Text, kleine Illustration aus CSS/SVG.
import { t } from '../../i18n';
import type { StringKey } from '../../i18n';
import type { Mechanic } from '../../schema';
import { h, icon } from '../dom';

const TITLE_KEYS: Record<Mechanic, StringKey> = {
  bollards: 'introBollardsTitle',
  keys: 'introKeysTitle',
  honk: 'introHonkTitle',
};
const TEXT_KEYS: Record<Mechanic, StringKey> = {
  bollards: 'introBollardsText',
  keys: 'introKeysText',
  honk: 'introHonkText',
};

export const mechanicTitle = (mechanic: Mechanic): string => t(TITLE_KEYS[mechanic]);

export interface IntroCard {
  close(): void;
}

export interface IntroOptions {
  /** true: ohne skalierte Buehne (Levelauswahl), sonst auf 390 px Designbreite skaliert. */
  plain: boolean;
  /** Wird nach dem Schliessen aufgerufen (Knopf, Escape oder `close()`). */
  onClosed(): void;
}

function car(color: string, ...children: Array<Node | null>): HTMLElement {
  const el = h('span', { class: 'art-car' }, ...children);
  el.style.setProperty('--car', `var(--c-${color}-fill)`);
  return el;
}

function art(mechanic: Mechanic): HTMLElement {
  if (mechanic === 'bollards') {
    return h(
      'div',
      { class: 'intro-art art-bollards', 'aria-hidden': 'true' },
      car('blue', h('span', { class: 'art-chevron' }, '›')),
      h('span', { class: 'art-post' }),
      h('span', { class: 'art-detour' }, '↷'),
    );
  }
  if (mechanic === 'honk') {
    return h(
      'div',
      { class: 'intro-art art-honk', 'aria-hidden': 'true' },
      h('span', { class: 'art-bubble' }, t('honkBubble')),
      car('green'),
      h('span', { class: 'art-detour' }, '→'),
      car('blue'),
    );
  }
  const lock = h('span', { class: 'art-badge art-badge-lock' }, icon('lock'), h('b', {}, '1'));
  const key = h('span', { class: 'art-badge art-badge-key' }, icon('key'), h('b', {}, '1'));
  return h(
    'div',
    { class: 'intro-art art-keys', 'aria-hidden': 'true' },
    car('orange', key),
    h('span', { class: 'art-detour' }, '→'),
    h('span', { class: 'art-locked' }, car('blue', lock)),
  );
}

/** Oeffnet die Karte in `layer`; `background` wird solange inert gesetzt. */
export function openIntro(
  layer: HTMLElement,
  background: HTMLElement,
  mechanic: Mechanic,
  opts: IntroOptions,
): IntroCard {
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    layer.replaceChildren();
    background.inert = false;
    opts.onClosed();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);

  const start = h(
    'button',
    { type: 'button', class: 'btn btn-primary', 'data-testid': 'intro-start' },
    t('introStart'),
  );
  start.addEventListener('click', close);
  const dialog = h(
    'div',
    {
      class: `dialog dialog-intro intro-${mechanic}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'intro-title',
      'aria-describedby': 'intro-text',
      'data-testid': 'intro-dialog',
      'data-mechanic': mechanic,
    },
    art(mechanic),
    h('h2', { id: 'intro-title', class: 'dlg-title' }, mechanicTitle(mechanic)),
    h('p', { id: 'intro-text', class: 'dlg-sub intro-text' }, t(TEXT_KEYS[mechanic])),
    start,
  );
  layer.replaceChildren(
    h(
      'div',
      { class: 'overlay' },
      h('div', { class: opts.plain ? 'overlay-inner plain' : 'overlay-inner' }, dialog),
    ),
  );
  background.inert = true;
  start.focus();
  return { close };
}
