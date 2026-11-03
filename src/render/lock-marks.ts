// Zuordnung von Schloessern und Schluesseln: gleiche Nummer = gehoert zusammen.

export interface LockInfo {
  id: string;
  status: string;
  locked: boolean;
  keyId: string | null;
}

export interface LockMark {
  /** Nummer des Schlosses auf diesem Fahrzeug (null: nicht gesperrt). */
  lock: number | null;
  /** Nummer des Schluessels, den dieses Fahrzeug traegt (null: kein Schluessel). */
  key: number | null;
}

export interface LockMarks {
  /** Anzahl verschiedener Schluessel. Nummern werden nur bei mehr als einem angezeigt. */
  count: number;
  of(vehicleId: string): LockMark;
}

/**
 * Nummeriert die Schluessel in der Reihenfolge ihrer Schloesser im Level. Die Nummern bleiben stabil,
 * auch wenn Schloesser entfernt werden (die Engine behaelt `keyId` nach dem Entsperren).
 * Ein Schluessel-Symbol tragen nur Fahrzeuge, deren Schloss noch zu ist.
 */
export function computeLockMarks(vehicles: readonly LockInfo[]): LockMarks {
  const numbers = new Map<string, number>();
  const active = new Set<string>();
  for (const v of vehicles) {
    if (v.keyId === null) continue;
    if (!numbers.has(v.keyId)) numbers.set(v.keyId, numbers.size + 1);
    if (v.locked && v.status === 'parked') active.add(v.keyId);
  }
  const byId = new Map<string, LockMark>();
  for (const v of vehicles) {
    byId.set(v.id, {
      lock: v.locked && v.keyId !== null ? (numbers.get(v.keyId) ?? null) : null,
      key: active.has(v.id) ? (numbers.get(v.id) ?? null) : null,
    });
  }
  return { count: numbers.size, of: (id) => byId.get(id) ?? { lock: null, key: null } };
}
