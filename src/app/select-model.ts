// Datenmodell der Levelauswahl aus Kampagne und Spielstand.
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { Mechanic } from '../schema';
import type { LevelSelectModel, TileModel, WorldModel } from '../ui/screens/level-select';
import { formatDay, localizedText } from './format';
import type { Campaign, CampaignWorld } from './levels';
import { MAX_STARS, totalStars } from './progress';
import type { SaveData } from './progress';
import { STAGE_COUNT, clampStage } from './stages';
import { levelOpenFlags, worldOpenFlags } from './unlock';

export interface SelectContext {
  campaign: Campaign;
  save: Readonly<SaveData>;
  today: string;
  lang: Lang;
  persistent: boolean;
  /** Hoechste erreichte Stufe (mindestens 1). */
  reachedStage: number;
  streak: number;
}

/** Mechaniken mit Intro-Karte in der Welt, in Level-Reihenfolge und ohne Doppelte. */
function worldIntros(world: CampaignWorld): Mechanic[] {
  const out: Mechanic[] = [];
  for (const l of world.levels) if (l.intro && !out.includes(l.intro)) out.push(l.intro);
  return out;
}

function worldModel(
  world: CampaignWorld,
  open: boolean,
  save: Readonly<SaveData>,
  lang: Lang,
): WorldModel {
  const order = world.levels.map((l) => l.key);
  const unlocked = levelOpenFlags(world, open, save.levels);
  const tiles: TileModel[] = world.levels.map((l, i) => {
    const result = save.levels[l.key];
    const done = result?.completed === true;
    return {
      key: l.key,
      world: world.world,
      number: l.number,
      state: done ? 'done' : unlocked[i] ? 'open' : 'locked',
      stars: done ? (result?.stars ?? 0) : 0,
    };
  });
  return {
    world: world.world,
    title: t('worldLabel', { n: world.world, name: localizedText(world.name, lang) }),
    locked: !open,
    lockedHint: t('worldLockedHint', { n: world.world - 1 }),
    starsEarned: totalStars(order, save.levels),
    starsTotal: order.length * MAX_STARS,
    tiles,
    intros: open ? worldIntros(world) : [],
  };
}

export function buildSelectModel(ctx: SelectContext): LevelSelectModel {
  const { campaign, save } = ctx;
  const open = worldOpenFlags(campaign.worlds, save.levels);
  const holdStage = clampStage(save.hold.stage || ctx.reachedStage);
  return {
    dailyDate: formatDay(ctx.today, ctx.lang),
    dailyDone: save.daily.lastPlayed === ctx.today,
    streak: ctx.streak,
    endlessBest: save.endless.best,
    holdEnabled: save.hold.enabled,
    holdStage,
    reachedStage: ctx.reachedStage,
    stageCount: STAGE_COUNT,
    worlds: campaign.worlds.map((w, i) => worldModel(w, open[i] ?? false, save, ctx.lang)),
    persistent: ctx.persistent,
  };
}
