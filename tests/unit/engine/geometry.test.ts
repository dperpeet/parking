import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exitPath, pathToEdge } from '../../../src/engine/geometry';
import type { Grid } from '../../../src/engine/geometry';
import type { Dir } from '../../../src/schema';

const SIZE = 6;
type Arrow = [number, number, Dir];

function grid(arrows: Arrow[] = [], extra: Grid['cells'] = []): Grid {
  return {
    width: SIZE,
    height: SIZE,
    cells: [...arrows.map(([x, y, dir]) => ({ x, y, type: 'oneWay' as const, dir })), ...extra],
  };
}

/** Fahrzeug auf Zeile 2, schaut nach Osten. */
const V = { x: 1, y: 2, dir: 'E' as Dir };

describe('exitPath', () => {
  it('equals pathToEdge without arrows (property, also with fixed cells)', () => {
    const dir = fc.constantFrom<Dir>('N', 'E', 'S', 'W');
    const coord = fc.integer({ min: 0, max: SIZE - 1 });
    const cell = fc.record({ x: coord, y: coord, type: fc.constant('fixed' as const) });
    fc.assert(
      fc.property(coord, coord, dir, fc.array(cell, { maxLength: 6 }), (x, y, d, fixed) => {
        const g = { width: SIZE, height: SIZE, cells: fixed };
        expect(exitPath({ x, y, dir: d }, g)).toEqual({
          path: pathToEdge({ x, y, dir: d }, g),
          exitDir: d,
          wrongWay: null,
          loop: false,
        });
      }),
    );
  });

  it('turns right and left onto an arrow', () => {
    expect(exitPath(V, grid([[3, 2, 'S']]))).toEqual({
      path: [
        [2, 2],
        [3, 2],
        [3, 3],
        [3, 4],
        [3, 5],
      ],
      exitDir: 'S',
      wrongWay: null,
      loop: false,
    });
    const left = exitPath(V, grid([[3, 2, 'N']]));
    expect(left.path).toEqual([
      [2, 2],
      [3, 2],
      [3, 1],
      [3, 0],
    ]);
    expect(left.exitDir).toBe('N');
  });

  it('an arrow in driving direction keeps the straight path', () => {
    expect(exitPath(V, grid([[3, 2, 'E']]))).toEqual(exitPath(V, grid()));
  });

  it('follows a chain of arrows', () => {
    const res = exitPath(
      V,
      grid([
        [3, 2, 'S'],
        [3, 4, 'W'],
      ]),
    );
    expect(res.path).toEqual([
      [2, 2],
      [3, 2],
      [3, 3],
      [3, 4],
      [2, 4],
      [1, 4],
      [0, 4],
    ]);
    expect(res.exitDir).toBe('W');
  });

  it('stops before a wrong-way arrow', () => {
    expect(exitPath(V, grid([[3, 2, 'W']]))).toEqual({
      path: [[2, 2]],
      exitDir: 'E',
      wrongWay: [3, 2],
      loop: false,
    });
  });

  it('an arrow on an edge cell turns the vehicle out sideways', () => {
    const res = exitPath({ x: 1, y: 0, dir: 'E' }, grid([[3, 0, 'N']]));
    expect(res.path).toEqual([
      [2, 0],
      [3, 0],
    ]);
    expect(res.exitDir).toBe('N');
  });

  it('ignores an arrow on the head cell and arrows without dir', () => {
    const g = grid([[1, 2, 'N']], [{ x: 3, y: 2, type: 'oneWay' }]);
    expect(exitPath(V, g)).toEqual(exitPath(V, grid()));
  });

  it('aborts an arrow loop after 4 * width * height steps', () => {
    const loop = grid([
      [2, 2, 'E'],
      [4, 2, 'S'],
      [4, 4, 'W'],
      [2, 4, 'N'],
    ]);
    const res = exitPath({ x: 0, y: 2, dir: 'E' }, loop);
    expect(res.loop).toBe(true);
    expect(res.wrongWay).toBeNull();
    expect(res.path).toHaveLength(4 * SIZE * SIZE);
  });
});
