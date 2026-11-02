// Wendet Einstellungen auf Sprache und Bewegung an.
import { resolveLanguage, setLanguage } from '../i18n';
import type { Lang } from '../i18n';
import { setMotionSetting } from '../render';
import type { LanguageSetting, MotionSetting } from './progress';

/** Setzt die UI-Sprache ('auto' = Browser-Sprache) und das lang-Attribut der Seite. */
export function applyLanguage(setting: LanguageSetting, navigatorLanguage?: string): Lang {
  const lang = resolveLanguage(setting, navigatorLanguage);
  setLanguage(lang);
  document.documentElement.lang = lang;
  return lang;
}

/** Bewegung reduzieren: 'system' folgt prefers-reduced-motion, 'on'/'off' ueberschreibt. */
export function applyMotion(setting: MotionSetting): void {
  setMotionSetting(setting);
  document.documentElement.dataset.motion = setting;
}
