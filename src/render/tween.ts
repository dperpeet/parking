// Kleiner Tween-Helfer auf einem Ticker (kein GSAP).

export interface TickerLike {
  add(fn: (ticker: { deltaMS: number }) => void): unknown;
  remove(fn: (ticker: { deltaMS: number }) => void): unknown;
}

export type Easing = (t: number) => number;

export const easings = {
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
} satisfies Record<string, Easing>;

export interface TweenSpec {
  durationMs: number;
  ease?: Easing;
  /** Wird mit dem eased Fortschritt 0..1 aufgerufen, zuletzt immer mit exakt 1. */
  onUpdate: (progress: number) => void;
}

export class Tweener {
  constructor(
    private readonly ticker: TickerLike,
    /** Bei true laufen Tweens sofort durch (prefers-reduced-motion). */
    private readonly reducedMotion: () => boolean = () => false,
  ) {}

  run(spec: TweenSpec): Promise<void> {
    const ease = spec.ease ?? easings.linear;
    if (this.reducedMotion() || spec.durationMs <= 0) {
      spec.onUpdate(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let elapsed = 0;
      const tick = (t: { deltaMS: number }): void => {
        elapsed += t.deltaMS;
        const p = Math.min(1, elapsed / spec.durationMs);
        spec.onUpdate(p >= 1 ? 1 : ease(p));
        if (p >= 1) {
          this.ticker.remove(tick);
          resolve();
        }
      };
      this.ticker.add(tick);
    });
  }
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
