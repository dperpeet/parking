// Levelauswahl-Screen: verbindet Fortschritt, Kampagne und Einstellungen mit der UI.
import { getLanguage, onLanguageChange } from '../i18n';
import type { Lang } from '../i18n';
import type { Sound } from '../audio';
import { createLevelSelect, openInfo, openIntro, openSettings } from '../ui';
import type { InfoDialog, InfoFacts, InfoKind, IntroCard, SettingsDialog } from '../ui';
import { HINTS_PER_LEVEL, HINT_STAR_CAP } from './hints';
import type { Campaign } from './levels';
import { Progress, SAVE_KEY, localDateKey, parseImport } from './progress';
import type { Router } from './router';
import { buildSelectModel } from './select-model';
import { applyLanguage, applyMotion } from './settings-apply';

export interface SelectScreenDeps {
  progress: Progress;
  campaign: Campaign;
  router: Router;
  now: () => Date;
  sound: Sound;
}

export interface SelectScreen {
  dispose(): void;
}

const EXPORT_FILE = 'parking-save.json';

/** Werte fuer Anleitung und Datenschutzhinweis, direkt aus den Konstanten der App. */
export const INFO_FACTS: InfoFacts = {
  saveKey: SAVE_KEY,
  hintsPerLevel: HINTS_PER_LEVEL,
  hintStarCap: HINT_STAR_CAP,
};

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
  const { progress, campaign, router, now, sound } = deps;
  let settings: SettingsDialog | null = null;
  let intro: IntroCard | null = null;
  let info: InfoDialog | null = null;
  const dialogLayer = document.createElement('div');
  dialogLayer.className = 'dialog-layer';

  /** Wechsel Einstellungen -> Anleitung/Datenschutz: Fokus nicht zwischendurch aufs Zahnrad. */
  let switching = false;
  let disposed = false;

  /** Aus der Levelauswahl: danach bekommt der ausloesende Knopf (per data-fid) den Fokus zurueck. */
  const showInfo = (kind: InfoKind): void => {
    const active = document.activeElement;
    const fid = active instanceof HTMLElement ? active.dataset.fid : undefined;
    info = openInfo(dialogLayer, view.el, kind, INFO_FACTS, () => {
      info = null;
      if (fid) view.el.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus();
    });
  };

  const showSettings = (focusTestId?: string): void => {
    settings = openSettings(
      dialogLayer,
      view.el,
      {
        getModel: () => ({
          language: getLanguage(),
          motion: progress.get().settings.motion,
          sound: progress.get().settings.sound,
        }),
        onLanguage: (lang: Lang) => {
          progress.setLanguage(lang);
          applyLanguage(lang);
        },
        onMotion: (motion) => {
          progress.setMotion(motion);
          applyMotion(motion);
        },
        onSound: (on) => {
          progress.setSound(on);
          sound.setEnabled(on);
          // Beim Einschalten kurz anspielen, damit man hoert, dass es an ist.
          if (on) sound.play('board');
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
        onGuide: () => openFromSettings('guide', 'settings-guide'),
        onPrivacy: () => openFromSettings('privacy', 'settings-privacy'),
      },
      () => {
        settings = null;
        if (!switching) view.el.querySelector<HTMLElement>('[data-fid="settings"]')?.focus();
      },
    );
    if (focusTestId) {
      dialogLayer.querySelector<HTMLElement>(`[data-testid="${focusTestId}"]`)?.focus();
    }
  };

  /** Aus den Einstellungen: Dialog ersetzt sie, beim Schliessen geht es dorthin zurueck. */
  const openFromSettings = (kind: InfoKind, from: string): void => {
    switching = true;
    settings?.close();
    switching = false;
    info = openInfo(dialogLayer, view.el, kind, INFO_FACTS, () => {
      info = null;
      if (!disposed) showSettings(from);
    });
  };

  const view = createLevelSelect({
    onLevel: (key) => {
      const entry = campaign.levels.find((l) => l.key === key);
      if (entry) router.navigate({ name: 'level', pack: entry.pack, id: entry.fileId });
    },
    onDaily: () => router.navigate({ name: 'daily' }),
    onEndless: () => router.navigate({ name: 'endless' }),
    onSettings: () => showSettings(),
    onGuide: () => showInfo('guide'),
    onPrivacy: () => showInfo('privacy'),
    onHold: (enabled) => {
      const needsStage = enabled && progress.get().hold.stage < 1;
      progress.setHold(enabled, needsStage ? progress.reachedStage() : undefined);
    },
    onHoldStage: (stage) => progress.setHold(true, stage),
    onIntro: (mechanic) => {
      intro = openIntro(dialogLayer, view.el, mechanic, {
        plain: true,
        onClosed: () => {
          intro = null;
          progress.markIntroSeen(mechanic);
          view.el.querySelector<HTMLElement>(`[data-testid="intro-${mechanic}"]`)?.focus();
        },
      });
    },
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
    info?.refresh();
  });

  return {
    dispose() {
      disposed = true;
      offProgress();
      offLang();
      settings?.close();
      intro?.close();
      info?.close();
      root.replaceChildren();
    },
  };
}
