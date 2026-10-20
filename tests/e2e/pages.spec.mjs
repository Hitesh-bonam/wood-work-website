import { test, expect } from '@playwright/test';
import { watchForProblems, isPhoneSize } from './helpers.mjs';

test('the estimator gives a price range and fills in the WhatsApp message', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('pricing/');
  const form = page.locator('#estimator');
  const out = form.locator('#est-out');
  const size = form.getByLabel('How many sq ft?');
  await expect(out).toHaveText('Enter a size to see an estimate');
  await size.fill('56');
  await expect(out).toHaveText('₹60,000 – ₹74,000');
  await form.locator('label.tier', { hasText: 'Premium' }).click();
  await expect(out).toHaveText('₹86,000 – ₹1,05,000');
  const href = await form.getByRole('link', { name: 'Send this on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(href.split('text=')[1])).toBe('Hi Test Woodworks & Sons, I used the estimator on your website: Wardrobes, 56 sq ft, premium finish, about ₹86,000 – ₹1,05,000. Can you visit and give me a quote?');

  await form.getByLabel('What do you need?').selectOption({ label: 'Painting' });
  await expect(form.getByRole('radio', { name: 'Premium' })).toBeDisabled();
  await expect(form.getByRole('radio', { name: 'Standard' })).toBeChecked();
  await size.fill('1000');
  await expect(out).toHaveText('₹16,000 – ₹20,000');
  await size.fill('0');
  await expect(form.getByText('Enter a number above 0.')).toBeVisible();
  await expect(size).toHaveAttribute('aria-invalid', 'true');
  await size.fill('');
  await expect(form.getByText('Enter a number above 0.')).toBeHidden();
  await expect(out).toHaveText('Enter a size to see an estimate');
  expect(problems).toEqual([]);
});

test('the pricing page shows rates and what past projects cost', async ({ page }) => {
  await page.goto('pricing/');
  await expect(page.locator('.rtable tbody tr')).toHaveText([/Wardrobes\s*₹1,200 \/ sq ft\s*₹1,700 \/ sq ft/, /Painting\s*₹18 \/ sq ft\s*Not offered/, /Repairs\s*Visit ₹500, then quoted/]);
  const past = page.locator('table.past tbody tr');
  await expect(past).toHaveCount(1);
  await expect(past).toContainText('₹1,65,000');
  await past.getByRole('link').click();
  await expect(page).toHaveURL(/project\/1\/$/);
});

test('the materials page shows each material and opens its photo', async ({ page }) => {
  await page.goto('materials/');
  await expect(page.locator('.mcard figcaption strong')).toHaveText(['BWP ply', 'Laminate']);
  await expect(page.locator('.mcard figcaption span')).toHaveText(['Strong and waterproof']);
  await page.locator('.mcard a').first().click();
  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
  await expect(viewer.locator('.v-title')).toHaveText('Materials we use · 1 / 2');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('the contact page has every way to reach the business', async ({ page }) => {
  await page.goto('contact/');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000001\?text=/);
  await expect(main.getByRole('link', { name: 'Call 90000 00001' })).toHaveAttribute('href', 'tel:+919000000001');
  await expect(main.getByRole('link', { name: 'hello@example.com' })).toHaveAttribute('href', 'mailto:hello@example.com');
  await expect(main.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\//);
  await expect(main.getByText('Mon to Sat, 9 to 6')).toBeVisible();
  await expect(main.getByText('North, South')).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Our team' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/testwoodworks');
});

test('an address that does not exist shows a friendly page', async ({ page }) => {
  const response = await page.goto('does-not-exist/');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.getByRole('main').getByRole('link', { name: 'See all projects' }).click();
  await expect(page).toHaveURL(/\/woodwork-test\/$/);
});

test('the menu is a bottom bar on phones and a top menu on bigger screens', async ({ page }) => {
  await page.goto('./');
  const phone = isPhoneSize(page);
  const bottom = page.getByRole('navigation', { name: 'Main menu' });
  const top = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(bottom).toBeVisible({ visible: phone });
  await expect(top).toBeVisible({ visible: !phone });
  const menu = phone ? bottom : top;
  await expect(menu.getByRole('link')).toHaveText(['Gallery', 'Pricing', 'Materials', 'Contact']);
  await menu.getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/pricing\/$/);
  await expect(menu.getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('link', { name: 'Gallery' }).click();
  await expect(page).toHaveURL(/\/woodwork-test\/$/);
});

test('the header buttons call and message the business', async ({ page }) => {
  await page.goto('./');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919000000001');
  await expect(header.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000001\?text=/);
});
