// Datenmodell der Levelauswahl aus Kampagne und Spielstand.
import { t } from '../i18n';
import type { Lang } from '../i18n';
import type { LevelSelectModel, TileModel } from '../ui/screens/level-select';
import { formatDay } from './format';
import type { Campaign } from './levels';
import { MAX_STARS, totalStars, unlockedFlags } from './progress';
import type { SaveData } from './progress';
import { STAGE_COUNT, clampStage } from './stages';

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

export function buildSelectModel(ctx: SelectContext): LevelSelectModel {
  const { campaign, save } = ctx;
  const order = campaign.levels.map((l) => l.key);
  const unlocked = unlockedFlags(order, save.levels);
  const tiles: TileModel[] = campaign.levels.map((l, i) => {
    const result = save.levels[l.key];
    const done = result?.completed === true;
    return {
      key: l.key,
      number: l.number,
      state: done ? 'done' : unlocked[i] ? 'open' : 'locked',
      stars: done ? (result?.stars ?? 0) : 0,
    };
  });
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
    worldTitle: t('worldLabel', { n: 1, name: t('worldName1') }),
    starsEarned: totalStars(order, save.levels),
    starsTotal: order.length * MAX_STARS,
    tiles,
    persistent: ctx.persistent,
  };
}
