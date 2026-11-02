// Deterministische Seeds aus Text (FNV-1a, 32 Bit).

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashString(text: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Seed des Tageslevels: hash("parking" + lokales Datum YYYY-MM-DD). */
export function dailySeed(dateKey: string): number {
  return hashString(`parking${dateKey}`);
}

/** Seed fuer "Aehnliches Level": Zaehler + Id des aktuellen Levels. */
export function similarSeed(levelId: string, counter: number): number {
  return hashString(`${levelId}#${counter}`);
}

/** Seed des k-ten Levels in einem Endlos-Run. */
export function endlessSeed(runSeed: number, levelNumber: number): number {
  return hashString(`endless:${runSeed}:${levelNumber}`);
}
