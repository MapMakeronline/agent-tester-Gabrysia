import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

test.describe('PUBLIKOWANIE', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
    // Navigate to a project with map view
    await page.goto('/');
    const projectLink = page.locator('a[href*="/project"], a[href*="/map"], [data-testid*="project"]').first();
    await projectLink.click();
    await page.waitForURL(/\/(project|map)/, { timeout: 15_000 });
  });

  // ===== TC-PUB-001: Publikowanie WMS =====

  test('TC-PUB-001: Publikowanie WMS - verify WMS publish option and URL', async ({ page }) => {
    // Open the publish / sharing panel
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i], [aria-label*="publish" i], [aria-label*="udostępni" i]'
    ).first();
    await publishBtn.click();

    // Verify the publish panel / dialog is visible
    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"], [data-testid*="share-panel"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Verify WMS option is available
    const wmsOption = page.locator(
      'text=/WMS/i, [data-testid*="wms"], button:has-text("WMS"), label:has-text("WMS")'
    ).first();
    await expect(wmsOption).toBeVisible({ timeout: 10_000 });
    await wmsOption.click();

    // Verify a WMS URL is generated / displayed
    const wmsUrl = page.locator(
      'input[value*="wms" i], input[value*="WMS"], [data-testid*="wms-url"], code:has-text("wms"), text=/\\/wms|service=WMS|GetCapabilities/i'
    ).first();
    await expect(wmsUrl).toBeVisible({ timeout: 10_000 });
  });

  // ===== TC-PUB-002: Publikowanie WFS =====

  test('TC-PUB-002: Publikowanie WFS - verify WFS publish option and URL', async ({ page }) => {
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i]'
    ).first();
    await publishBtn.click();

    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Verify WFS option is available
    const wfsOption = page.locator(
      'text=/WFS/i, [data-testid*="wfs"], button:has-text("WFS"), label:has-text("WFS")'
    ).first();
    await expect(wfsOption).toBeVisible({ timeout: 10_000 });
    await wfsOption.click();

    // Verify a WFS URL is generated / displayed
    const wfsUrl = page.locator(
      'input[value*="wfs" i], input[value*="WFS"], [data-testid*="wfs-url"], code:has-text("wfs"), text=/\\/wfs|service=WFS|GetCapabilities/i'
    ).first();
    await expect(wfsUrl).toBeVisible({ timeout: 10_000 });
  });

  // ===== TC-PUB-003: Kopiowanie URL usługi =====

  test('TC-PUB-003: Kopiowanie URL usługi - verify copy URL button', async ({ page }) => {
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i]'
    ).first();
    await publishBtn.click();

    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Select a service (WMS or WFS) to get a URL
    const serviceOption = page.locator(
      'text=/WMS|WFS/i, [data-testid*="wms"], [data-testid*="wfs"], button:has-text("WMS"), button:has-text("WFS")'
    ).first();
    await serviceOption.click();

    // Find and click the copy URL button
    const copyBtn = page.locator(
      'button:has-text("Kopiuj"), button:has-text("Copy"), [data-testid*="copy"], [aria-label*="kopiuj" i], [aria-label*="copy" i], button svg[data-testid="ContentCopyIcon"], button:has(svg)'
    ).first();
    await expect(copyBtn).toBeVisible({ timeout: 10_000 });
    await copyBtn.click();

    // Verify copy confirmation (toast, tooltip, or button text change)
    const copyConfirmation = page.locator(
      'text=/skopiowano|copied|schowek|clipboard/i, .MuiSnackbar-root, [role="alert"]'
    ).first();
    const confirmVisible = await copyConfirmation.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);

    // Alternative: verify button text or state changed
    const btnTextChanged = await copyBtn.textContent();
    expect(confirmVisible || btnTextChanged?.match(/skopiowano|copied/i)).toBeTruthy();
  });

  // ===== TC-PUB-004: Ustawienie projektu jako publiczny =====

  test('TC-PUB-004: Ustawienie projektu jako publiczny - verify public toggle', async ({ page }) => {
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i]'
    ).first();
    await publishBtn.click();

    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Find the public toggle / switch
    const publicToggle = page.locator(
      '[data-testid*="public"], [role="switch"], input[type="checkbox"], .MuiSwitch-root, label:has-text("Publiczny"), label:has-text("Public"), text=/publiczn|public/i'
    ).first();
    await expect(publicToggle).toBeVisible({ timeout: 10_000 });

    // Verify the toggle is interactive (can be clicked)
    const isEnabled = await publicToggle.isEnabled();
    expect(isEnabled).toBe(true);
  });

  // ===== TC-PUB-005: Generowanie linku do projektu =====

  test('TC-PUB-005: Generowanie linku do projektu - verify share link generation', async ({ page }) => {
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i]'
    ).first();
    await publishBtn.click();

    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Look for the share link section or generate link button
    const shareLinkSection = page.locator(
      '[data-testid*="share-link"], [data-testid*="link"], button:has-text("Generuj link"), button:has-text("Generate link"), text=/link.*projekt|share.*link|udostępni.*link/i'
    ).first();
    await expect(shareLinkSection).toBeVisible({ timeout: 10_000 });

    // If there's a generate button, click it
    const generateLinkBtn = page.locator(
      'button:has-text("Generuj"), button:has-text("Generate"), [data-testid*="generate-link"]'
    ).first();
    const hasGenerateBtn = await generateLinkBtn.isVisible().catch(() => false);
    if (hasGenerateBtn) {
      await generateLinkBtn.click();
    }

    // Verify a link URL is displayed
    const linkUrl = page.locator(
      'input[value*="http"], input[value*="universe-mapmaker"], [data-testid*="share-url"], code, text=/https?:\\/\\//i'
    ).first();
    await expect(linkUrl).toBeVisible({ timeout: 10_000 });
  });

  // ===== TC-PUB-006: Osadzanie mapy (iframe) =====

  test('TC-PUB-006: Osadzanie mapy (iframe) - verify embed/iframe code', async ({ page }) => {
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i]'
    ).first();
    await publishBtn.click();

    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Look for the embed / iframe section
    const embedSection = page.locator(
      '[data-testid*="embed"], [data-testid*="iframe"], button:has-text("Osadź"), button:has-text("Embed"), text=/osadź|embed|iframe/i'
    ).first();
    await expect(embedSection).toBeVisible({ timeout: 10_000 });
    await embedSection.click();

    // Verify iframe code is generated / displayed
    const iframeCode = page.locator(
      'textarea, code, pre, input[value*="iframe"], [data-testid*="embed-code"], [data-testid*="iframe-code"], text=/<iframe/i'
    ).first();
    await expect(iframeCode).toBeVisible({ timeout: 10_000 });

    // Verify the code contains an iframe tag
    const codeText = await iframeCode.textContent() || await iframeCode.inputValue().catch(() => '');
    expect(codeText.toLowerCase()).toContain('iframe');
  });

  // ===== TC-PUB-007: Generowanie URL usługi sieciowej =====

  test('TC-PUB-007: Generowanie URL usługi sieciowej - verify service URL', async ({ page }) => {
    const publishBtn = page.locator(
      'button:has-text("Publikuj"), button:has-text("Publish"), button:has-text("Udostępnij"), button:has-text("Share"), [data-testid*="publish"], [data-testid*="share"], [aria-label*="publikuj" i]'
    ).first();
    await publishBtn.click();

    const publishPanel = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="publish"]'
    ).first();
    await expect(publishPanel).toBeVisible({ timeout: 10_000 });

    // Look for a service URL section (WMS/WFS/general)
    const serviceSection = page.locator(
      'text=/usługa|service|URL|endpoint/i, [data-testid*="service"], [data-testid*="url"]'
    ).first();
    await expect(serviceSection).toBeVisible({ timeout: 10_000 });

    // Verify a URL is present
    const serviceUrl = page.locator(
      'input[value*="http"], input[readonly], [data-testid*="service-url"], code, text=/https?:\\/\\//i'
    ).first();
    await expect(serviceUrl).toBeVisible({ timeout: 10_000 });

    // Verify the URL looks like a valid service endpoint
    const urlText = await serviceUrl.textContent() || await serviceUrl.inputValue().catch(() => '');
    expect(urlText).toMatch(/https?:\/\//);
  });
});
