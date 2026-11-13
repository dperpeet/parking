import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LANG,
  detectLanguage,
  dictionary,
  getLanguage,
  onLanguageChange,
  resolveLanguage,
  setLanguage,
  t,
  tn,
} from '../../../src/i18n';
import { announce, colorDefinite, hintAnnouncement, vehicleLabel } from '../../../src/ui/strings';
import { fakeEngine } from '../../support/fake-engine';
import { level, rules } from '../helpers';

afterEach(() => setLanguage('de'));

describe('i18n', () => {
  it('beide Woerterbuecher haben dieselben Keys und Platzhalter', () => {
    const de = dictionary('de');
    const en = dictionary('en');
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    const vars = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const key of Object.keys(de) as Array<keyof typeof de>) {
      expect(vars(en[key]), key).toEqual(vars(de[key]));
      expect(de[key].length, key).toBeGreaterThan(0);
    }
  });

  it('ersetzt Platzhalter und laesst unbekannte stehen', () => {
    expect(t('slotsTitle', { used: 2, total: 5 })).toBe('Halteplätze 2 / 5 belegt');
    expect(t('slotsTitle', { used: 2 })).toBe('Halteplätze 2 / {total} belegt');
  });

  it('tn waehlt die Einzahl bei 1', () => {
    expect(tn('movesAria', 1)).toBe('1 Zug');
    expect(tn('movesAria', 0)).toBe('0 Züge');
    expect(tn('movesAria', 7)).toBe('7 Züge');
    setLanguage('en');
    expect(tn('movesAria', 1)).toBe('1 move');
    expect(tn('movesAria', 2)).toBe('2 moves');
  });

  it('Sprachwechsel meldet Listener und aendert Texte', () => {
    const seen: string[] = [];
    const off = onLanguageChange((l) => seen.push(l));
    setLanguage('en');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(t('next')).toBe('Next');
    off();
    setLanguage('de');
    expect(seen).toEqual(['en']);
    expect(t('next')).toBe('Weiter');
  });

  it('erkennt die Browser-Sprache und beachtet den Override', () => {
    expect(detectLanguage('de-AT')).toBe('de');
    expect(detectLanguage('en-US')).toBe('en');
    expect(detectLanguage('fr-FR')).toBe(DEFAULT_LANG);
    expect(detectLanguage(undefined)).toBe(DEFAULT_LANG);
    expect(resolveLanguage('auto', 'en-GB')).toBe('en');
    expect(resolveLanguage('de', 'en-GB')).toBe('de');
    expect(resolveLanguage('en', 'de-DE')).toBe('en');
  });
});

describe('Ansagen in beiden Sprachen', () => {
  const state = fakeEngine.createGame(level, rules);

  it('Tipp: das blaue Fahrzeug', () => {
    expect(hintAnnouncement({ color: 'blue' })).toBe('Tipp: das blaue Fahrzeug');
    expect(hintAnnouncement({ color: 'red' })).toBe('Tipp: das rote Fahrzeug');
    expect(colorDefinite('purple')).toBe('lila');
    expect(colorDefinite('orange')).toBe('orange');
    setLanguage('en');
    expect(hintAnnouncement({ color: 'blue' })).toBe('Hint: the blue vehicle');
  });

  it('Fahrzeug- und Ereignistexte', () => {
    expect(vehicleLabel({ color: 'blue', x: 0, y: 1, dir: 'W' })).toBe(
      'Blaues Fahrzeug, Reihe 2, Spalte 1, fährt nach links',
    );
    setLanguage('en');
    expect(vehicleLabel({ color: 'blue', x: 0, y: 1, dir: 'W' })).toBe(
      'Blue vehicle, row 2, column 1, heading left',
    );
    expect(
      announce({ type: 'vehicleExited', vehicleId: 'v2', slotIndex: 1, path: [] }, state),
    ).toBe('Blue vehicle drives to spot 2');
    expect(announce({ type: 'lost', reason: 'queueFull' }, state)).toBe('No room left');
  });
});
