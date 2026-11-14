import { expect, test } from '@playwright/test';

test('Anleitung: ?-Knopf oeffnet sie, Escape schliesst und gibt den Fokus zurueck', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('guide').click();
  const dialog = page.getByTestId('guide-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Anleitung' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'So geht’s' })).toBeVisible();
  await expect(dialog.getByText('Poller', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Pro Level gibt es 3 Tipps.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('guide')).toBeFocused();
});

test('Datenschutz: aus der Fusszeile und aus den Einstellungen erreichbar', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('footer-privacy').click();
  const dialog = page.getByTestId('privacy-dialog');
  await expect(dialog.getByRole('heading', { name: 'Datenschutz' })).toBeVisible();
  await expect(dialog.getByText('parking.save.v1')).toBeVisible();
  await dialog.getByTestId('info-close').click();
  await expect(dialog).toBeHidden();

  // Aus den Einstellungen: Schliessen fuehrt zurueck in die Einstellungen.
  await page.getByTestId('settings').click();
  await page.getByTestId('lang-en').click();
  await page.getByTestId('settings-privacy').click();
  await expect(dialog.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByTestId('settings-dialog')).toBeHidden();
  await dialog.getByTestId('info-close').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await expect(page.getByTestId('settings-privacy')).toBeFocused();

  await page.getByTestId('settings-guide').click();
  await expect(
    page.getByTestId('guide-dialog').getByRole('heading', { name: 'How to play' }),
  ).toBeVisible();
});
