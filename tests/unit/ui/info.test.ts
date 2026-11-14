// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANGS, setLanguage, t } from '../../../src/i18n';
import { Mechanic } from '../../../src/schema';
import { mechanicText, mechanicTitle, openIntro } from '../../../src/ui/components/intro-card';
import { guideSections, openInfo, privacySections } from '../../../src/ui/screens/info';
import type { InfoFacts } from '../../../src/ui/screens/info';
import { createLevelSelect } from '../../../src/ui/screens/level-select';
import type { LevelSelectHandlers } from '../../../src/ui/screens/level-select';
import { openSettings } from '../../../src/ui/screens/settings';
import type { SettingsHandlers } from '../../../src/ui/screens/settings';

const FACTS: InfoFacts = { saveKey: 'test.save.key', hintsPerLevel: 7, hintStarCap: 1 };

afterEach(() => {
  setLanguage('de');
  document.body.replaceChildren();
});

describe('Anleitung (Inhalt)', () => {
  it('erklaert den Core Loop in vier Schritten und jede Mechanik mit dem Intro-Text', () => {
    for (const lang of LANGS) {
      setLanguage(lang);
      const sections = guideSections(FACTS);
      expect(sections.find((s) => s.id === 'loop')?.steps, lang).toHaveLength(4);
      const terms = sections.find((s) => s.id === 'mechanics')?.terms ?? [];
      expect(
        terms.map((d) => d.term),
        lang,
      ).toEqual(Mechanic.options.map(mechanicTitle));
      for (const [i, m] of Mechanic.options.entries()) {
        expect(terms[i]?.text.startsWith(mechanicText(m)), `${lang} ${m}`).toBe(true);
      }
    }
  });

  it('nimmt den levelbezogenen Satz der Hupen-Karte nicht in die Anleitung', () => {
    setLanguage('de');
    const honk = guideSections(FACTS)
      .find((s) => s.id === 'mechanics')
      ?.terms?.find((d) => d.term === mechanicTitle('honk'));
    expect(honk?.text).not.toContain(t('introHonkNeed'));
    expect(honk?.text).toContain(t('guideHonkHow'));
  });

  it('listet alle vier Hilfen und setzt Tipp-Zahl und Sterne-Grenze aus den Fakten ein', () => {
    setLanguage('en');
    const sections = guideSections(FACTS);
    const terms = sections.find((s) => s.id === 'powerups')?.terms ?? [];
    expect(terms.map((d) => d.term)).toEqual(['Undo', 'Shuffle', '+1 Spot', 'Honk']);
    const hints = sections.find((s) => s.id === 'hints')?.text.join(' ') ?? '';
    expect(hints).toContain('7 hints');
    expect(hints).toContain('1 stars');
    expect(hints).not.toMatch(/\{\w+\}/);
  });
});

describe('Datenschutzhinweis (Inhalt)', () => {
  it('nennt den Speicher-Schluessel und hat in jeder Sprache alle Abschnitte', () => {
    for (const lang of LANGS) {
      setLanguage(lang);
      const sections = privacySections(FACTS);
      expect(
        sections.map((s) => s.id),
        lang,
      ).toEqual(['short', 'store', 'delete', 'share', 'host']);
      const all = sections.flatMap((s) => [s.title, ...s.text]).join(' ');
      expect(all, lang).toContain('test.save.key');
      expect(all, lang).toContain('GitHub Pages');
      expect(all, lang).not.toMatch(/\{\w+\}|https?:/);
    }
  });
});

describe('Info-Dialog', () => {
  function open(kind: 'guide' | 'privacy') {
    const layer = document.createElement('div');
    const background = document.createElement('div');
    document.body.append(background, layer);
    const onClosed = vi.fn();
    const dialog = openInfo(layer, background, kind, FACTS, onClosed);
    return { layer, background, onClosed, dialog };
  }

  it('zeigt Titel, Abschnitte und Liste; Fokus liegt auf dem Dialog', () => {
    setLanguage('de');
    const { layer, background } = open('guide');
    const dlg = layer.querySelector<HTMLElement>('[data-testid="guide-dialog"]');
    expect(dlg?.getAttribute('role')).toBe('dialog');
    expect(layer.querySelector('#info-title')?.textContent).toBe('Anleitung');
    expect(layer.querySelectorAll('.info-section')).toHaveLength(guideSections(FACTS).length);
    expect(layer.querySelectorAll('.info-steps li')).toHaveLength(4);
    expect(document.activeElement).toBe(dlg);
    expect(background.inert).toBe(true);
  });

  it('schliesst per Knopf und per Escape genau einmal', () => {
    const a = open('privacy');
    a.layer.querySelector<HTMLElement>('[data-testid="info-close"]')?.click();
    expect(a.onClosed).toHaveBeenCalledTimes(1);
    expect(a.layer.childElementCount).toBe(0);
    expect(a.background.inert).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(a.onClosed).toHaveBeenCalledTimes(1);

    const b = open('privacy');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(b.onClosed).toHaveBeenCalledTimes(1);
    b.dialog.close();
    expect(b.onClosed).toHaveBeenCalledTimes(1);
  });

  it('refresh baut den Dialog in der neuen Sprache auf', () => {
    setLanguage('de');
    const { layer, dialog } = open('privacy');
    expect(layer.querySelector('#info-title')?.textContent).toBe('Datenschutz');
    setLanguage('en');
    dialog.refresh();
    expect(layer.querySelector('#info-title')?.textContent).toBe('Privacy');
  });
});

describe('Einstiege', () => {
  it('Levelauswahl: ?-Knopf im Kopf und Links in der Fusszeile', () => {
    const handlers: LevelSelectHandlers = {
      onLevel: vi.fn(),
      onDaily: vi.fn(),
      onEndless: vi.fn(),
      onSettings: vi.fn(),
      onHold: vi.fn(),
      onHoldStage: vi.fn(),
      onIntro: vi.fn(),
      onGuide: vi.fn(),
      onPrivacy: vi.fn(),
    };
    const view = createLevelSelect(handlers);
    view.update({
      dailyDate: '2026-11-14',
      dailyDone: false,
      streak: 0,
      endlessBest: 0,
      holdEnabled: false,
      holdStage: 1,
      reachedStage: 1,
      stageCount: 6,
      worlds: [],
      persistent: true,
    });
    const q = (id: string) => view.el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    expect(q('guide')?.getAttribute('aria-label')).toBe(t('guideTitle'));
    q('guide')?.click();
    q('footer-guide')?.click();
    q('footer-privacy')?.click();
    expect(handlers.onGuide).toHaveBeenCalledTimes(2);
    expect(handlers.onPrivacy).toHaveBeenCalledTimes(1);
  });

  it('Einstellungen: Knoepfe fuer Anleitung und Datenschutz', () => {
    const layer = document.createElement('div');
    const background = document.createElement('div');
    document.body.append(background, layer);
    const handlers: SettingsHandlers = {
      getModel: () => ({ language: 'de', motion: 'system', sound: true }),
      onLanguage: vi.fn(),
      onMotion: vi.fn(),
      onSound: vi.fn(),
      onExport: vi.fn(),
      validateImport: () => false,
      onImport: () => false,
      onReset: vi.fn(),
      onGuide: vi.fn(),
      onPrivacy: vi.fn(),
    };
    openSettings(layer, background, handlers, vi.fn());
    layer.querySelector<HTMLElement>('[data-testid="settings-guide"]')?.click();
    layer.querySelector<HTMLElement>('[data-testid="settings-privacy"]')?.click();
    expect(handlers.onGuide).toHaveBeenCalledTimes(1);
    expect(handlers.onPrivacy).toHaveBeenCalledTimes(1);
  });

  it('Hupen-Karte vor dem Level behaelt den Satz, dass die Hupe hier noetig ist', () => {
    setLanguage('de');
    const layer = document.createElement('div');
    openIntro(layer, document.createElement('div'), 'honk', { plain: true, onClosed: vi.fn() });
    expect(layer.querySelector('.intro-text')?.textContent).toBe(
      `${mechanicText('honk')} ${t('introHonkNeed')}`,
    );
  });
});
