// Hash-Router: #/ (Levelauswahl), #/level/<pack>/<id>, #/daily, #/endless,
// #/play?l=<code> (geteiltes Level), #/editor[?l=<code>] (Level-Editor).
import { SHARE_MAX_LENGTH } from '../schema';

export type Route =
  | { name: 'select' }
  | { name: 'level'; pack: string; id: string }
  | { name: 'daily' }
  | { name: 'endless' }
  /** `code` ist ungeprueft (nur Zeichensatz/Laenge begrenzt); dekodiert wird in der Session. */
  | { name: 'shared'; code: string }
  | { name: 'editor'; code: string | null };

/** Routen, die eine Spiel-Session starten. */
export type PlayRoute = Extract<Route, { name: 'level' | 'daily' | 'endless' | 'shared' }>;

/** Zeichen eines Share-Codes: Versionspraefix + base64url. Andere Zeichen werden verworfen. */
const CODE = /^[A-Za-z0-9._-]*$/;

/** Wert von `l` aus dem Query-Teil; null ohne Parameter. Zu lange/ungueltige Codes ergeben "". */
function codeParam(query: string): string | null {
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== 'l') continue;
    const value = pair.slice(eq + 1);
    // Ein Zeichen mehr als erlaubt durchlassen, damit der Codec "tooLong" melden kann.
    if (value.length > SHARE_MAX_LENGTH + 1 || !CODE.test(value)) return '';
    return value;
  }
  return null;
}

const SEGMENT = /^[A-Za-z0-9_-]{1,32}$/;

/** Hash ("#/level/01/007", "#", "") -> Route. Unbekanntes ergibt die Levelauswahl. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = q < 0 ? '' : raw.slice(q + 1);
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
  if (head === 'play' && parts.length === 1) {
    const code = codeParam(query);
    if (code !== null) return { name: 'shared', code };
  }
  if (head === 'editor' && parts.length === 1) return { name: 'editor', code: codeParam(query) };
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
    case 'shared':
      return `#/play?l=${route.code}`;
    case 'editor':
      return route.code === null ? '#/editor' : `#/editor?l=${route.code}`;
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
