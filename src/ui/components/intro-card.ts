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

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(
  tag: string,
  attrs: Record<string, string>,
  ...children: Array<Node | string>
): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Zackenstern (Hupen-Burst) um den Mittelpunkt (cx, cy); Punkte wechseln zwischen Aussen- und Innenradius. */
function burstPoints(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes;
    points.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return points.join(' ');
}

/** Wer hupt, wer rutscht: hinteres Auto mit Pfeil und Burst, davor das quer stehende Auto, daneben das Geisterbild. */
function honkArt(): HTMLElement {
  const burst = svg(
    'svg',
    { class: 'art-burst', viewBox: '0 0 70 80', 'aria-hidden': 'true' },
    svg('polygon', { class: 'art-burst-shape', points: burstPoints(35, 40, 34, 21, 9) }),
    svg(
      'text',
      { class: 'art-burst-text', x: '35', y: '45', 'text-anchor': 'middle' },
      t('honkBubble'),
    ),
  );
  const arc = svg(
    'svg',
    { class: 'art-arc', viewBox: '0 0 44 90', 'aria-hidden': 'true' },
    svg('path', { class: 'art-arc-line', d: 'M0 4C40 4 40 82 6 82' }),
    svg('polygon', { class: 'art-arc-head', points: '2,82 13,74 13,90' }),
  );
  const honker = car('green', h('span', { class: 'art-drive' }, '→'));
  honker.classList.add('art-honker');
  const blocker = car('blue');
  blocker.classList.add('art-blocker');
  return h(
    'div',
    { class: 'intro-art art-honk', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'art-scene' },
      honker,
      burst,
      blocker,
      h('span', { class: 'art-ghost' }),
      arc,
    ),
  );
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
  if (mechanic === 'honk') return honkArt();
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
