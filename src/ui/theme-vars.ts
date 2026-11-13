import { PALETTE, THEME } from '../render/theme';

/** Schreibt THEME und PALETTE als CSS-Variablen (--t-*, --c-<id>-fill/ink) auf das Element. */
export function applyThemeVars(el: HTMLElement): void {
  const px = (n: number): string => `${n}px`;
  const vars: Record<string, string> = {
    '--t-font': THEME.font,
    '--t-bg': THEME.bg,
    '--t-ink': THEME.ink,
    '--t-sub': THEME.sub,
    '--t-panel': THEME.panel,
    '--t-outline': THEME.outline,
    '--t-outline-w': px(THEME.outlineWidth),
    '--t-shadow': px(THEME.shadowOffset),
    '--t-panel-radius': px(THEME.panelRadius),
    '--t-board': THEME.board,
    '--t-board-radius': px(THEME.boardRadius),
    '--t-slot-bg': THEME.slotBg,
    '--t-accent': THEME.accent,
    '--t-accent-ink': THEME.accentInk,
    '--t-star': THEME.star,
    '--t-star-off': THEME.starOff,
    '--t-overlay': THEME.overlay,
    '--t-mystery-fill': THEME.mysteryFill,
    '--t-mystery-stripe': THEME.mysteryStripe,
    '--t-mystery-ink': THEME.mysteryInk,
    '--t-one-way-road': THEME.oneWayRoad,
    '--t-one-way-arrow': THEME.oneWayArrow,
  };
  for (const [id, c] of Object.entries(PALETTE)) {
    vars[`--c-${id}-fill`] = c.fill;
    vars[`--c-${id}-ink`] = c.ink;
  }
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}
