// Visueller Vertrag (ADR 0001: Comic-Stil), siehe docs/INTERFACES.md.

/** Darstellung je Farb-ID: Fuellfarbe, Kontrastfarbe fuer Symbol/Text, Symbol (Farbenblind-Unterstuetzung). */
export interface ColorStyle {
  fill: string;
  ink: string;
  glyph: string;
  /** Deutscher Name fuer Screenreader-Ansagen. */
  nameDe: string;
  nameEn: string;
}

export const PALETTE: Record<string, ColorStyle> = {
  blue: { fill: '#3D7BFF', ink: '#FFFFFF', glyph: '●', nameDe: 'Blau', nameEn: 'blue' },
  orange: { fill: '#FF9F1C', ink: '#1A1A1A', glyph: '♣', nameDe: 'Orange', nameEn: 'orange' },
  green: { fill: '#2EC27E', ink: '#1A1A1A', glyph: '■', nameDe: 'Grün', nameEn: 'green' },
  yellow: { fill: '#FFD60A', ink: '#1A1A1A', glyph: '★', nameDe: 'Gelb', nameEn: 'yellow' },
  pink: { fill: '#FF6FB5', ink: '#1A1A1A', glyph: '◆', nameDe: 'Pink', nameEn: 'pink' },
  purple: { fill: '#9B5DE5', ink: '#FFFFFF', glyph: '✚', nameDe: 'Lila', nameEn: 'purple' },
  red: { fill: '#FF4D4D', ink: '#1A1A1A', glyph: '♥', nameDe: 'Rot', nameEn: 'red' },
  teal: { fill: '#00BBC9', ink: '#1A1A1A', glyph: '⬟', nameDe: 'Türkis', nameEn: 'teal' },
  brown: { fill: '#A0662D', ink: '#FFFFFF', glyph: '⬢', nameDe: 'Braun', nameEn: 'brown' },
  gray: { fill: '#8D99AE', ink: '#1A1A1A', glyph: '✱', nameDe: 'Grau', nameEn: 'gray' },
};

/** Comic-Theme-Tokens. */
export const THEME = {
  font: "'Baloo 2', system-ui, sans-serif",
  bg: '#FFE7A0',
  ink: '#1A1A1A',
  sub: '#3A3A3A',
  panel: '#FFFFFF',
  outline: '#1A1A1A',
  outlineWidth: 3,
  /** Harter Comic-Schatten: Versatz in px. */
  shadowOffset: 3,
  panelRadius: 18,
  board: '#7ED3C3',
  boardRadius: 22,
  cell: 'rgba(255,255,255,0.35)',
  windshield: 'rgba(255,255,255,0.8)',
  vehicleRadius: 16,
  slotBg: '#FFF6DA',
  accent: '#FF5A5F',
  accentInk: '#1A1A1A',
  star: '#FFB703',
  starOff: '#EFE6CC',
  overlay: 'rgba(26,26,26,0.5)',
  /** Abdunklung gesperrter Fahrzeuge (liegt ueber der Fahrzeugflaeche). */
  lockDim: 'rgba(26,26,26,0.3)',
  /** Poller von oben: Kappe, Reflexring, Kern. */
  bollardCap: '#FF5A5F',
  bollardRing: '#FFFFFF',
  bollardCore: '#1A1A1A',
} as const;
