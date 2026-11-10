import { expect, test } from '@playwright/test';

test('Einstellungen: Sprache auf Englisch stellen aendert Beschriftungen und bleibt erhalten', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Tageslevel')).toBeVisible();
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.getByTestId('lang-en').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByTestId('settings-close').click();
  await expect(page.getByText('Daily level')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.getByText('Daily level')).toBeVisible();
});

test('Einstellungen: Zuruecksetzen fragt nach und loescht den Fortschritt', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hold-switch').click();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings').click();
  await page.getByTestId('reset').click();
  await page.getByTestId('reset-cancel').click();
  await expect(page.getByTestId('reset')).toBeVisible();
  await page.getByTestId('reset').click();
  await page.getByTestId('reset-confirm').click();
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('hold-switch')).toHaveAttribute('aria-checked', 'false');
});

test('Einstellungen: Ton-Schalter ist bedienbar und bleibt gespeichert', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('settings').click();
  const sw = page.getByTestId('sound-switch');
  await expect(sw).toBeEnabled();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('sound-switch')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('sound-switch').click();
  await expect(page.getByTestId('sound-switch')).toHaveAttribute('aria-checked', 'true');
});
