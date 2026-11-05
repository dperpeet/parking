// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { setLanguage, t } from '../../../src/i18n';
import { openIntro } from '../../../src/ui/components/intro-card';
import type { Mechanic } from '../../../src/schema';

function open(mechanic: Mechanic): { layer: HTMLElement; onClosed: () => void } {
  const layer = document.createElement('div');
  const background = document.createElement('div');
  const onClosed = vi.fn();
  openIntro(layer, background, mechanic, { plain: true, onClosed });
  return { layer, onClosed };
}

describe('Intro-Karte', () => {
  it('zeigt fuer honk die Grafik mit Burst, hupendem Auto, Blocker und Geisterbild', () => {
    setLanguage('de');
    const { layer } = open('honk');
    const art = layer.querySelector('.intro-art');
    expect(art?.classList.contains('art-honk')).toBe(true);
    expect(layer.querySelector('.art-keys')).toBeNull();
    expect(layer.querySelector('.art-burst-text')?.textContent).toBe(t('honkBubble'));
    expect(layer.querySelectorAll('.art-car')).toHaveLength(2);
    expect(layer.querySelector('.art-honker .art-drive')).not.toBeNull();
    expect(layer.querySelector('.art-blocker')).not.toBeNull();
    expect(layer.querySelector('.art-ghost')).not.toBeNull();
    expect(layer.querySelector('.art-arc')).not.toBeNull();
  });

  it('Intro-Texte fuer honk sind kurz (de und en)', () => {
    for (const lang of ['de', 'en'] as const) {
      setLanguage(lang);
      const { layer } = open('honk');
      const words = layer.querySelector('.intro-text')?.textContent?.split(/\s+/) ?? [];
      expect(words.length, lang).toBeLessThanOrEqual(25);
    }
    setLanguage('en');
    const { layer } = open('honk');
    expect(layer.querySelector('.dlg-title')?.textContent).toBe('Honk');
    expect(layer.querySelector('.art-burst-text')?.textContent).toBe('HONK!');
  });

  it.each([
    ['bollards', 'art-bollards'],
    ['keys', 'art-keys'],
  ] as const)('behaelt die Grafik fuer %s', (mechanic, cls) => {
    const { layer } = open(mechanic);
    expect(layer.querySelector('.intro-art')?.classList.contains(cls)).toBe(true);
  });

  it('schliesst per Start-Knopf', () => {
    const { layer, onClosed } = open('honk');
    layer.querySelector<HTMLButtonElement>('[data-testid="intro-start"]')?.click();
    expect(onClosed).toHaveBeenCalledOnce();
    expect(layer.childElementCount).toBe(0);
  });
});
