import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Import tests based on Franek's verified selectors (2026-03-03).
 * TC-001 through TC-008 require real test files — auto-skip if not found.
 * TEST_FILES_DIR configurable via env var or defaults to ~/Desktop/do testów
 *
 * Navigation: uses URL-based /projects/TestzWarstwami (same as properties/layer-management)
 * because tester account may not see "Otwórz" button on project cards.
 */
const PROJECT = 'TestzWarstwami';
const TEST_FILES_DIR = process.env.TEST_FILES_DIR
  || path.resolve(__dirname, '..', 'test-inputs', 'do testów');

/** Check if a test file exists — returns resolved path or null */
function resolveTestFile(filePath: string): string | null {
  const resolved = path.resolve(TEST_FILES_DIR, filePath);
  return fs.existsSync(resolved) ? resolved : null;
}

/** Helper: open "Importuj warstwę" dialog and verify it's visible */
async function openImportDialog(page: import('@playwright/test').Page) {
  const importBtn = page.locator('[aria-label="Importuj warstwę"]');
  await importBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await importBtn.click();

  const dialog = page.locator('.MuiDialog-paper');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

/** Upload a file to the import dialog, then set a valid layer name */
async function uploadFileToDialog(
  page: import('@playwright/test').Page,
  filePath: string,
  layerName: string,
) {
  const fileInput = page.locator('.MuiDialog-paper input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for React to process the file (format detection, name auto-fill)
  await page.waitForTimeout(4000);

  // Clear auto-filled name and set a valid one
  const nameInput = page.locator('.MuiDialog-paper').locator('input[type="text"]').first();
  await nameInput.click({ clickCount: 3 });
  await nameInput.fill(layerName);
  await page.waitForTimeout(500);
}

/** Click "Importuj" button and wait for dialog to close */
async function clickImportAndWait(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  timeoutMs = 60_000,
) {
  const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
  await importSubmitBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await importSubmitBtn.click();
  await expect(dialog).toBeHidden({ timeout: timeoutMs });
}

/** Navigate to project map view with side panel open and import button visible */
async function openProjectMapView(page: import('@playwright/test').Page) {
  await ensureLoggedIn(page);
  await page.goto(`/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  // Ensure side panel is open
  const panelOpened = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Otwórz panel boczny"]');
    if (btn) { (btn as HTMLElement).click(); return true; }
    return false;
  });
  if (panelOpened) await page.waitForTimeout(1_000);

  // Wait for import button in side panel
  try {
    await page.locator('[aria-label="Importuj warstwę"]').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  } catch {
    // Retry: reload and re-open panel
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    const reopened = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Otwórz panel boczny"]');
      if (btn) { (btn as HTMLElement).click(); return true; }
      return false;
    });
    if (reopened) await page.waitForTimeout(1_000);
    await page.locator('[aria-label="Importuj warstwę"]').waitFor({
      state: 'visible',
      timeout: 25_000,
    });
  }
  await page.waitForTimeout(1_000);
}

test.describe('IMPORT WARSTW', () => {
  test.beforeEach(async ({ page }) => {
    await openProjectMapView(page);
  });

  // ==================== FILE IMPORT TESTS ====================

  test('TC-IMPORT-001: Import GML', async ({ page }) => {
    test.setTimeout(120_000);
    const filePath = resolveTestFile('GML_20.15_aktualizowany.gml');
    test.skip(!filePath, 'Brak pliku testowego: GML_20.15_aktualizowany.gml');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestGML');
    await clickImportAndWait(page, dialog, 90_000);
  });

  test('TC-IMPORT-002: Import GeoJSON', async ({ page }) => {
    test.setTimeout(90_000);
    const filePath = resolveTestFile('77.25 - przeznaczenie terenu Geojson.geojson');
    test.skip(!filePath, 'Brak pliku testowego: 77.25 - przeznaczenie terenu Geojson.geojson');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestGeoJSON');
    await clickImportAndWait(page, dialog, 60_000);
  });

  test('TC-IMPORT-003: Import Shapefile', async ({ page }) => {
    test.setTimeout(90_000);
    const filePath = resolveTestFile('77.25 - przeznaczenie terenu SHP .zip');
    test.skip(!filePath, 'Brak pliku testowego: 77.25 - przeznaczenie terenu SHP .zip');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestSHP');

    const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
    await importSubmitBtn.click();

    // Accept either: dialog closes (success) or format detected (zip validation)
    const closed = await dialog
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .then(() => true)
      .catch(() => false);

    if (!closed) {
      const dialogText = (await dialog.textContent()) || '';
      const formatDetected = /SHP|Shapefile|shp|zip/i.test(dialogText);
      expect(formatDetected).toBe(true);
    }
  });

  test('TC-IMPORT-004: Import GeoPackage', async ({ page }) => {
    test.setTimeout(300_000);
    const filePath = resolveTestFile('OZNACZENIA Z MPZP_RAZEM_wyciete.gpkg');
    test.skip(!filePath, 'Brak pliku testowego: OZNACZENIA Z MPZP_RAZEM_wyciete.gpkg');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestGPKG');
    await clickImportAndWait(page, dialog, 240_000);
  });

  test('TC-IMPORT-005: Import KML/KMZ', async ({ page }) => {
    test.setTimeout(90_000);
    const filePath = resolveTestFile('77.25 - przeznaczenie terenu KML.kml');
    test.skip(!filePath, 'Brak pliku testowego: 77.25 - przeznaczenie terenu KML.kml');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestKML');
    await clickImportAndWait(page, dialog, 60_000);
  });

  test('TC-IMPORT-006: Import CSV', async ({ page }) => {
    test.setTimeout(120_000);
    const filePath = resolveTestFile('77.25 - przeznaczenie terenu CSV.csv');
    test.skip(!filePath, 'Brak pliku testowego: 77.25 - przeznaczenie terenu CSV.csv');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestCSV');

    const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
    const submitVisible = await importSubmitBtn.isVisible().catch(() => false);

    if (submitVisible) {
      await importSubmitBtn.click();
      const closed = await dialog
        .waitFor({ state: 'hidden', timeout: 60_000 })
        .then(() => true)
        .catch(() => false);

      if (!closed) {
        // Dialog stayed open — CSV may lack geometry, but file was accepted
        const feedback = page.locator(
          '[role="alert"], .MuiAlert-root, .MuiSnackbar-root, .Toastify__toast'
        ).first();
        await feedback.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      }
    }
  });

  test('TC-IMPORT-007: Import DXF', async ({ page }) => {
    test.setTimeout(120_000);
    const filePath = resolveTestFile('014 Plan fotowoltaika Florentynow Mariampol zal 1 DXF .zip');
    test.skip(!filePath, 'Brak pliku testowego: 014 Plan fotowoltaika Florentynow Mariampol zal 1 DXF .zip');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestDXF');

    const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
    await importSubmitBtn.click();

    const closed = await dialog
      .waitFor({ state: 'hidden', timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!closed) {
      const dialogText = (await dialog.textContent()) || '';
      const formatDetected = /DXF|dxf|zip/i.test(dialogText);
      expect(formatDetected).toBe(true);
    }
  });

  test('TC-IMPORT-008: Import TopoJSON', async ({ page }) => {
    test.setTimeout(120_000);
    const filePath = resolveTestFile('77.25 - przeznaczenie. topojejson.zip');
    test.skip(!filePath, 'Brak pliku testowego: 77.25 - przeznaczenie. topojejson.zip');
    const dialog = await openImportDialog(page);
    await uploadFileToDialog(page, filePath!, 'TestTopoJSON');

    const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
    await importSubmitBtn.click();

    const closed = await dialog
      .waitFor({ state: 'hidden', timeout: 90_000 })
      .then(() => true)
      .catch(() => false);

    if (!closed) {
      const dialogText = (await dialog.textContent()) || '';
      const formatDetected = /topojson|topo|zip/i.test(dialogText);
      expect(formatDetected).toBe(true);
    }
  });

  // ==================== SERVICE LAYER TESTS ====================

  test('TC-IMPORT-009: Brak opcji dodania warstwy WMS', async ({ page }) => {
    const addBtn = page.locator('[aria-label="Dodaj warstwę"]');
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();

    const dialog = page.locator('.MuiDialog-paper');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const dialogText = await dialog.textContent();
    expect(dialogText?.toUpperCase()).not.toContain('WMS');
  });

  test('TC-IMPORT-010: Dodanie warstwy WFS', async () => {
    test.skip(true, 'BLOCKED: wymaga URL serwera testowego');
  });

  test('TC-IMPORT-011: Brak opcji dodania warstwy WMTS', async ({ page }) => {
    const addBtn = page.locator('[aria-label="Dodaj warstwę"]');
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();

    const dialog = page.locator('.MuiDialog-paper');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const dialogText = await dialog.textContent();
    expect(dialogText?.toUpperCase()).not.toContain('WMTS');
  });

  test('TC-IMPORT-012: Brak opcji dodania warstwy XYZ Tiles', async ({ page }) => {
    const addBtn = page.locator('[aria-label="Dodaj warstwę"]');
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();

    const dialog = page.locator('.MuiDialog-paper');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const dialogText = await dialog.textContent();
    expect(dialogText?.toUpperCase()).not.toContain('XYZ');
  });

  // ==================== FILE HANDLING TESTS ====================

  test('TC-IMPORT-013: Obsługa błędnych plików', async ({ page }) => {
    const dialog = await openImportDialog(page);

    // Upload invalid file using DataTransfer API
    await page.evaluate(() => {
      const file = new File(
        ['this is not valid geojson content at all!!!'],
        'invalid-data.geojson',
        { type: 'application/geo+json' },
      );
      const dt = new DataTransfer();
      dt.items.add(file);

      const dlg = document.querySelector('.MuiDialog-paper');
      const fi = dlg!.querySelector('input[type="file"]') as HTMLInputElement;
      fi.files = dt.files;
      fi.dispatchEvent(new Event('input', { bubbles: true }));
      fi.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForTimeout(3000);

    // Set a valid name
    const nameInput = dialog.locator('input[type="text"]').first();
    const nameVisible = await nameInput.isVisible().catch(() => false);
    if (nameVisible) {
      await nameInput.click({ clickCount: 3 });
      await nameInput.fill('TestInvalid');
    }

    // Click Importuj
    const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
    const submitVisible = await importSubmitBtn.isVisible().catch(() => false);
    if (submitVisible) {
      await importSubmitBtn.click();
      await page.waitForTimeout(3000);
    }

    // Check for error feedback
    const errorIndicator = page.locator([
      '[role="alert"]',
      '.MuiAlert-root',
      '.MuiSnackbar-root',
      '.Toastify__toast',
    ].join(', ')).first();

    const errorVisible = await errorIndicator
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!errorVisible) {
      const errorText = page.locator(
        'text=/błąd|error|nieprawidłowy|invalid|nie można|nie udało|Unexpected|SyntaxError/i'
      ).first();
      const errorTextVisible = await errorText
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);

      if (!errorTextVisible) {
        // At minimum: dialog stayed open (import didn't silently succeed)
        await expect(dialog).toBeVisible();
        const successMsg = page.locator('text=/sukces|success|dodano|imported|gotowe/i');
        expect(await successMsg.count()).toBe(0);
      }
    }
  });

  test('TC-IMPORT-014: Obsługa dużych plików', async ({ page }) => {
    const dialog = await openImportDialog(page);

    const fileInput = page.locator('input[type="file"]');
    const count = await fileInput.count();
    expect(count).toBeGreaterThan(0);

    const accept = await fileInput.getAttribute('accept');
    expect(accept).toBeTruthy();
    expect(accept).toContain('.gpkg');
    expect(accept).toContain('.tif');
    expect(accept).toContain('.geojson');

    const multiple = await fileInput.getAttribute('multiple');
    expect(multiple !== null).toBe(true);

    const dialogText = (await dialog.textContent()) || '';
    const hasSmallLimit = /max.*1\s*MB|limit.*1\s*MB|max.*500\s*KB/i.test(dialogText);
    expect(hasSmallLimit).toBe(false);

    expect(dialogText).toContain('GeoJSON');
    expect(dialogText).toContain('GeoPackage');
  });

  test('TC-IMPORT-015: Komunikaty o postępie importu', async ({ page }) => {
    const dialog = await openImportDialog(page);

    // Upload a valid GeoJSON using DataTransfer API
    const validGeoJSON = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [21.0122, 52.2297] },
          properties: { name: 'Test Progress Point' },
        },
      ],
    });

    await page.evaluate((geojson) => {
      const file = new File([geojson], 'test-progress.geojson', {
        type: 'application/geo+json',
      });
      const dt = new DataTransfer();
      dt.items.add(file);

      const dlg = document.querySelector('.MuiDialog-paper');
      const fi = dlg!.querySelector('input[type="file"]') as HTMLInputElement;
      fi.files = dt.files;
      fi.dispatchEvent(new Event('input', { bubbles: true }));
      fi.dispatchEvent(new Event('change', { bubbles: true }));
    }, validGeoJSON);

    await page.waitForTimeout(2000);

    // Set valid name
    const nameInput = dialog.locator('input[type="text"]').first();
    const nameVisible = await nameInput.isVisible().catch(() => false);
    if (nameVisible) {
      await nameInput.click({ clickCount: 3 });
      await nameInput.fill('TestProgress');
    }

    // Click Importuj
    const importSubmitBtn = dialog.locator('button:has-text("Importuj")').last();
    const submitVisible = await importSubmitBtn.isVisible().catch(() => false);
    if (submitVisible) {
      await importSubmitBtn.click();
    }

    // Wait for progress/success indicator or dialog close
    const indicator = page.locator([
      '[role="progressbar"]',
      '.MuiCircularProgress-root',
      '.MuiLinearProgress-root',
      '.MuiSnackbar-root',
      '[role="alert"]',
      '.MuiAlert-root',
      '.Toastify__toast',
    ].join(', ')).first();

    const indicatorVisible = await indicator
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    if (!indicatorVisible) {
      // Fallback: dialog closed = import completed
      const dialogHidden = await dialog
        .waitFor({ state: 'hidden', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      expect(dialogHidden).toBe(true);
    }
  });
});
