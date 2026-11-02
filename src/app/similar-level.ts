import type { ColorId, Dir, Level } from '../schema';

const MIRROR: Record<Dir, Dir> = { N: 'N', S: 'S', E: 'W', W: 'E' };

/**
 * "Aehnliches Level": spiegelt das Level horizontal und dreht die Farben reihum
 * (je Schritt eine Position in `colors` weiter). Die Struktur bleibt loesbar, sieht aber neu aus.
 */
export function makeSimilarLevel(level: Level, colors: readonly ColorId[], variant: number): Level {
  const width = level.grid.width;
  const rotate = (c: ColorId): ColorId => {
    const i = colors.indexOf(c);
    if (i < 0 || colors.length === 0) return c;
    return colors[(i + 1) % colors.length] ?? c;
  };
  const baseId = level.id.replace(/-s\d+$/, '');
  return {
    ...level,
    id: `${baseId}-s${variant}`,
    grid: {
      ...level.grid,
      cells: level.grid.cells.map((c) => ({
        ...c,
        x: width - 1 - c.x,
        ...(c.dir ? { dir: MIRROR[c.dir] } : {}),
      })),
    },
    vehicles: level.vehicles.map((v) => ({
      ...v,
      pos: [width - 1 - v.pos[0], v.pos[1]] as [number, number],
      dir: MIRROR[v.dir],
      color: rotate(v.color),
    })),
    passengers: level.passengers.map(rotate),
  };
}
