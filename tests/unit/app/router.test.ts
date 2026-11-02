import { describe, expect, it, vi } from 'vitest';
import { createRouter, formatRoute, parseHash, sameRoute } from '../../../src/app/router';
import type { Route } from '../../../src/app/router';

describe('parseHash', () => {
  it('liest alle Routen', () => {
    expect(parseHash('')).toEqual({ name: 'select' });
    expect(parseHash('#')).toEqual({ name: 'select' });
    expect(parseHash('#/')).toEqual({ name: 'select' });
    expect(parseHash('#/level/01/007')).toEqual({ name: 'level', pack: '01', id: '007' });
    expect(parseHash('#/daily')).toEqual({ name: 'daily' });
    expect(parseHash('#/endless')).toEqual({ name: 'endless' });
  });

  it('toleriert Schraegstrich am Ende und Query', () => {
    expect(parseHash('#/daily/')).toEqual({ name: 'daily' });
    expect(parseHash('#/level/01/007?x=1')).toEqual({ name: 'level', pack: '01', id: '007' });
  });

  it('faellt bei Unbekanntem auf die Levelauswahl zurueck', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'select' });
    expect(parseHash('#/level/01')).toEqual({ name: 'select' });
    expect(parseHash('#/level/01/007/extra')).toEqual({ name: 'select' });
    expect(parseHash('#/level/../..')).toEqual({ name: 'select' });
    expect(parseHash('#/level/01/<script>')).toEqual({ name: 'select' });
    expect(parseHash('#/daily/1')).toEqual({ name: 'select' });
  });

  it('formatRoute ist die Umkehrung', () => {
    const routes: Route[] = [
      { name: 'select' },
      { name: 'level', pack: '01', id: '012' },
      { name: 'daily' },
      { name: 'endless' },
    ];
    for (const r of routes) {
      expect(parseHash(formatRoute(r))).toEqual(r);
      expect(sameRoute(r, parseHash(formatRoute(r)))).toBe(true);
    }
    expect(sameRoute({ name: 'daily' }, { name: 'endless' })).toBe(false);
  });
});

describe('createRouter', () => {
  function fakeWindow(): Window {
    const listeners: Array<() => void> = [];
    const win = {
      location: { hash: '' },
      history: {
        replaceState: (_s: unknown, _t: string, url: string) => {
          win.location.hash = url;
        },
      },
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: (_: string, cb: () => void) =>
        listeners.splice(listeners.indexOf(cb), 1),
      fire: () => listeners.slice().forEach((cb) => cb()),
      count: () => listeners.length,
    };
    return win as unknown as Window;
  }

  it('meldet Hash-Aenderungen und navigiert', () => {
    const win = fakeWindow();
    const seen: Route[] = [];
    const router = createRouter(win, (r) => seen.push(r));
    expect(router.current()).toEqual({ name: 'select' });

    win.location.hash = '#/endless';
    (win as unknown as { fire(): void }).fire();
    expect(seen).toEqual([{ name: 'endless' }]);

    router.navigate({ name: 'daily' });
    expect(win.location.hash).toBe('#/daily');
  });

  it('replace aendert die Adresse ohne Listener-Aufruf', () => {
    const win = fakeWindow();
    const onRoute = vi.fn();
    const router = createRouter(win, onRoute);
    router.replace({ name: 'level', pack: '01', id: '008' });
    expect(win.location.hash).toBe('#/level/01/008');
    expect(onRoute).not.toHaveBeenCalled();
  });

  it('navigate auf die aktuelle Adresse ruft den Listener direkt', () => {
    const win = fakeWindow();
    win.location.hash = '#/daily';
    const onRoute = vi.fn();
    createRouter(win, onRoute).navigate({ name: 'daily' });
    expect(onRoute).toHaveBeenCalledWith({ name: 'daily' });
  });

  it('stop entfernt den Listener', () => {
    const win = fakeWindow();
    const router = createRouter(win, () => undefined);
    expect((win as unknown as { count(): number }).count()).toBe(1);
    router.stop();
    expect((win as unknown as { count(): number }).count()).toBe(0);
  });
});
