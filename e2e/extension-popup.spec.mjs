import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function openExtensionPopup() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'chronicos-e2e-'));
  const extensionPath = projectRoot.replaceAll('\\', '/');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('#profile-name-input')).toBeVisible();
  return { context, page, userDataDir };
}

test('Quick Mode generates and copies a local message in the real extension popup', async () => {
  const { context, page, userDataDir } = await openExtensionPopup();
  try {
    await page.locator('#profile-name-input').fill('Jordan Lee');
    await page.locator('#profile-headline-input').fill('Machine Learning Engineer');
    await page.locator('#profile-company-input').fill('Example AI');
    await page.locator('#message-objective').fill('learn about AI internship opportunities');

    await page.locator('#review-profile-btn').click();
    await expect(page.locator('#profile-review')).toBeVisible();
    await page.locator('#confirm-profile-btn').click();

    const message = page.locator('#generated-message');
    await expect(message).toHaveValue(/Hi Jordan/);
    await expect(message).toHaveValue(/AI internship opportunities/);

    await page.locator('#copy-btn').click();
    await expect(page.locator('#copy-btn')).toContainText(/Copied/);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('Deep Mode missing-key failure preserves profile data and allows Quick Mode fallback', async () => {
  const { context, page, userDataDir } = await openExtensionPopup();
  try {
    await page.locator('#profile-name-input').fill('Jordan Lee');
    await page.locator('#profile-headline-input').fill('Research Engineer');
    await page.locator('#profile-company-input').fill('Example AI');
    await page.locator('input[name="generation-mode"][value="deep"]').check();
    await page.locator('#review-profile-btn').click();
    await page.locator('#confirm-profile-btn').click();

    await expect(page.locator('#status-message')).toContainText(/requires an Anthropic API key/);
    await expect(page.locator('#profile-review-content')).toContainText('Jordan Lee');
    await page.locator('#edit-profile-btn').click();
    await expect(page.locator('#profile-name-input')).toHaveValue('Jordan Lee');

    await page.locator('input[name="generation-mode"][value="quick"]').check();
    await page.locator('#review-profile-btn').click();
    await page.locator('#confirm-profile-btn').click();
    await expect(page.locator('#generated-message')).toHaveValue(/Jordan/);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
