// Kampagnen-Level und Rulesets laden: JSON per Glob einbinden, mit zod pruefen, Regeln aufloesen.
import { Level, PackIndex, Ruleset, resolveRules } from '../schema';
import type { LocalizedText, Mechanic, ResolvedRules } from '../schema';
import { stageForDifficulty } from './stages';

export interface CampaignLevel {
  /** Stabiler Schluessel `<pack>/<datei>` (z. B. "01/007"), Grundlage fuer Route und Fortschritt. */
  key: string;
  pack: string;
  /** Dateiname ohne Endung ("007"). */
  fileId: string;
  /** Position in der Pack-Reihenfolge, ab 1. */
  number: number;
  level: Level;
  rules: ResolvedRules;
  stage: number;
  /** Weltnummer aus dem Pack-Index (ab 1). */
  world: number;
  /** Mechanik, deren Intro-Karte vor diesem Level gezeigt wird (aus `intros` im Pack-Index). */
  intro?: Mechanic;
}

/** Eine Welt = ein Pack, mit ihren Leveln in Spielreihenfolge. */
export interface CampaignWorld {
  world: number;
  pack: string;
  name: LocalizedText;
  levels: CampaignLevel[];
}

export interface Campaign {
  /** Alle Level aller Welten, nach Welt und dann Pack-Reihenfolge. */
  levels: CampaignLevel[];
  /** Welten aufsteigend nach Nummer (nur Welten mit mindestens einem gueltigen Level). */
  worlds: CampaignWorld[];
  find(pack: string, fileId: string): CampaignLevel | undefined;
  /** Naechstes Level in Pack-Reihenfolge. */
  after(entry: CampaignLevel): CampaignLevel | undefined;
  rulesFor(level: Level): ResolvedRules;
  /** Regeln eines Rulesets, optional mit Overrides (generierte/geteilte Level). Wirft bei unbekanntem Ruleset. */
  rulesOf(rulesetId: string, overrides?: Level['overrides']): ResolvedRules;
}

type Modules = Record<string, unknown>;

/** Pack-Ordner "pack-01" -> Route-Segment "01". */
const packName = (dir: string): string => dir.replace(/^pack-/, '');

const LEVEL_PATH = /levels\/([^/]+)\/([^/]+)\.json$/;

/** Baut die Kampagne aus Glob-Modulen (Level-Dateien, index.json je Pack, Rulesets). */
export function buildCampaign(
  levelFiles: Modules,
  indexFiles: Modules,
  rulesetFiles: Modules,
): Campaign {
  const rulesets = new Map<string, Ruleset>();
  for (const raw of Object.values(rulesetFiles)) {
    const parsed = Ruleset.safeParse(raw);
    if (parsed.success) rulesets.set(parsed.data.id, parsed.data);
  }
  const rulesOf = (rulesetId: string, overrides?: Level['overrides']): ResolvedRules => {
    const ruleset = rulesets.get(rulesetId);
    if (!ruleset) throw new Error(`Unbekanntes Ruleset: ${rulesetId}`);
    return resolveRules(ruleset, overrides);
  };
  const rulesFor = (level: Level): ResolvedRules => rulesOf(level.ruleset, level.overrides);

  const byPath = new Map<string, unknown>();
  for (const [path, mod] of Object.entries(levelFiles)) byPath.set(path, mod);

  const worlds: CampaignWorld[] = [];
  for (const [indexPath, indexRaw] of Object.entries(indexFiles)) {
    const dir = /levels\/([^/]+)\/index\.json$/.exec(indexPath)?.[1];
    const index = PackIndex.safeParse(indexRaw);
    if (!dir || !index.success) continue;
    const pack = packName(dir);
    const { world, name, intros } = index.data;
    const worldLevels: CampaignLevel[] = [];
    for (const fileId of index.data.levels) {
      const entry = [...byPath.entries()].find(([p]) => {
        const m = LEVEL_PATH.exec(p);
        return m?.[1] === dir && m[2] === fileId;
      });
      const parsed = entry ? Level.safeParse(entry[1]) : null;
      if (!parsed?.success) continue;
      try {
        const rules = rulesFor(parsed.data);
        const intro = intros[fileId];
        worldLevels.push({
          key: `${pack}/${fileId}`,
          pack,
          fileId,
          number: worldLevels.length + 1,
          level: parsed.data,
          rules,
          stage: stageForDifficulty(parsed.data.meta?.difficulty),
          world,
          ...(intro ? { intro } : {}),
        });
      } catch {
        // Level mit unbekanntem Ruleset wird uebersprungen.
      }
    }
    if (worldLevels.length > 0) worlds.push({ world, pack, name, levels: worldLevels });
  }
  worlds.sort((a, b) => a.world - b.world || a.pack.localeCompare(b.pack));
  const levels = worlds.flatMap((w) => w.levels);
  return {
    levels,
    worlds,
    find: (pack, fileId) => levels.find((l) => l.pack === pack && l.fileId === fileId),
    after: (entry) => {
      const i = levels.findIndex((l) => l.key === entry.key);
      const next = levels[i + 1];
      return next && next.pack === entry.pack ? next : undefined;
    },
    rulesFor,
    rulesOf,
  };
}

let cached: Campaign | null = null;

/** Die ausgelieferte Kampagne (einmal gebaut). */
export function getCampaign(): Campaign {
  const rulesets = import.meta.glob('../content/rulesets/*.json', {
    eager: true,
    import: 'default',
  });
  cached ??= withE2eFixtures(
    buildCampaign(
      import.meta.glob(['../content/levels/*/*.json', '!../content/levels/*/index.json'], {
        eager: true,
        import: 'default',
      }),
      import.meta.glob('../content/levels/*/index.json', { eager: true, import: 'default' }),
      rulesets,
    ),
    rulesets,
  );
  return cached;
}

/**
 * Nur in E2E-Builds (`VITE_E2E_FIXTURES=1`, siehe playwright.config.ts): Test-Level aus
 * `tests/e2e/fixtures/levels` sind per Route erreichbar (`find`), erscheinen aber in keiner Welt.
 * In normalen Builds entfaellt der Zweig samt Fixture-Dateien beim Bundling.
 */
function withE2eFixtures(campaign: Campaign, rulesets: Modules): Campaign {
  if (import.meta.env.VITE_E2E_FIXTURES !== '1') return campaign;
  const fixtures = buildCampaign(
    import.meta.glob(
      ['../../tests/e2e/fixtures/levels/*/*.json', '!../../tests/e2e/fixtures/levels/*/index.json'],
      { eager: true, import: 'default' },
    ),
    import.meta.glob('../../tests/e2e/fixtures/levels/*/index.json', {
      eager: true,
      import: 'default',
    }),
    rulesets,
  );
  return {
    ...campaign,
    find: (pack, fileId) => campaign.find(pack, fileId) ?? fixtures.find(pack, fileId),
    after: (entry) => campaign.after(entry) ?? fixtures.after(entry),
  };
}
