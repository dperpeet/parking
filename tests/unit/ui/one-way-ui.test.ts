// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameState } from '../../../src/engine/types';
import { dictionary, setLanguage, t } from '../../../src/i18n';
import { mechanicTitle, openIntro } from '../../../src/ui/components/intro-card';
import { createArrowNote } from '../../../src/ui/arrow-note';
import { announce, honkErrorText, oneWayCellText, oneWayNote } from '../../../src/ui/strings';
import { applyThemeVars } from '../../../src/ui/theme-vars';
import { THEME } from '../../../src/render/theme';
import { fakeEngine } from '../../support/fake-engine';
import { level, rules } from '../helpers';

type Cells = GameState['grid']['cells'];

const ARROWS: Cells = [
  { x: 4, y: 2, type: 'oneWay', dir: 'N' },
  { x: 1, y: 0, type: 'oneWay', dir: 'E' },
  { x: 0, y: 0, type: 'fixed' },
];

function withCells(cells: Cells): GameState {
  const base = fakeEngine.createGame(level, rules) as GameState;
  return { ...base, grid: { ...base.grid, cells } };
}

afterEach(() => setLanguage('de'));

describe('Abbiegepfeile: Texte', () => {
  it('beschreibt Pfeilzellen zeilenweise (de und en)', () => {
    setLanguage('de');
    expect(oneWayCellText(4, 2, 'N')).toBe('Reihe 3, Spalte 5: Einbahn nach oben');
    expect(oneWayNote(ARROWS)).toBe(
      'Abbiegepfeile: Reihe 1, Spalte 2: Einbahn nach rechts; Reihe 3, Spalte 5: Einbahn nach oben',
    );
    setLanguage('en');
    expect(oneWayNote(ARROWS)).toBe(
      'Turn arrows: row 1, column 2: one-way right; row 3, column 5: one-way up',
    );
  });

  it('ohne Pfeile (oder ohne Richtung) gibt es keine Beschreibung', () => {
    expect(oneWayNote([])).toBeNull();
    expect(oneWayNote([{ x: 0, y: 0, type: 'fixed' }])).toBeNull();
    expect(oneWayNote([{ x: 0, y: 0, type: 'oneWay' }])).toBeNull();
  });

  it('Hupen gegen die Einbahn: eigener Text, wird angesagt', () => {
    const event: GameEvent = { type: 'invalidAction', reason: 'wrongWay', vehicleId: 'v1' };
    setLanguage('de');
    expect(honkErrorText('wrongWay')).toBe('Gegen die Einbahn kommt keiner weiter.');
    expect(announce(event, withCells([]))).toBe('Gegen die Einbahn kommt keiner weiter.');
    setLanguage('en');
    expect(honkErrorText('wrongWay')).toBe('No way through against a one-way.');
  });

  it('alle neuen Schluessel gibt es in beiden Sprachen', () => {
    for (const key of [
      'oneWayCell',
      'oneWayNote',
      'honkErrWrongWay',
      'introOneWayTitle',
      'introOneWayText',
    ] as const) {
      expect(dictionary('de')[key]).toBeTruthy();
      expect(dictionary('en')[key]).toBeTruthy();
    }
  });
});

describe('Abbiegepfeile: Screenreader-Beschreibung des Bretts', () => {
  it('haengt die Beschreibung an und verknuepft sie, ohne Pfeile entfernt sie sie wieder', () => {
    setLanguage('de');
    const host = document.createElement('section');
    const note = createArrowNote(host);
    note.update(withCells([]));
    expect(host.querySelector('[data-testid="arrow-note"]')).toBeNull();
    expect(host.hasAttribute('aria-describedby')).toBe(false);

    note.update(withCells(ARROWS));
    const p = host.querySelector('[data-testid="arrow-note"]');
    expect(p?.textContent).toBe(oneWayNote(ARROWS));
    expect(p?.classList.contains('sr-only')).toBe(true);
    expect(host.getAttribute('aria-describedby')).toBe(p?.id);

    note.update(withCells([]));
    expect(host.querySelector('[data-testid="arrow-note"]')).toBeNull();
    expect(host.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Abbiegepfeile: Intro-Karte', () => {
  it('zeigt Titel, Text und eine Grafik mit Auto und Fahrbahnpfeil', () => {
    for (const lang of ['de', 'en'] as const) {
      setLanguage(lang);
      const layer = document.createElement('div');
      const background = document.createElement('div');
      const onClosed = vi.fn();
      openIntro(layer, background, 'oneWay', { plain: true, onClosed });
      expect(layer.querySelector('[data-mechanic="oneWay"]')).not.toBeNull();
      expect(layer.querySelector('.intro-art')?.classList.contains('art-one-way')).toBe(true);
      expect(layer.querySelector('.art-car')).not.toBeNull();
      const arrow = layer.querySelector('.art-road .art-road-arrow');
      expect(arrow?.getAttribute('points')?.split(' ')).toHaveLength(7);
      expect(layer.querySelector('.dlg-title')?.textContent).toBe(t('introOneWayTitle'));
      expect(mechanicTitle('oneWay')).toBe(t('introOneWayTitle'));
      const words = layer.querySelector('.intro-text')?.textContent?.split(/\s+/) ?? [];
      expect(words.length, lang).toBeLessThanOrEqual(30);
      layer.querySelector<HTMLButtonElement>('[data-testid="intro-start"]')?.click();
      expect(onClosed).toHaveBeenCalledOnce();
    }
  });

  it('Theme-Variablen fuer die Fahrbahnkachel', () => {
    const el = document.createElement('div');
    applyThemeVars(el);
    expect(el.style.getPropertyValue('--t-one-way-road')).toBe(THEME.oneWayRoad);
    expect(el.style.getPropertyValue('--t-one-way-arrow')).toBe(THEME.oneWayArrow);
  });
});
