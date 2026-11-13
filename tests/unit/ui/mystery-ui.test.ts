// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Progress } from '../../../src/app/progress';
import type { StorageLike } from '../../../src/app/progress';
import type { GameEvent, GameState } from '../../../src/engine';
import { setLanguage, t } from '../../../src/i18n';
import { openIntro } from '../../../src/ui/components/intro-card';
import { announce, hintAnnouncement, vehicleLabel } from '../../../src/ui/strings';
import { createVehicleButtons } from '../../../src/ui/vehicle-buttons';
import type { LevelSpec } from '../engine/helpers';
import { setup, tap, v } from '../engine/helpers';
import { step } from '../../../src/engine';

const M = { mystery: true };

/** a (blau) blockiert m1 (gruen) und m2 (pink); beide starten verdeckt. */
const TWO: LevelSpec = {
  vehicles: [
    v('a', 5, 0, 'E', 's', 'blue'),
    v('m2', 4, 2, 'N', 's', 'pink', M),
    v('m1', 2, 0, 'E', 's', 'green', M),
  ],
  passengers: ['blue', 'blue', 'green', 'green', 'pink', 'pink'],
  overrides: { special: { mysteryVehicles: true } },
};

/** Alle Schreibweisen der verdeckten Farben (de und en, auch dekliniert). */
const LEAK = /gr(ü|u)n|green|pink/i;

class MemStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, val: string): void => void this.m.set(k, val);
  removeItem = (k: string): void => void this.m.delete(k);
}

const byId = (state: GameState, id: string) => state.vehicles.find((x) => x.id === id)!;

afterEach(() => setLanguage('de'));

describe('Mystery-Fahrzeuge: Texte verraten die Farbe nicht', () => {
  const { state, rules } = setup(TWO);

  it.each(['de', 'en'] as const)(
    'Labels, Tipps und Ansagen fuer verdeckte Fahrzeuge (%s)',
    (lang) => {
      setLanguage(lang);
      const texts: string[] = [];
      for (const id of ['m1', 'm2']) {
        const veh = byId(state, id);
        expect(veh.hidden).toBe(true);
        texts.push(vehicleLabel(veh));
        texts.push(vehicleLabel(veh, { mark: { lock: 1, key: 2 }, count: 2 }));
        texts.push(hintAnnouncement(veh));
        texts.push(hintAnnouncement(veh, 'honk'));
      }
      // Ein verdecktes Fahrzeug antippen: blockiert, die Ansage nennt es ohne Farbe.
      const blocked = step(state, tap('m1'), rules).events;
      expect(blocked.map((e) => e.type)).toEqual(['vehicleBlocked']);
      for (const e of blocked) texts.push(announce(e, state) ?? '');
      // Hupe/Ausweichen und Schluessel mit verdecktem Fahrzeug.
      const yielded: GameEvent = {
        type: 'vehicleYielded',
        vehicleId: 'm1',
        byVehicleId: 'a',
        from: [2, 0],
        to: [2, 1],
      };
      texts.push(announce(yielded, state) ?? '');
      const lockedState: GameState = {
        ...state,
        vehicles: state.vehicles.map((x) =>
          x.id === 'a' ? { ...x, locked: true, keyId: 'm2' } : x,
        ),
      };
      const lockedEvent: GameEvent = {
        type: 'vehicleBlocked',
        vehicleId: 'a',
        reason: 'locked',
        blockerId: null,
      };
      texts.push(announce(lockedEvent, lockedState) ?? '');
      for (const text of texts) {
        expect(text, text).not.toMatch(LEAK);
        expect(text.length).toBeGreaterThan(0);
      }
      expect(vehicleLabel(byId(state, 'm1'))).toContain(t('vehicleUnknown'));
      expect(hintAnnouncement(byId(state, 'm2'), 'honk')).toBe(
        lang === 'de'
          ? 'Tipp: mit dem unbekannten Fahrzeug hupen'
          : 'Hint: honk with the unknown vehicle',
      );
    },
  );

  it('nach dem Aufdecken: Ansage und Label nennen die Farbe', () => {
    const res = step(state, tap('a'), rules);
    const reveals = res.events.filter((e) => e.type === 'vehicleRevealed');
    expect(reveals.map((e) => e.type === 'vehicleRevealed' && e.vehicleId)).toEqual(['m2', 'm1']);
    setLanguage('de');
    expect(reveals.map((e) => announce(e, res.state))).toEqual([
      'Aufgedeckt: Pinkes Fahrzeug',
      'Aufgedeckt: Grünes Fahrzeug',
    ]);
    expect(vehicleLabel(byId(res.state, 'm1'))).toMatch(/^Grünes Fahrzeug/);
    setLanguage('en');
    expect(announce(reveals[1]!, res.state)).toBe('Revealed: Green vehicle');
  });

  it('Fahrzeug-Knoepfe: aria-label ohne Farbe, data-hidden bis zum Aufdecken', () => {
    setLanguage('de');
    const layer = document.createElement('div');
    const buttons = createVehicleButtons(layer, vi.fn());
    buttons.update(state);
    const btn = (id: string) => layer.querySelector<HTMLElement>(`[data-vehicle="${id}"]`)!;
    expect(btn('m1').getAttribute('data-hidden')).toBe('true');
    expect(btn('a').hasAttribute('data-hidden')).toBe(false);
    expect(layer.innerHTML).not.toMatch(LEAK);
    expect(btn('m1').getAttribute('aria-label')).toMatch(/^Fahrzeug mit unbekannter Farbe/);
    const after = step(state, tap('a'), rules).state;
    buttons.update(after);
    expect(btn('m1').hasAttribute('data-hidden')).toBe(false);
    expect(btn('m1').getAttribute('aria-label')).toMatch(/^Grünes Fahrzeug/);
  });
});

describe('Mystery: Intro-Karte und Spielstand', () => {
  it.each(['de', 'en'] as const)('zeigt Grafik mit "?"-Auto und kurzem Text (%s)', (lang) => {
    setLanguage(lang);
    const layer = document.createElement('div');
    openIntro(layer, document.createElement('div'), 'mystery', { plain: true, onClosed: vi.fn() });
    expect(layer.querySelector('[data-mechanic="mystery"]')).not.toBeNull();
    expect(layer.querySelector('.art-mystery')?.textContent).toBe('?');
    expect(layer.querySelector('.dlg-title')?.textContent).toBe(t('introMysteryTitle'));
    const text = layer.querySelector('.intro-text')?.textContent ?? '';
    expect(text).toBe(t('introMysteryText'));
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it('merkt sich das Mystery-Intro additiv; alte und unbekannte Eintraege bleiben harmlos', () => {
    const storage = new MemStorage();
    const old = new Progress(() => storage);
    old.markIntroSeen('honk');
    const raw = JSON.parse(storage.getItem('parking.save.v1')!) as { seenIntros: unknown[] };
    storage.setItem(
      'parking.save.v1',
      JSON.stringify({ ...raw, seenIntros: [...raw.seenIntros, 'kaputt'] }),
    );
    const progress = new Progress(() => storage);
    expect(progress.hasSeenIntro('honk')).toBe(true);
    expect(progress.hasSeenIntro('mystery')).toBe(false);
    progress.markIntroSeen('mystery');
    expect(new Progress(() => storage).get().seenIntros).toEqual(['honk', 'mystery']);
  });
});
