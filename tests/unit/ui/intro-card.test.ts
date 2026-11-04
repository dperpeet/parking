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
  it('zeigt fuer honk die eigene Grafik mit Sprechblase', () => {
    setLanguage('de');
    const { layer } = open('honk');
    const art = layer.querySelector('.intro-art');
    expect(art?.classList.contains('art-honk')).toBe(true);
    expect(layer.querySelector('.art-keys')).toBeNull();
    expect(layer.querySelector('.art-bubble')?.textContent).toBe(t('honkBubble'));
    expect(layer.querySelectorAll('.art-car')).toHaveLength(2);
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
