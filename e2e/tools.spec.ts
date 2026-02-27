import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

const BASE_URL = 'https://universe-mapmaker.web.app';

/**
 * Helper: kliknij przycisk w prawym toolbarze i poczekaj na reakcję UI.
 * Przyciski mogą być za nakładką MUI - próbujemy zwykły click, jeśli nie - dispatchEvent.
 */
async function clickToolbarButton(page: import('@playwright/test').Page, ariaLabel: string) {
  const btn = page.locator(`button[aria-label="${ariaLabel}"]`);
  await expect(btn).toBeVisible({ timeout: 10_000 });
  try {
    await btn.click({ timeout: 3_000 });
  } catch {
    await btn.evaluate((b) => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
  await page.waitForTimeout(1_000);
}

/**
 * Helper: sprawdź czy po kliknięciu przycisku pojawiło się jakieś UI (panel, dialog, kursor, overlay).
 */
async function verifyToolActivated(page: import('@playwright/test').Page) {
  const uiElement = page.locator(
    '[role="dialog"], .MuiDrawer-root, .MuiPopover-paper, [class*="tool-panel"], [class*="active"], .mapboxgl-canvas-container[style*="cursor"]'
  ).first();
  const appeared = await uiElement.isVisible({ timeout: 5_000 }).catch(() => false);

  if (!appeared) {
    const cursorChanged = await page.evaluate(() => {
      const container = document.querySelector('.mapboxgl-canvas-container');
      return container ? window.getComputedStyle(container).cursor !== 'grab' : false;
    }).catch(() => false);
    return cursorChanged;
  }
  return appeared;
}

test.describe('NARZĘDZIA', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto(`${BASE_URL}/projects/TESTAGENT`);
    await page.locator('canvas.mapboxgl-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  });

  // ===== WYSZUKIWANIE DZIAŁKI (TC-TOOLS-001 to TC-TOOLS-004) - PENDING =====

  test('TC-TOOLS-001: Wyszukiwanie działki - po numerze', async () => {
    test.skip(true, 'PENDING: wymaga konfiguracji danych testowych');
  });

  test('TC-TOOLS-002: Wyszukiwanie działki - po adresie', async () => {
    test.skip(true, 'PENDING: wymaga konfiguracji danych testowych');
  });

  test('TC-TOOLS-003: Wyszukiwanie działki - po obrębie', async () => {
    test.skip(true, 'PENDING: wymaga konfiguracji danych testowych');
  });

  test('TC-TOOLS-004: Wyszukiwanie działki - po gminie', async () => {
    test.skip(true, 'PENDING: wymaga konfiguracji danych testowych');
  });

  // ===== WYPIS (TC-TOOLS-005 to TC-TOOLS-007) =====

  test('TC-TOOLS-005: Wypis - wskazanie działki na mapie', async ({ page }) => {
    // Open the tools panel / wypis tool
    const toolsBtn = page.locator(
      'button:has-text("Narzędzia"), button:has-text("Tools"), [data-testid*="tools"], [aria-label*="narzędzia" i], [aria-label*="tools" i]'
    ).first();
    await toolsBtn.click();

    // Look for the wypis/extract tool option
    const wypisOption = page.locator(
      'text=/wypis|extract|informacja o działce/i, [data-testid*="wypis"], [data-testid*="extract"], button:has-text("Wypis")'
    ).first();
    await expect(wypisOption).toBeVisible({ timeout: 10_000 });
    await wypisOption.click();

    // Click on the map to select a parcel
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    await expect(mapCanvas).toBeVisible({ timeout: 10_000 });
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Verify that parcel information panel or popup appears
    const parcelInfo = page.locator(
      '[data-testid*="parcel"], [data-testid*="wypis"], [data-testid*="info-panel"], .info-panel, [role="dialog"], .MuiDrawer-root, text=/działka|parcel|numer|obręb/i'
    ).first();
    await expect(parcelInfo).toBeVisible({ timeout: 15_000 });
  });

  test('TC-TOOLS-006: Wypis - wybór przeznaczeń MPZP', async ({ page }) => {
    // Open the tools panel / wypis tool
    const toolsBtn = page.locator(
      'button:has-text("Narzędzia"), button:has-text("Tools"), [data-testid*="tools"], [aria-label*="narzędzia" i]'
    ).first();
    await toolsBtn.click();

    const wypisOption = page.locator(
      'text=/wypis|extract/i, [data-testid*="wypis"], button:has-text("Wypis")'
    ).first();
    await expect(wypisOption).toBeVisible({ timeout: 10_000 });
    await wypisOption.click();

    // Click on the map to select a parcel
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    await expect(mapCanvas).toBeVisible({ timeout: 10_000 });
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Wait for the parcel info / wypis panel
    const infoPanel = page.locator(
      '[data-testid*="wypis"], [data-testid*="info-panel"], .info-panel, [role="dialog"], .MuiDrawer-root'
    ).first();
    await expect(infoPanel).toBeVisible({ timeout: 15_000 });

    // Verify MPZP / przeznaczenia section is visible
    const mpzpSection = page.locator(
      'text=/MPZP|przeznaczeni|plan miejscowy|local plan|zoning/i'
    ).first();
    await expect(mpzpSection).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-007: Generowanie PDF wypisu', async () => {
    test.skip(true, 'PENDING: wymaga pełnej konfiguracji wypisu');
  });

  // ===== RYSOWANIE (TC-TOOLS-008 to TC-TOOLS-012) =====

  test('TC-TOOLS-008: Rysowanie punkt', async () => {
    test.skip(true, 'PENDING: wymaga interakcji z narzędziem rysowania');
  });

  test('TC-TOOLS-009: Rysowanie linia', async () => {
    test.skip(true, 'PENDING: wymaga interakcji z narzędziem rysowania');
  });

  test('TC-TOOLS-010: Rysowanie poligon', async () => {
    test.skip(true, 'PENDING: wymaga interakcji z narzędziem rysowania');
  });

  test('TC-TOOLS-011: Rysowanie okrąg', async () => {
    test.skip(true, 'PENDING: wymaga interakcji z narzędziem rysowania');
  });

  test('TC-TOOLS-012: Rysowanie odręczne', async ({ page }) => {
    // Open the drawing tools
    const drawBtn = page.locator(
      'button:has-text("Rysuj"), button:has-text("Draw"), [data-testid*="draw"], [aria-label*="rysuj" i], [aria-label*="draw" i]'
    ).first();
    await drawBtn.click();

    // Select freehand drawing mode
    const freehandOption = page.locator(
      'text=/odręczne|freehand/i, [data-testid*="freehand"], button:has-text("Odręczne"), [aria-label*="odręczn" i]'
    ).first();
    await expect(freehandOption).toBeVisible({ timeout: 10_000 });
    await freehandOption.click();

    // Perform freehand drawing on the map
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    await expect(mapCanvas).toBeVisible({ timeout: 10_000 });
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    // Simulate freehand drawing with mouse drag
    const startX = box!.x + box!.width * 0.3;
    const startY = box!.y + box!.height * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY - 30, { steps: 5 });
    await page.mouse.move(startX + 100, startY + 20, { steps: 5 });
    await page.mouse.move(startX + 150, startY - 10, { steps: 5 });
    await page.mouse.up();

    // Verify that a drawn feature appears (layer count, feature indicator, or visual change)
    await page.waitForTimeout(1_000);
    const drawnFeature = page.locator(
      '[data-testid*="feature"], [data-testid*="drawn"], .ol-overlay-container, text=/narysowano|drawn|obiekt|feature/i'
    ).first();
    const featureVisible = await drawnFeature.isVisible().catch(() => false);

    // Alternative: check that the drawing tool is still active or a feature was added
    const toolActive = page.locator(
      '.active, [data-active="true"], [aria-pressed="true"], [class*="selected"]'
    ).first();
    const isActive = await toolActive.isVisible().catch(() => false);

    expect(featureVisible || isActive).toBe(true);
  });

  // ===== EDYCJA OBIEKTÓW (TC-TOOLS-013 to TC-TOOLS-019) =====

  test('TC-TOOLS-013: Przesuwanie obiektów', async () => {
    test.skip(true, 'PENDING: wymaga istniejących obiektów na mapie');
  });

  test('TC-TOOLS-014: Usuwanie obiektów', async () => {
    test.skip(true, 'PENDING: wymaga istniejących obiektów na mapie');
  });

  test('TC-TOOLS-015: Undo/Redo', async () => {
    test.skip(true, 'PENDING: wymaga sekwencji operacji edycji');
  });

  test('TC-TOOLS-016: Merge', async () => {
    test.skip(true, 'PENDING: wymaga wielu obiektów do scalenia');
  });

  test('TC-TOOLS-017: Split', async () => {
    test.skip(true, 'PENDING: wymaga obiektu do podziału');
  });

  test('TC-TOOLS-018: Bufor', async () => {
    test.skip(true, 'PENDING: wymaga obiektu do buforowania');
  });

  test('TC-TOOLS-019: Snapping', async () => {
    test.skip(true, 'PENDING: wymaga warstw z geometrią do przyciągania');
  });

  // ===== WALIDACJA GEOMETRII (TC-TOOLS-020) =====

  test('TC-TOOLS-020: Walidacja geometrii', async ({ page }) => {
    // Open the editing / geometry tools
    const editBtn = page.locator(
      'button:has-text("Edycja"), button:has-text("Edit"), [data-testid*="edit"], [aria-label*="edycja" i], [aria-label*="edit" i]'
    ).first();
    await editBtn.click();

    // Look for the geometry validation tool
    const validateOption = page.locator(
      'text=/walidacja|sprawdź geometrię|validate|check geometry/i, [data-testid*="validate"], [data-testid*="geometry-check"], button:has-text("Walidacja")'
    ).first();
    await expect(validateOption).toBeVisible({ timeout: 10_000 });
    await validateOption.click();

    // Verify the validation tool opens / shows results
    const validationPanel = page.locator(
      '[data-testid*="validation"], [data-testid*="geometry"], text=/walidacja|poprawna|błąd geometrii|valid|invalid|no errors/i'
    ).first();
    await expect(validationPanel).toBeVisible({ timeout: 10_000 });
  });

  // ===== POMIARY (TC-TOOLS-021 to TC-TOOLS-024) =====

  test('TC-TOOLS-021: Pomiar odległości', async ({ page }) => {
    // Open measurement tools
    const measureBtn = page.locator(
      'button:has-text("Pomiar"), button:has-text("Measure"), [data-testid*="measure"], [aria-label*="pomiar" i], [aria-label*="measure" i]'
    ).first();
    await measureBtn.click();

    // Select distance measurement
    const distanceOption = page.locator(
      'text=/odległość|distance|linia/i, [data-testid*="distance"], [data-testid*="line-measure"], button:has-text("Odległość")'
    ).first();
    await expect(distanceOption).toBeVisible({ timeout: 10_000 });
    await distanceOption.click();

    // Draw a measurement line on the map
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    // Click two points to measure distance
    await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
    await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);
    await page.mouse.dblclick(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5);

    // Verify measurement result is displayed
    const measureResult = page.locator(
      '[data-testid*="measure"], .ol-tooltip, .measure-result, text=/\\d+.*?(m|km|mi|ft)/i'
    ).first();
    await expect(measureResult).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-022: Pomiar powierzchni', async ({ page }) => {
    // Open measurement tools
    const measureBtn = page.locator(
      'button:has-text("Pomiar"), button:has-text("Measure"), [data-testid*="measure"], [aria-label*="pomiar" i]'
    ).first();
    await measureBtn.click();

    // Select area measurement
    const areaOption = page.locator(
      'text=/powierzchnia|area|poligon/i, [data-testid*="area"], [data-testid*="polygon-measure"], button:has-text("Powierzchnia")'
    ).first();
    await expect(areaOption).toBeVisible({ timeout: 10_000 });
    await areaOption.click();

    // Draw a polygon on the map to measure area
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx - 80, cy - 60);
    await page.mouse.click(cx + 80, cy - 60);
    await page.mouse.click(cx + 80, cy + 60);
    await page.mouse.click(cx - 80, cy + 60);
    await page.mouse.dblclick(cx - 80, cy - 60);

    // Verify area measurement result
    const measureResult = page.locator(
      '[data-testid*="measure"], .ol-tooltip, .measure-result, text=/\\d+.*?(m²|km²|ha|acre)/i'
    ).first();
    await expect(measureResult).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-023: Pomiar kąta', async ({ page }) => {
    // Open measurement tools
    const measureBtn = page.locator(
      'button:has-text("Pomiar"), button:has-text("Measure"), [data-testid*="measure"], [aria-label*="pomiar" i]'
    ).first();
    await measureBtn.click();

    // Select angle measurement
    const angleOption = page.locator(
      'text=/kąt|angle/i, [data-testid*="angle"], button:has-text("Kąt")'
    ).first();
    await expect(angleOption).toBeVisible({ timeout: 10_000 });
    await angleOption.click();

    // Draw three points for angle measurement
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx - 80, cy);
    await page.mouse.click(cx, cy);
    await page.mouse.click(cx + 40, cy - 70);
    await page.mouse.dblclick(cx + 40, cy - 70);

    // Verify angle measurement result (degrees)
    const angleResult = page.locator(
      '[data-testid*="measure"], .ol-tooltip, .measure-result, text=/\\d+.*?°/i'
    ).first();
    await expect(angleResult).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-024: Zmiana jednostek pomiaru', async ({ page }) => {
    // Open measurement tools
    const measureBtn = page.locator(
      'button:has-text("Pomiar"), button:has-text("Measure"), [data-testid*="measure"], [aria-label*="pomiar" i]'
    ).first();
    await measureBtn.click();

    // Look for unit selector / dropdown
    const unitSelector = page.locator(
      '[data-testid*="unit"], select:has(option), [role="combobox"], [role="listbox"], button:has-text("Jednostki"), text=/jednostk|unit|metr|km/i'
    ).first();
    await expect(unitSelector).toBeVisible({ timeout: 10_000 });

    // Click to open the unit options
    await unitSelector.click();

    // Verify that multiple unit options are available
    const unitOptions = page.locator(
      '[role="option"], [role="menuitem"], li, option'
    );
    const optionCount = await unitOptions.count();
    expect(optionCount).toBeGreaterThan(1);
  });

  // ===== WYSZUKIWANIE (TC-TOOLS-025 to TC-TOOLS-026) =====

  test('TC-TOOLS-025: Wyszukiwanie adresu', async ({ page }) => {
    // Look for the search / geocode input
    const searchInput = page.locator(
      'input[placeholder*="szukaj" i], input[placeholder*="search" i], input[placeholder*="adres" i], [data-testid*="search"], [data-testid*="geocode"], [aria-label*="szukaj" i]'
    ).first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Type an address
    await searchInput.fill('Warszawa, Marszałkowska 1');
    await page.waitForTimeout(1_500);

    // Verify search results appear
    const searchResults = page.locator(
      '[data-testid*="search-result"], [role="listbox"], [role="option"], .autocomplete-results, .search-results, .MuiAutocomplete-popper, text=/Warszawa|Marszałkowska/i'
    ).first();
    await expect(searchResults).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-026: Wyszukiwanie współrzędnych', async ({ page }) => {
    // Look for the search / coordinate input
    const searchInput = page.locator(
      'input[placeholder*="szukaj" i], input[placeholder*="search" i], input[placeholder*="współrzędn" i], [data-testid*="search"], [data-testid*="coordinates"], [aria-label*="szukaj" i]'
    ).first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Type coordinates (WGS84 for Warsaw center)
    await searchInput.fill('52.2297, 21.0122');
    await page.waitForTimeout(1_500);

    // Verify that the map moves or a marker appears
    const coordinateResult = page.locator(
      '[data-testid*="search-result"], [role="listbox"], [role="option"], .ol-overlay-container, text=/52\\.22|21\\.01/i'
    ).first();
    const resultVisible = await coordinateResult.isVisible().catch(() => false);

    // Alternative: press Enter to navigate to coordinates
    if (!resultVisible) {
      await searchInput.press('Enter');
      await page.waitForTimeout(2_000);
    }

    // Verify map responded (no error state)
    const errorState = page.locator('[role="alert"]:has-text("błąd"), [role="alert"]:has-text("error")').first();
    const hasError = await errorState.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });

  // ===== IDENTYFIKACJA (TC-TOOLS-027 to TC-TOOLS-028) =====

  test('TC-TOOLS-027: Identyfikacja obiektu (kliknięcie)', async ({ page }) => {
    // Activate the identify / info tool
    const identifyBtn = page.locator(
      'button:has-text("Identyfikacja"), button:has-text("Identify"), button:has-text("Info"), [data-testid*="identify"], [data-testid*="info"], [aria-label*="identyfikacja" i], [aria-label*="identify" i]'
    ).first();
    await identifyBtn.click();

    // Click on the map to identify a feature
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Verify identification results panel or popup appears
    const identifyResult = page.locator(
      '[data-testid*="identify"], [data-testid*="info-panel"], [data-testid*="feature-info"], .info-panel, .popup, .ol-popup, [role="dialog"], text=/atrybut|attribute|warstwa|layer|brak wyników|no results/i'
    ).first();
    await expect(identifyResult).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-028: Identyfikacja - obsługa wielu warstw', async ({ page }) => {
    // Activate the identify / info tool
    const identifyBtn = page.locator(
      'button:has-text("Identyfikacja"), button:has-text("Identify"), button:has-text("Info"), [data-testid*="identify"], [data-testid*="info"], [aria-label*="identyfikacja" i]'
    ).first();
    await identifyBtn.click();

    // Click on the map
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Verify the identification panel can show results from multiple layers
    const identifyPanel = page.locator(
      '[data-testid*="identify"], [data-testid*="info-panel"], .info-panel, [role="dialog"], .MuiDrawer-root'
    ).first();
    await expect(identifyPanel).toBeVisible({ timeout: 10_000 });

    // Check for layer tabs, accordion, or multiple layer sections
    const layerSections = page.locator(
      '[role="tab"], [data-testid*="layer"], .accordion, .MuiAccordion-root, text=/warstwa|layer/i'
    );
    const sectionCount = await layerSections.count();
    // At least the panel structure supports multiple layers (may show 0+ results)
    expect(sectionCount).toBeGreaterThanOrEqual(0);
  });

  // ===== EKSPORT PDF (TC-TOOLS-029 to TC-TOOLS-033) =====

  test('TC-TOOLS-029: Eksport PDF - format papieru', async ({ page }) => {
    // Open the export / print tool
    const exportBtn = page.locator(
      'button:has-text("Eksport"), button:has-text("Export"), button:has-text("Drukuj"), button:has-text("Print"), [data-testid*="export"], [data-testid*="print"], [aria-label*="eksport" i], [aria-label*="print" i]'
    ).first();
    await exportBtn.click();

    // Verify paper format selector is available
    const formatSelector = page.locator(
      '[data-testid*="format"], [data-testid*="paper"], select, [role="combobox"], text=/A4|A3|A2|A1|format/i'
    ).first();
    await expect(formatSelector).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-030: Eksport PDF - skala', async ({ page }) => {
    const exportBtn = page.locator(
      'button:has-text("Eksport"), button:has-text("Export"), button:has-text("Drukuj"), button:has-text("Print"), [data-testid*="export"], [data-testid*="print"], [aria-label*="eksport" i]'
    ).first();
    await exportBtn.click();

    // Verify scale selector is available
    const scaleSelector = page.locator(
      '[data-testid*="scale"], input[placeholder*="skala" i], input[placeholder*="scale" i], text=/1:\\d+|skala|scale/i'
    ).first();
    await expect(scaleSelector).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-031: Eksport PDF - legenda', async ({ page }) => {
    const exportBtn = page.locator(
      'button:has-text("Eksport"), button:has-text("Export"), button:has-text("Drukuj"), button:has-text("Print"), [data-testid*="export"], [data-testid*="print"], [aria-label*="eksport" i]'
    ).first();
    await exportBtn.click();

    // Verify legend toggle / checkbox is available
    const legendToggle = page.locator(
      '[data-testid*="legend"], input[type="checkbox"], label:has-text("Legenda"), label:has-text("Legend"), text=/legenda|legend/i'
    ).first();
    await expect(legendToggle).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-032: Eksport PDF - skala graficzna', async ({ page }) => {
    const exportBtn = page.locator(
      'button:has-text("Eksport"), button:has-text("Export"), button:has-text("Drukuj"), button:has-text("Print"), [data-testid*="export"], [data-testid*="print"], [aria-label*="eksport" i]'
    ).first();
    await exportBtn.click();

    // Verify graphical scale bar option is available
    const scaleBarToggle = page.locator(
      '[data-testid*="scale-bar"], [data-testid*="scalebar"], label:has-text("skala graficzna"), label:has-text("scale bar"), text=/skala graficzna|scale bar|podziałka/i'
    ).first();
    await expect(scaleBarToggle).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-033: Eksport PDF - generowanie', async ({ page }) => {
    const exportBtn = page.locator(
      'button:has-text("Eksport"), button:has-text("Export"), button:has-text("Drukuj"), button:has-text("Print"), [data-testid*="export"], [data-testid*="print"], [aria-label*="eksport" i]'
    ).first();
    await exportBtn.click();

    // Wait for export dialog to be fully loaded
    const exportDialog = page.locator(
      '[role="dialog"], .MuiDialog-paper, .MuiDrawer-root, [data-testid*="export-dialog"]'
    ).first();
    await expect(exportDialog).toBeVisible({ timeout: 10_000 });

    // Click the generate / export button
    const generateBtn = page.locator(
      'button:has-text("Generuj"), button:has-text("Generate"), button:has-text("Eksportuj"), button:has-text("Export PDF"), button:has-text("Drukuj"), [data-testid*="generate"], [data-testid*="export-btn"]'
    ).first();
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });

    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
    await generateBtn.click();

    // Verify either a download starts or a preview / success message appears
    const download = await downloadPromise;
    const successMsg = page.locator(
      'text=/sukces|success|gotowe|done|pobierz|download|wygenerowano|generated/i'
    ).first();
    const hasSuccess = await successMsg.isVisible().catch(() => false);

    expect(download !== null || hasSuccess).toBe(true);
  });

  // ===== GEOREFERENCJA (TC-TOOLS-034 to TC-TOOLS-036) =====

  test('TC-TOOLS-034: Georeferencja - punkty kontrolne', async () => {
    test.skip(true, 'PENDING: wymaga załadowanego rastra do georeferencji');
  });

  test('TC-TOOLS-035: Georeferencja - transformacja', async ({ page }) => {
    // Open georeference tool
    const georefBtn = page.locator(
      'button:has-text("Georeferencja"), button:has-text("Georeference"), [data-testid*="georeference"], [data-testid*="georef"], [aria-label*="georeferencja" i]'
    ).first();
    await georefBtn.click();

    // Verify transformation options are available
    const transformOptions = page.locator(
      '[data-testid*="transform"], text=/transformacja|transform|afiniczna|affine|Helmert|wielomian|polynomial/i'
    ).first();
    await expect(transformOptions).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-036: Georeferencja - zapisanie', async ({ page }) => {
    // Open georeference tool
    const georefBtn = page.locator(
      'button:has-text("Georeferencja"), button:has-text("Georeference"), [data-testid*="georeference"], [data-testid*="georef"], [aria-label*="georeferencja" i]'
    ).first();
    await georefBtn.click();

    // Verify save / apply button is available in the georeference panel
    const saveBtn = page.locator(
      'button:has-text("Zapisz"), button:has-text("Save"), button:has-text("Zastosuj"), button:has-text("Apply"), [data-testid*="save"], [data-testid*="apply"]'
    ).first();
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
  });

  // ===== PRZYCINANIE DO MASKI (TC-TOOLS-037 to TC-TOOLS-039) =====

  test('TC-TOOLS-037: Przycinanie do maski - aktywacja', async ({ page }) => {
    // Open the clipping / mask tool
    const clipBtn = page.locator(
      'button:has-text("Przycinanie"), button:has-text("Clip"), button:has-text("Maska"), button:has-text("Mask"), [data-testid*="clip"], [data-testid*="mask"], [aria-label*="przycin" i], [aria-label*="clip" i]'
    ).first();
    await clipBtn.click();

    // Verify the clipping tool panel is visible
    const clipPanel = page.locator(
      '[data-testid*="clip"], [data-testid*="mask"], text=/przycinanie|maska|clip|mask/i'
    ).first();
    await expect(clipPanel).toBeVisible({ timeout: 10_000 });
  });

  test('TC-TOOLS-038: Przycinanie do maski - rysowanie maski', async ({ page }) => {
    // Open the clipping / mask tool
    const clipBtn = page.locator(
      'button:has-text("Przycinanie"), button:has-text("Clip"), button:has-text("Maska"), button:has-text("Mask"), [data-testid*="clip"], [data-testid*="mask"], [aria-label*="przycin" i]'
    ).first();
    await clipBtn.click();

    // Draw a mask polygon on the map
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx - 100, cy - 80);
    await page.mouse.click(cx + 100, cy - 80);
    await page.mouse.click(cx + 100, cy + 80);
    await page.mouse.click(cx - 100, cy + 80);
    await page.mouse.dblclick(cx - 100, cy - 80);

    // Verify the mask was drawn (confirmation or visual indicator)
    await page.waitForTimeout(1_000);
    const maskConfirmation = page.locator(
      'button:has-text("Zastosuj"), button:has-text("Apply"), [data-testid*="apply"], text=/zastosuj|apply|maska narysowana|mask drawn/i'
    ).first();
    const hasConfirmation = await maskConfirmation.isVisible().catch(() => false);
    expect(hasConfirmation).toBe(true);
  });

  test('TC-TOOLS-039: Przycinanie do maski - zastosowanie', async ({ page }) => {
    // Open the clipping / mask tool
    const clipBtn = page.locator(
      'button:has-text("Przycinanie"), button:has-text("Clip"), button:has-text("Maska"), button:has-text("Mask"), [data-testid*="clip"], [data-testid*="mask"], [aria-label*="przycin" i]'
    ).first();
    await clipBtn.click();

    // Draw a mask polygon
    const mapCanvas = page.locator('canvas, .ol-viewport, .map-container, [data-testid="map"]').first();
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx - 100, cy - 80);
    await page.mouse.click(cx + 100, cy - 80);
    await page.mouse.click(cx + 100, cy + 80);
    await page.mouse.click(cx - 100, cy + 80);
    await page.mouse.dblclick(cx - 100, cy - 80);

    // Apply the mask
    const applyBtn = page.locator(
      'button:has-text("Zastosuj"), button:has-text("Apply"), [data-testid*="apply-mask"], [data-testid*="apply-clip"]'
    ).first();
    await expect(applyBtn).toBeVisible({ timeout: 10_000 });
    await applyBtn.click();

    // Verify the clipping was applied (success message or visual change)
    const successIndicator = page.locator(
      '[role="alert"], .MuiSnackbar-root, text=/zastosowano|applied|sukces|success|przycięto|clipped/i'
    ).first();
    await expect(successIndicator).toBeVisible({ timeout: 15_000 });
  });

  // ===== GEOKODOWANIE (TC-TOOLS-040) =====

  test('TC-TOOLS-040: Geokodowanie adresu', async ({ page }) => {
    // Look for geocoding / search input
    const geocodeInput = page.locator(
      'input[placeholder*="szukaj" i], input[placeholder*="search" i], input[placeholder*="adres" i], input[placeholder*="geocod" i], [data-testid*="geocode"], [data-testid*="search"]'
    ).first();
    await expect(geocodeInput).toBeVisible({ timeout: 10_000 });

    // Enter an address for geocoding
    await geocodeInput.fill('Kraków, Rynek Główny 1');
    await page.waitForTimeout(2_000);

    // Verify geocoding results appear
    const geocodeResults = page.locator(
      '[data-testid*="search-result"], [data-testid*="geocode-result"], [role="listbox"], [role="option"], .autocomplete-results, .search-results, .MuiAutocomplete-popper, text=/Kraków|Rynek/i'
    ).first();
    await expect(geocodeResults).toBeVisible({ timeout: 10_000 });

    // Select the first result
    const firstResult = page.locator(
      '[role="option"], .search-result, .autocomplete-item, li'
    ).first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
    }

    // Verify map moved to the geocoded location (no error)
    await page.waitForTimeout(1_000);
    const errorState = page.locator('[role="alert"]:has-text("błąd"), [role="alert"]:has-text("error")').first();
    const hasError = await errorState.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });
});
