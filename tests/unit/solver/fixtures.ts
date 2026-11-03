import { Level } from '../../../src/schema';

const base = {
  schema: 'parking.level/1' as const,
  ruleset: 'classic',
  title: 'Test',
};

/** Zwei freie Fahrzeuge verschiedener Farbe, 5 Slots: Reihenfolge egal. */
export const doubleFree = Level.parse({
  ...base,
  id: 'double-free',
  grid: { width: 5, height: 3, cells: [] },
  vehicles: [
    { id: 'v1', pos: [1, 0], dir: 'N', type: 's', color: 'blue' },
    { id: 'v2', pos: [3, 0], dir: 'N', type: 's', color: 'orange' },
  ],
  passengers: ['blue', 'blue', 'orange', 'orange'],
});

/** Wie doubleFree, aber nur 1 Slot: nur v1 zuerst gewinnt. */
export const oneOrder = Level.parse({
  ...base,
  id: 'one-order',
  overrides: { queue: { slots: 1 } },
  grid: { width: 5, height: 3, cells: [] },
  vehicles: [
    { id: 'v1', pos: [1, 0], dir: 'N', type: 's', color: 'blue' },
    { id: 'v2', pos: [3, 0], dir: 'N', type: 's', color: 'orange' },
  ],
  passengers: ['blue', 'blue', 'orange', 'orange'],
});

/** Zwei Fahrzeuge Nase an Nase: kein Zug moeglich. */
export const deadlock = Level.parse({
  ...base,
  id: 'deadlock',
  grid: { width: 4, height: 3, cells: [] },
  vehicles: [
    { id: 'v1', pos: [1, 0], dir: 'E', type: 's', color: 'blue' },
    { id: 'v2', pos: [2, 0], dir: 'W', type: 's', color: 'orange' },
  ],
  passengers: ['blue', 'blue', 'orange', 'orange'],
});
