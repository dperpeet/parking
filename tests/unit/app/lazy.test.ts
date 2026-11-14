// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage, t } from '../../../src/i18n';
import { lazyModule, mountChunkPending, whenIdle } from '../../../src/app/lazy';
import type { IdleHost } from '../../../src/app/lazy';

describe('lazyModule', () => {
  it('importiert nur einmal und liefert danach dasselbe Modul', async () => {
    const mod = { name: 'game' };
    const importer = vi.fn(() => Promise.resolve(mod));
    const lazy = lazyModule(importer);
    lazy.prefetch();
    await expect(lazy.load()).resolves.toBe(mod);
    await expect(lazy.load()).resolves.toBe(mod);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('versucht es nach einem Fehler beim naechsten Aufruf erneut', async () => {
    const mod = { name: 'game' };
    const importer = vi
      .fn<() => Promise<typeof mod>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue(mod);
    const lazy = lazyModule(importer);
    await expect(lazy.load()).rejects.toThrow(TypeError);
    await expect(lazy.load()).resolves.toBe(mod);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('prefetch schluckt Fehler und laesst einen spaeteren load neu laden', async () => {
    const importer = vi.fn(() => Promise.reject(new Error('offline')));
    const lazy = lazyModule(importer);
    lazy.prefetch();
    await Promise.resolve();
    await expect(lazy.load()).rejects.toThrow('offline');
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('whenIdle', () => {
  it('nutzt requestIdleCallback mit Timeout und kann abbrechen', () => {
    const host: IdleHost = {
      requestIdleCallback: vi.fn(() => 7),
      cancelIdleCallback: vi.fn(),
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    };
    const fn = vi.fn();
    const cancel = whenIdle(host, fn);
    expect(host.requestIdleCallback).toHaveBeenCalledWith(fn, { timeout: expect.any(Number) });
    expect(host.setTimeout).not.toHaveBeenCalled();
    cancel();
    expect(host.cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('faellt ohne requestIdleCallback auf setTimeout zurueck', () => {
    const host: IdleHost = { setTimeout: vi.fn(() => 3), clearTimeout: vi.fn() };
    const fn = vi.fn();
    const cancel = whenIdle(host, fn);
    expect(host.setTimeout).toHaveBeenCalledWith(fn, expect.any(Number));
    cancel();
    expect(host.clearTimeout).toHaveBeenCalledWith(3);
  });
});

describe('mountChunkPending', () => {
  const DELAY = 300;
  beforeEach(() => {
    vi.useFakeTimers();
    setLanguage('de');
  });
  afterEach(() => vi.useRealTimers());

  function mount(): { root: HTMLElement; retry: () => void; back: () => void } {
    const root = document.createElement('div');
    root.append(document.createElement('p'));
    document.body.append(root);
    return { root, retry: vi.fn(), back: vi.fn() };
  }

  it('zeigt zuerst eine leere Flaeche und erst nach der Verzoegerung Spinner und Text', () => {
    const { root, retry, back } = mount();
    mountChunkPending(root, { delayMs: DELAY, retry, back });
    const layer = root.querySelector('[data-testid="chunk-loading"]');
    expect(root.children).toHaveLength(1);
    expect(layer?.getAttribute('role')).toBe('status');
    expect(layer?.textContent).toBe('');
    vi.advanceTimersByTime(DELAY - 1);
    expect(layer?.textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(layer?.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.textContent).toBe(t('loading'));
  });

  it('dispose entfernt die Flaeche und verhindert die spaete Anzeige', () => {
    const { root, retry, back } = mount();
    const pending = mountChunkPending(root, { delayMs: DELAY, retry, back });
    pending.dispose();
    vi.advanceTimersByTime(DELAY);
    expect(root.children).toHaveLength(0);
  });

  it('fail zeigt Meldung, Wiederholen (fokussiert) und Rueckweg', () => {
    const { root, retry, back } = mount();
    const pending = mountChunkPending(root, { delayMs: DELAY, retry, back });
    pending.fail();
    vi.advanceTimersByTime(DELAY);
    const layer = root.querySelector('[data-testid="chunk-error"]');
    expect(layer?.hasAttribute('role')).toBe(false);
    expect(layer?.querySelector('[role="alert"]')?.textContent).toBe(t('gameLoadFailed'));
    expect(layer?.querySelector('.spinner')).toBeNull();
    const buttons = [...(layer?.querySelectorAll('button') ?? [])];
    expect(buttons.map((b) => b.textContent)).toEqual([t('retry'), t('toMenu')]);
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0]?.click();
    expect(retry).toHaveBeenCalledTimes(1);
    buttons[1]?.click();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
