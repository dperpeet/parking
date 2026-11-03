// Levelauswahl-Screen: verbindet Fortschritt, Kampagne und Einstellungen mit der UI.
import { getLanguage, onLanguageChange } from '../i18n';
import type { Lang } from '../i18n';
import { createLevelSelect, openSettings } from '../ui';
import type { SettingsDialog } from '../ui';
import type { Campaign } from './levels';
import { Progress, localDateKey, parseImport } from './progress';
import type { Router } from './router';
import { buildSelectModel } from './select-model';
import { applyLanguage, applyMotion } from './settings-apply';

export interface SelectScreenDeps {
  progress: Progress;
  campaign: Campaign;
  router: Router;
  now: () => Date;
}

export interface SelectScreen {
  dispose(): void;
}

const EXPORT_FILE = 'parking-save.json';

function downloadJson(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function mountSelectScreen(root: HTMLElement, deps: SelectScreenDeps): SelectScreen {
  const { progress, campaign, router, now } = deps;
  let settings: SettingsDialog | null = null;
  const dialogLayer = document.createElement('div');
  dialogLayer.className = 'dialog-layer';

  const view = createLevelSelect({
    onLevel: (key) => {
      const entry = campaign.levels.find((l) => l.key === key);
      if (entry) router.navigate({ name: 'level', pack: entry.pack, id: entry.fileId });
    },
    onDaily: () => router.navigate({ name: 'daily' }),
    onEndless: () => router.navigate({ name: 'endless' }),
    onSettings: () => {
      settings = openSettings(
        dialogLayer,
        view.el,
        {
          getModel: () => ({
            language: getLanguage(),
            motion: progress.get().settings.motion,
          }),
          onLanguage: (lang: Lang) => {
            progress.setLanguage(lang);
            applyLanguage(lang);
          },
          onMotion: (motion) => {
            progress.setMotion(motion);
            applyMotion(motion);
          },
          onExport: () => downloadJson(EXPORT_FILE, JSON.stringify(progress.get(), null, 2)),
          validateImport: (text) => parseImport(text) !== null,
          onImport: (text, mode) => {
            const incoming = parseImport(text);
            if (!incoming) return false;
            if (mode === 'replace') progress.replace(incoming);
            else progress.merge(incoming);
            return true;
          },
          onReset: () => progress.reset(),
        },
        () => {
          settings = null;
          view.el.querySelector<HTMLElement>('[data-fid="settings"]')?.focus();
        },
      );
    },
    onHold: (enabled) => {
      const needsStage = enabled && progress.get().hold.stage < 1;
      progress.setHold(enabled, needsStage ? progress.reachedStage() : undefined);
    },
    onHoldStage: (stage) => progress.setHold(true, stage),
    onEditor: () => router.navigate({ name: 'editor', code: null }),
    onCustomPlay: (id) => {
      const entry = progress.customLevels().find((e) => e.id === id);
      if (entry) router.navigate({ name: 'shared', code: entry.code });
    },
    onCustomEdit: (id) => {
      const entry = progress.customLevels().find((e) => e.id === id);
      if (entry) router.navigate({ name: 'editor', code: entry.code });
    },
    onCustomDelete: (id) => progress.deleteCustom(id),
  });

  const refresh = (): void => {
    const today = localDateKey(now());
    view.update({
      ...buildSelectModel({
        campaign,
        save: progress.get(),
        today,
        lang: getLanguage(),
        persistent: progress.isPersistent(),
        reachedStage: progress.reachedStage(),
        streak: progress.currentStreak(today),
      }),
      customLevels: progress
        .customLevels()
        .map((c) => ({ id: c.id, title: c.title, verified: c.verified })),
    });
  };

  root.replaceChildren(view.el, dialogLayer);
  refresh();
  const offProgress = progress.subscribe(refresh);
  const offLang = onLanguageChange(() => {
    refresh();
    settings?.refresh();
  });

  return {
    dispose() {
      offProgress();
      offLang();
      settings?.close();
      root.replaceChildren();
    },
  };
}
