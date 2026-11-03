import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDailyShareText, pageUrl, shareText, starBar } from '../../../src/app/daily-share';
import { setLanguage } from '../../../src/i18n';

afterEach(() => setLanguage('de'));

const base = { date: '2026-11-03', stars: 3, moves: 9, streak: 4 };

describe('Daily-Share-Text', () => {
  it('de: Sterne, Zuege und Serie', () => {
    setLanguage('de');
    expect(buildDailyShareText(base)).toBe('ParKing 2026-11-03: ★★★ in 9 Zügen · Serie 4');
  });

  it('en: leere Sterne und Plural', () => {
    setLanguage('en');
    expect(buildDailyShareText({ ...base, stars: 2 })).toBe(
      'ParKing 2026-11-03: ★★☆ in 9 moves · streak 4',
    );
    expect(buildDailyShareText({ ...base, moves: 1, streak: 1 })).toBe(
      'ParKing 2026-11-03: ★★★ in 1 move',
    );
  });

  it('Singular de und Serie erst ab 2', () => {
    setLanguage('de');
    expect(buildDailyShareText({ ...base, moves: 1, streak: 1 })).toBe(
      'ParKing 2026-11-03: ★★★ in 1 Zug',
    );
    expect(buildDailyShareText({ ...base, streak: 2 })).toContain('Serie 2');
  });

  it('URL steht in der zweiten Zeile', () => {
    expect(buildDailyShareText({ ...base, streak: 0 }, 'https://x.test/p/')).toBe(
      'ParKing 2026-11-03: ★★★ in 9 Zügen\nhttps://x.test/p/',
    );
  });

  it('starBar klemmt auf 0..3', () => {
    expect(starBar(0)).toBe('☆☆☆');
    expect(starBar(1)).toBe('★☆☆');
    expect(starBar(7)).toBe('★★★');
    expect(starBar(-2)).toBe('☆☆☆');
  });

  it('pageUrl ohne Hash und Query', () => {
    expect(pageUrl({ origin: 'https://x.test', pathname: '/parking/' })).toBe(
      'https://x.test/parking/',
    );
  });
});

describe('shareText', () => {
  const abort = (): Error => Object.assign(new Error('abort'), { name: 'AbortError' });

  it('nutzt navigator.share zuerst', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    expect(await shareText('t', { share, writeText })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 't' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('Abbruch des Share-Dialogs ist kein Fehler und kopiert nicht', async () => {
    const writeText = vi.fn();
    expect(await shareText('t', { share: () => Promise.reject(abort()), writeText })).toBe(
      'cancelled',
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('faellt bei Share-Fehler auf die Zwischenablage zurueck', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareText('t', { share: () => Promise.reject(new Error('x')), writeText })).toBe(
      'copied',
    );
    expect(writeText).toHaveBeenCalledWith('t');
  });

  it('ohne share: Zwischenablage; Fehler oder nichts ergibt manual', async () => {
    expect(await shareText('t', { writeText: () => Promise.resolve() })).toBe('copied');
    expect(await shareText('t', { writeText: () => Promise.reject(new Error('x')) })).toBe(
      'manual',
    );
    expect(await shareText('t', {})).toBe('manual');
  });
});
