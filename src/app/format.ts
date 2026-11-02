import type { Lang } from '../i18n';

/** "2026-11-02" -> "Mo., 2. Nov." (lokales Datum, in der Sprache der App). */
export function formatDay(dateKey: string, lang: Lang): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(y, m - 1, d),
  );
}
