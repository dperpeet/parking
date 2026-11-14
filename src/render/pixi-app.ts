import { Application } from 'pixi.js';
import type { BoardHost } from './board-view';
import { Tweener, prefersReducedMotion } from './tween';

/** Maximale Aufloesung (Geraete-Pixel pro CSS-Pixel). */
const MAX_DPR = 2;

export interface PixiHandle extends BoardHost {
  app: Application;
  /** Nach Aenderung von Containergroesse oder CSS-Skalierung aufrufen. */
  resize(): void;
  onResize(cb: () => void): void;
  destroy(): void;
}

/**
 * Erzeugt die Pixi-Application im Container. Der Ticker laeuft nur, solange Tweens aktiv sind;
 * sonst wird bei Bedarf einzeln gerendert. Bei verstecktem Tab ruht der Ticker.
 */
export async function createPixiApp(host: HTMLElement): Promise<PixiHandle> {
  const app = new Application();
  const dims = (): { width: number; height: number } => ({
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
  });
  const dpr = (): number => {
    // CSS-Skalierung (transform) des Stage-Elements einrechnen, damit die Ausgabe scharf bleibt.
    const scale = host.clientWidth > 0 ? host.getBoundingClientRect().width / host.clientWidth : 1;
    return Math.min(MAX_DPR, (globalThis.devicePixelRatio || 1) * scale);
  };
  await app.init({
    ...dims(),
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: dpr(),
    autoStart: false,
    // Keine Browser-Erweiterungen (browserAll: Pixi-Events, -Accessibility, Filter, DOMContainer) nachladen:
    // Eingabe und Screenreader laufen ueber die DOM-Buttons, das Brett nutzt nur Graphics und Text.
    skipExtensionImports: true,
  });
  app.ticker.stop();
  host.append(app.canvas);

  const resizeCallbacks: Array<() => void> = [];
  let active = 0;
  // Timer und Promises aus dem Brett koennen nach destroy() noch feuern; dann wird nichts mehr gezeichnet.
  let destroyed = false;
  const ticker = app.ticker;
  const scheduler = {
    add: (fn: (t: { deltaMS: number }) => void): void => {
      if (destroyed) return;
      ticker.add(fn);
      active += 1;
      if (!document.hidden) ticker.start();
    },
    remove: (fn: (t: { deltaMS: number }) => void): void => {
      ticker.remove(fn);
      active = Math.max(0, active - 1);
      if (active === 0 && !destroyed) {
        ticker.stop();
        app.render();
      }
    },
  };

  const resize = (): void => {
    if (destroyed) return;
    const { width, height } = dims();
    app.renderer.resize(width, height, dpr());
    resizeCallbacks.forEach((cb) => cb());
    app.render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const onVisibility = (): void => {
    if (destroyed) return;
    if (document.hidden) ticker.stop();
    else if (active > 0) ticker.start();
    else app.render();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    app,
    stage: app.stage,
    tweener: new Tweener(scheduler, prefersReducedMotion),
    requestRender: () => {
      if (!destroyed && !ticker.started) app.render();
    },
    size: dims,
    resize,
    onResize: (cb) => resizeCallbacks.push(cb),
    destroy: () => {
      destroyed = true;
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      app.destroy(true, { children: true });
    },
  };
}
