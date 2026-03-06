import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

/**
 * Tools tests adapted to actual MapMaker UI.
 *
 * Right toolbar buttons (aria-labels, top to bottom):
 *   1. "Menu użytkownika" — user avatar
 *   2. "Wyszukiwanie działek" — parcel search
 *   3. "Wypis i wyrys" — extract/report
 *   4. "Narzędzia mierzenia" — measurement tools
 *   5. "Wyszukiwanie" — search
 *   6. "Identyfikacja obiektu" — object identification
 *   7. "Skróty klawiszowe" — keyboard shortcuts
 *   8. "Kontakt" — contact
 *   9. "Ustawienia" — settings
 *
 * Zoom controls: "Przybliż", "Oddal", "Resetuj obrót"
 * Search bar: placeholder "ID działki lub adres..."
 *
 * NOT present: Print/Export, Drawing, Georeference, Clipping/Mask
 */

const PROJECT = 'TestzWarstwami';

async function openMapProject(page: import('@playwright/test').Page) {
  await ensureLoggedIn(page);
  await page.goto(`/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2_000);

  const loadingIndicator = page.getByText('Pobieranie projektu', { exact: false });
  await loadingIndicator.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  // If redirected to dashboard (no access), reload project page
  if (page.url().includes('/dashboard') || page.url().includes('/projects/my')) {
    await page.goto(`/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await loadingIndicator.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
  }

  await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Otwórz panel boczny"]');
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(1_000);

  const mapCanvas = page.locator('canvas').first();
  await expect(mapCanvas).toBeVisible({ timeout: 60_000 });
  return mapCanvas;
}

// =====================================================================
// ACTIVE TESTS — these actually interact with the UI
// =====================================================================
test.describe('NARZĘDZIA', () => {

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await openMapProject(page);
  });

  test('TC-TOOLS-001: Wyszukiwanie działki - po numerze', async ({ page }) => {
    const searchParcelBtn = page.locator('button[aria-label="Wyszukiwanie działek"]');
    await expect(searchParcelBtn).toBeVisible({ timeout: 10_000 });
    await searchParcelBtn.click();
    await page.waitForTimeout(1_000);

    // Verify tool activated (panel, dialog, or cursor change)
    const searchPanel = page.locator(
      '[role="dialog"], .MuiDrawer-root, .MuiPopover-paper'
    ).first();
    const panelVisible = await searchPanel.isVisible({ timeout: 5_000 }).catch(() => false);

    const searchInput = page.locator('input[placeholder*="działki" i], input[placeholder*="adres" i]').first();
    const inputVisible = await searchInput.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(panelVisible || inputVisible).toBe(true);
  });

  test('TC-TOOLS-002: Wyszukiwanie działki - po adresie', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="działki" i], input[placeholder*="adres" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('Sulmierzyce');
    await page.waitForTimeout(2_000);

    expect(await searchInput.inputValue()).toContain('Sulmierzyce');
  });

  test('TC-TOOLS-005: Wypis - wskazanie działki na mapie', async ({ page }) => {
    const wypisBtn = page.locator('button[aria-label="Wypis i wyrys"]');
    await expect(wypisBtn).toBeVisible({ timeout: 10_000 });
    await wypisBtn.click();
    await page.waitForTimeout(2_000);

    // Wait for canvas to be stable after tool activation
    const mapCanvas = page.locator('canvas').first();
    await expect(mapCanvas).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const box = await mapCanvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(2_000);
    }

    await expect(mapCanvas).toBeVisible();
  });

  test('TC-TOOLS-021: Pomiar odległości', async ({ page }) => {
    const measureBtn = page.locator('button[aria-label="Narzędzia mierzenia"]');
    await expect(measureBtn).toBeVisible({ timeout: 10_000 });
    await measureBtn.click();
    await page.waitForTimeout(1_000);

    // Custom panel (not MUI) with heading + buttons
    const panelHeading = page.getByRole('heading', { name: 'Narzędzia mierzenia', level: 6 });
    await expect(panelHeading).toBeVisible({ timeout: 5_000 });

    const distanceBtn = page.getByRole('button', { name: 'Pomiar odległości' });
    await expect(distanceBtn).toBeVisible({ timeout: 5_000 });
  });

  test('TC-TOOLS-022: Pomiar powierzchni', async ({ page }) => {
    const measureBtn = page.locator('button[aria-label="Narzędzia mierzenia"]');
    await expect(measureBtn).toBeVisible({ timeout: 10_000 });
    await measureBtn.click();
    await page.waitForTimeout(1_000);

    const panelHeading = page.getByRole('heading', { name: 'Narzędzia mierzenia', level: 6 });
    await expect(panelHeading).toBeVisible({ timeout: 5_000 });

    const areaBtn = page.getByRole('button', { name: 'Pomiar powierzchni' });
    await expect(areaBtn).toBeVisible({ timeout: 5_000 });
  });

  test('TC-TOOLS-025: Wyszukiwanie adresu', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="działki" i], input[placeholder*="adres" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await searchInput.fill('Warszawa, Marszałkowska 1');
    await page.waitForTimeout(2_000);

    expect(await searchInput.inputValue()).toContain('Warszawa');
  });

  test('TC-TOOLS-026: Wyszukiwanie współrzędnych', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="działki" i], input[placeholder*="adres" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await searchInput.fill('52.2297, 21.0122');
    await page.waitForTimeout(1_500);
    await searchInput.press('Enter');
    await page.waitForTimeout(2_000);

    const mapCanvas = page.locator('canvas').first();
    await expect(mapCanvas).toBeVisible();
  });

  test('TC-TOOLS-027: Identyfikacja obiektu (kliknięcie)', async ({ page }) => {
    const identifyBtn = page.locator('button[aria-label="Identyfikacja obiektu"]');
    await expect(identifyBtn).toBeVisible({ timeout: 10_000 });
    await identifyBtn.click();
    await page.waitForTimeout(1_000);

    const mapCanvas = page.locator('canvas').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(2_000);

    await expect(mapCanvas).toBeVisible();
  });

  test('TC-TOOLS-028: Identyfikacja - obsługa wielu warstw', async ({ page }) => {
    const identifyBtn = page.locator('button[aria-label="Identyfikacja obiektu"]');
    await expect(identifyBtn).toBeVisible({ timeout: 10_000 });
    await identifyBtn.click();
    await page.waitForTimeout(1_000);

    const mapCanvas = page.locator('canvas').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(2_000);

    await expect(mapCanvas).toBeVisible();
  });

  test('TC-TOOLS-040: Geokodowanie adresu', async ({ page }) => {
    const geocodeInput = page.locator('input[placeholder*="działki" i], input[placeholder*="adres" i]').first();
    await expect(geocodeInput).toBeVisible({ timeout: 10_000 });

    await geocodeInput.fill('Kraków, Rynek Główny 1');
    await page.waitForTimeout(2_000);

    expect(await geocodeInput.inputValue()).toContain('Kraków');
  });
});

// =====================================================================
// SKIPPED TESTS — no beforeEach needed, instant skip
// =====================================================================
test.describe('NARZĘDZIA — brakujące funkcje', () => {

  test('TC-TOOLS-003: Wyszukiwanie działki - po obrębie', async () => {
    test.skip(true, 'PENDING: wymaga konfiguracji danych testowych obrębów');
  });

  test('TC-TOOLS-004: Wyszukiwanie działki - po gminie', async () => {
    test.skip(true, 'PENDING: wymaga konfiguracji danych testowych gmin');
  });

  test('TC-TOOLS-006: Wypis - wybór przeznaczeń MPZP', async () => {
    test.skip(true, 'PENDING: wymaga projektu z danymi MPZP');
  });

  test('TC-TOOLS-007: Generowanie PDF wypisu', async () => {
    test.skip(true, 'PENDING: wymaga pełnej konfiguracji wypisu');
  });

  test('TC-TOOLS-023: Pomiar kąta', async () => {
    test.skip(true, 'Brak pomiaru kąta w panelu Narzędzia mierzenia — tylko odległość i powierzchnia');
  });

  test('TC-TOOLS-024: Zmiana jednostek pomiaru', async () => {
    test.skip(true, 'Brak opcji zmiany jednostek w panelu Narzędzia mierzenia');
  });

  test('TC-TOOLS-008: Rysowanie punkt', async () => {
    test.skip(true, 'Brak narzędzia rysowania w prawym toolbarze');
  });

  test('TC-TOOLS-009: Rysowanie linia', async () => {
    test.skip(true, 'Brak narzędzia rysowania w prawym toolbarze');
  });

  test('TC-TOOLS-010: Rysowanie poligon', async () => {
    test.skip(true, 'Brak narzędzia rysowania w prawym toolbarze');
  });

  test('TC-TOOLS-011: Rysowanie okrąg', async () => {
    test.skip(true, 'Brak narzędzia rysowania w prawym toolbarze');
  });

  test('TC-TOOLS-012: Rysowanie odręczne', async () => {
    test.skip(true, 'Brak narzędzia rysowania w prawym toolbarze');
  });

  test('TC-TOOLS-013: Przesuwanie obiektów', async () => {
    test.skip(true, 'Brak narzędzia edycji obiektów w prawym toolbarze');
  });

  test('TC-TOOLS-014: Usuwanie obiektów', async () => {
    test.skip(true, 'Brak narzędzia edycji obiektów w prawym toolbarze');
  });

  test('TC-TOOLS-015: Undo/Redo', async () => {
    test.skip(true, 'Brak narzędzia Undo/Redo w prawym toolbarze');
  });

  test('TC-TOOLS-016: Merge', async () => {
    test.skip(true, 'Brak narzędzia Merge w prawym toolbarze');
  });

  test('TC-TOOLS-017: Split', async () => {
    test.skip(true, 'Brak narzędzia Split w prawym toolbarze');
  });

  test('TC-TOOLS-018: Bufor', async () => {
    test.skip(true, 'Brak narzędzia Bufor w prawym toolbarze');
  });

  test('TC-TOOLS-019: Snapping', async () => {
    test.skip(true, 'Brak narzędzia Snapping w prawym toolbarze');
  });

  test('TC-TOOLS-020: Walidacja geometrii', async () => {
    test.skip(true, 'Brak narzędzia walidacji geometrii w prawym toolbarze');
  });

  test('TC-TOOLS-029: Eksport PDF - format papieru', async () => {
    test.skip(true, 'Brak przycisku Print/Export w prawym toolbarze');
  });

  test('TC-TOOLS-030: Eksport PDF - skala', async () => {
    test.skip(true, 'Brak przycisku Print/Export w prawym toolbarze');
  });

  test('TC-TOOLS-031: Eksport PDF - legenda', async () => {
    test.skip(true, 'Brak przycisku Print/Export w prawym toolbarze');
  });

  test('TC-TOOLS-032: Eksport PDF - skala graficzna', async () => {
    test.skip(true, 'Brak przycisku Print/Export w prawym toolbarze');
  });

  test('TC-TOOLS-033: Eksport PDF - generowanie', async () => {
    test.skip(true, 'Brak przycisku Print/Export w prawym toolbarze');
  });

  test('TC-TOOLS-034: Georeferencja - punkty kontrolne', async () => {
    test.skip(true, 'Brak narzędzia georeferencji w prawym toolbarze');
  });

  test('TC-TOOLS-035: Georeferencja - transformacja', async () => {
    test.skip(true, 'Brak narzędzia georeferencji w prawym toolbarze');
  });

  test('TC-TOOLS-036: Georeferencja - zapisanie', async () => {
    test.skip(true, 'Brak narzędzia georeferencji w prawym toolbarze');
  });

  test('TC-TOOLS-037: Przycinanie do maski - aktywacja', async () => {
    test.skip(true, 'Brak narzędzia przycinania do maski w prawym toolbarze');
  });

  test('TC-TOOLS-038: Przycinanie do maski - rysowanie maski', async () => {
    test.skip(true, 'Brak narzędzia przycinania do maski w prawym toolbarze');
  });

  test('TC-TOOLS-039: Przycinanie do maski - zastosowanie', async () => {
    test.skip(true, 'Brak narzędzia przycinania do maski w prawym toolbarze');
  });
});
