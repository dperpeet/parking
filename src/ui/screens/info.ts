// Anleitung und Datenschutzhinweis als Dialog ueber der Levelauswahl. Inhalte nur aus i18n, als Text eingefuegt.
import { t } from '../../i18n';
import type { StringKey } from '../../i18n';
import { Mechanic } from '../../schema';
import type { PowerUpId } from '../../engine/types';
import { mechanicText, mechanicTitle } from '../components/intro-card';
import { h } from '../dom';
import { powerUpLabel } from '../strings';

export type InfoKind = 'guide' | 'privacy';

/** Werte, die in den Texten stehen; die App liefert sie aus ihren Konstanten. */
export interface InfoFacts {
  saveKey: string;
  hintsPerLevel: number;
  hintStarCap: number;
}

export interface InfoTerm {
  term: string;
  text: string;
}

export interface InfoSection {
  id: string;
  title: string;
  /** Absaetze vor einer Liste. */
  text: string[];
  /** Nummerierte Schritte. */
  steps?: string[];
  /** Begriff mit Erklaerung (Mechaniken, Hilfen). */
  terms?: InfoTerm[];
}

const POWER_UP_TEXT: Record<PowerUpId, StringKey> = {
  undo: 'guidePuUndo',
  shuffle: 'guidePuShuffle',
  extraSlot: 'guidePuExtraSlot',
  honk: 'guidePuHonk',
};

/** Zusatz zur Mechanik, der nur in der Anleitung steht (Bedienung). */
const MECHANIC_HOW: Partial<Record<Mechanic, StringKey>> = { honk: 'guideHonkHow' };

function mechanicTerm(mechanic: Mechanic): InfoTerm {
  const how = MECHANIC_HOW[mechanic];
  const text = mechanicText(mechanic);
  return { term: mechanicTitle(mechanic), text: how ? `${text} ${t(how)}` : text };
}

export function guideSections(facts: InfoFacts): InfoSection[] {
  const powerUps = Object.keys(POWER_UP_TEXT) as PowerUpId[];
  return [
    {
      id: 'loop',
      title: t('guideLoopTitle'),
      text: [],
      steps: [t('guideLoop1'), t('guideLoop2'), t('guideLoop3'), t('guideLoop4')],
    },
    {
      id: 'mechanics',
      title: t('guideMechanicsTitle'),
      text: [t('guideMechanicsText')],
      terms: Mechanic.options.map(mechanicTerm),
    },
    {
      id: 'powerups',
      title: t('guidePowerupsTitle'),
      text: [t('guidePowerupsText')],
      terms: powerUps.map((id) => ({ term: powerUpLabel(id), text: t(POWER_UP_TEXT[id]) })),
    },
    {
      id: 'hints',
      title: t('guideHintsTitle'),
      text: [t('guideHintsText', { n: facts.hintsPerLevel, cap: facts.hintStarCap })],
    },
    { id: 'stars', title: t('guideStarsTitle'), text: [t('guideStarsText')] },
    { id: 'modes', title: t('guideModesTitle'), text: [t('guideModesText')] },
    { id: 'keys', title: t('guideKeysTitle'), text: [t('guideKeysText')] },
  ];
}

export function privacySections(facts: InfoFacts): InfoSection[] {
  return [
    { id: 'short', title: t('privacyShortTitle'), text: [t('privacyShortText')] },
    {
      id: 'store',
      title: t('privacyStoreTitle'),
      text: [t('privacyStoreText', { key: facts.saveKey })],
    },
    { id: 'delete', title: t('privacyDeleteTitle'), text: [t('privacyDeleteText')] },
    { id: 'share', title: t('privacyShareTitle'), text: [t('privacyShareText')] },
    { id: 'host', title: t('privacyHostTitle'), text: [t('privacyHostText')] },
  ];
}

const TITLE_KEYS: Record<InfoKind, StringKey> = { guide: 'guideTitle', privacy: 'privacyTitle' };
const SECTIONS: Record<InfoKind, (facts: InfoFacts) => InfoSection[]> = {
  guide: guideSections,
  privacy: privacySections,
};

export const infoTitle = (kind: InfoKind): string => t(TITLE_KEYS[kind]);

function section(s: InfoSection): HTMLElement {
  const el = h(
    'section',
    { class: 'info-section', 'data-section': s.id },
    h('h3', { class: 'info-heading' }, s.title),
    ...s.text.map((p) => h('p', { class: 'info-text' }, p)),
  );
  if (s.steps) el.append(h('ol', { class: 'info-steps' }, ...s.steps.map((p) => h('li', {}, p))));
  if (s.terms) {
    el.append(
      h(
        'dl',
        { class: 'info-terms' },
        ...s.terms.flatMap((d) => [h('dt', {}, d.term), h('dd', {}, d.text)]),
      ),
    );
  }
  return el;
}

export interface InfoDialog {
  close(): void;
  /** Baut den Dialog mit der aktuellen Sprache neu auf. */
  refresh(): void;
}

/** Oeffnet Anleitung oder Datenschutzhinweis in `layer`; `background` wird solange inert gesetzt. */
export function openInfo(
  layer: HTMLElement,
  background: HTMLElement,
  kind: InfoKind,
  facts: InfoFacts,
  onClosed: () => void,
): InfoDialog {
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    layer.replaceChildren();
    background.inert = false;
    onClosed();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);

  const render = (): void => {
    if (closed) return;
    const done = h(
      'button',
      { type: 'button', class: 'btn btn-primary', 'data-testid': 'info-close' },
      t('close'),
    );
    done.addEventListener('click', close);
    const dialog = h(
      'div',
      {
        class: `dialog dialog-info info-${kind}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'info-title',
        'data-testid': `${kind}-dialog`,
        tabindex: '-1',
      },
      h('h2', { id: 'info-title', class: 'dlg-title info-title' }, infoTitle(kind)),
      ...SECTIONS[kind](facts).map(section),
      done,
    );
    layer.replaceChildren(
      h('div', { class: 'overlay' }, h('div', { class: 'overlay-inner plain' }, dialog)),
    );
    // Fokus auf den Dialog selbst: Screenreader beginnen beim Titel, die Ansicht bleibt oben.
    dialog.focus({ preventScroll: true });
  };

  background.inert = true;
  render();
  return { close, refresh: render };
}
