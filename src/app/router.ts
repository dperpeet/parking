// Hash-Router: #/ (Levelauswahl), #/level/<pack>/<id>, #/daily, #/endless.

export type Route =
  | { name: 'select' }
  | { name: 'level'; pack: string; id: string }
  | { name: 'daily' }
  | { name: 'endless' };

const SEGMENT = /^[A-Za-z0-9_-]{1,32}$/;

/** Hash ("#/level/01/007", "#", "") -> Route. Unbekanntes ergibt die Levelauswahl. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter((p) => p !== '');
  const [head, pack, id] = parts;
  if (
    head === 'level' &&
    parts.length === 3 &&
    pack &&
    id &&
    SEGMENT.test(pack) &&
    SEGMENT.test(id)
  ) {
    return { name: 'level', pack, id };
  }
  if (head === 'daily' && parts.length === 1) return { name: 'daily' };
  if (head === 'endless' && parts.length === 1) return { name: 'endless' };
  return { name: 'select' };
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'select':
      return '#/';
    case 'level':
      return `#/level/${route.pack}/${route.id}`;
    case 'daily':
      return '#/daily';
    case 'endless':
      return '#/endless';
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return formatRoute(a) === formatRoute(b);
}

export interface Router {
  current(): Route;
  /** Neuer Verlaufseintrag (Zurueck-Taste des Browsers funktioniert). */
  navigate(route: Route): void;
  /** Ersetzt den aktuellen Eintrag, ohne den Listener auszuloesen (z. B. Wechsel zum naechsten Level). */
  replace(route: Route): void;
  stop(): void;
}

/** Router auf `window.location.hash`. Der Listener wird bei jeder Aenderung des Hashs gerufen (den Start ruft die App selbst). */
export function createRouter(win: Window, onRoute: (route: Route) => void): Router {
  const handle = (): void => onRoute(parseHash(win.location.hash));
  win.addEventListener('hashchange', handle);
  return {
    current: () => parseHash(win.location.hash),
    navigate: (route) => {
      const hash = formatRoute(route);
      if (win.location.hash === hash) onRoute(route);
      else win.location.hash = hash;
    },
    replace: (route) => {
      const hash = formatRoute(route);
      if (win.location.hash === hash) return;
      // replaceState loest kein hashchange aus; so bleibt der Verlauf [Menue, Level].
      win.history.replaceState(null, '', hash);
    },
    stop: () => win.removeEventListener('hashchange', handle),
  };
}
