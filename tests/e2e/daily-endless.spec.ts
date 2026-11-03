import { expect, test } from '@playwright/test';

test('Tageslevel und Endlos werden generiert und starten', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('card-daily').click();
  await expect(page).toHaveURL(/#\/daily$/);
  await expect(page.locator('.vehicle-btn').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Tageslevel', { exact: true })).toBeVisible();
  await page.getByTestId('back').click();
  await page.getByTestId('card-endless').click();
  await expect(page.locator('.vehicle-btn').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^Endlos · Stufe 1$/)).toBeVisible();
});
