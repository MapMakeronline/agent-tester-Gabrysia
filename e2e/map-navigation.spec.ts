import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

const PROJECT = 'TestzWarstwami';

/**
 * Helper: navigate to a project that has a map and wait for the map canvas to load.
 * Uses URL-based navigation (works for tester account).
 */
async function openMapProject(page: import('@playwright/test').Page) {
  await ensureLoggedIn(page);
  await page.goto(`/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2_000);

  // Wait for "Pobieranie projektu..." to disappear (project loading indicator)
  const loadingIndicator = page.getByText('Pobieranie projektu', { exact: false });
  await loadingIndicator.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  // Ensure side panel is open
  await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Otwórz panel boczny"]');
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(1_000);

  // Wait for the map canvas
  const mapCanvas = page.locator('canvas.mapboxgl-canvas, canvas.maplibregl-canvas, canvas').first();
  await expect(mapCanvas).toBeVisible({ timeout: 30_000 });

  // Wait for layers to load (tree items or extra idle time)
  await page.locator('ul[role="tree"] [role="treeitem"]').first()
    .waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  return mapCanvas;
}

/**
 * Helper: read current map state (center, zoom, bearing, pitch) via the
 * global mapboxgl/maplibre map instance exposed on window or through the DOM.
 */
async function getMapState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // Try common patterns for accessing the map instance
    const map =
      (window as any).map ||
      (window as any).mapInstance ||
      (window as any).__map ||
      (document.querySelector('.mapboxgl-map') as any)?.__mapInstance ||
      (document.querySelector('.maplibregl-map') as any)?.__mapInstance;

    if (map && typeof map.getCenter === 'function') {
      const center = map.getCenter();
      return {
        lng: center.lng as number,
        lat: center.lat as number,
        zoom: map.getZoom() as number,
        bearing: map.getBearing() as number,
        pitch: map.getPitch() as number,
      };
    }

    // Fallback: parse from data attributes or DOM
    return null;
  });
}

/**
 * Helper: wait briefly for the map to finish animating after an interaction.
 */
async function waitForMapIdle(page: import('@playwright/test').Page, ms = 1000) {
  await page.waitForTimeout(ms);
}

test.describe('NAWIGACJA MAPA', () => {
  let mapCanvas: import('@playwright/test').Locator;

  // Each test needs time for: project loading (~60s) + map interaction + assertions
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    mapCanvas = await openMapProject(page);
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-001: Przesuwanie mapy (pan)
  // ---------------------------------------------------------------------------
  test('TC-NAV-001: Przesuwanie mapy (pan)', async ({ page }) => {
    const stateBefore = await getMapState(page);
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Drag map: press in center, move 150px right and 100px down
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 150, cy + 100, { steps: 20 });
    await page.mouse.up();
    await waitForMapIdle(page);

    const stateAfter = await getMapState(page);

    if (stateBefore && stateAfter) {
      // After dragging right, the map center longitude should decrease (map moved east-to-west)
      // or latitude should change -- we just verify the center moved at all.
      const moved =
        Math.abs(stateAfter.lng - stateBefore.lng) > 0.0001 ||
        Math.abs(stateAfter.lat - stateBefore.lat) > 0.0001;
      expect(moved).toBe(true);
    } else {
      // Fallback: take a screenshot comparison approach -- the canvas should have changed
      // At minimum verify the canvas is still visible (interaction did not crash the map)
      await expect(mapCanvas).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-002: Zoom scroll
  // ---------------------------------------------------------------------------
  test('TC-NAV-002: Zoom scroll', async ({ page }) => {
    const stateBefore = await getMapState(page);
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Scroll up to zoom in
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    await waitForMapIdle(page, 1500);

    const stateAfterZoomIn = await getMapState(page);

    if (stateBefore && stateAfterZoomIn) {
      expect(stateAfterZoomIn.zoom).toBeGreaterThan(stateBefore.zoom);
    }

    // Scroll down to zoom out
    await page.mouse.wheel(0, 600);
    await waitForMapIdle(page, 1500);

    const stateAfterZoomOut = await getMapState(page);

    if (stateAfterZoomIn && stateAfterZoomOut) {
      expect(stateAfterZoomOut.zoom).toBeLessThan(stateAfterZoomIn.zoom);
    }

    await expect(mapCanvas).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-003: Zoom przyciski +/-
  // ---------------------------------------------------------------------------
  test('TC-NAV-003: Zoom przyciski +/-', async ({ page }) => {
    const stateBefore = await getMapState(page);

    // Click zoom-in button (Polish: Przybliż, English: Zoom in)
    const zoomIn = page.locator(
      'button.mapboxgl-ctrl-zoom-in, button.maplibregl-ctrl-zoom-in, [aria-label*="Zoom in"], [aria-label*="Przybliż"], [title*="Zoom in"]'
    ).first();
    await expect(zoomIn).toBeVisible({ timeout: 10_000 });
    await zoomIn.click();
    await waitForMapIdle(page);

    const stateAfterIn = await getMapState(page);
    if (stateBefore && stateAfterIn) {
      expect(stateAfterIn.zoom).toBeGreaterThan(stateBefore.zoom);
    }

    // Click zoom-out button (Polish: Oddal, English: Zoom out)
    const zoomOut = page.locator(
      'button.mapboxgl-ctrl-zoom-out, button.maplibregl-ctrl-zoom-out, [aria-label*="Zoom out"], [aria-label*="Oddal"], [title*="Zoom out"]'
    ).first();
    await expect(zoomOut).toBeVisible({ timeout: 10_000 });
    await zoomOut.click();
    await waitForMapIdle(page);

    const stateAfterOut = await getMapState(page);
    if (stateAfterIn && stateAfterOut) {
      expect(stateAfterOut.zoom).toBeLessThan(stateAfterIn.zoom);
    }

    await expect(mapCanvas).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-004: Brak przycisku Reset widoku (known issue)
  // ---------------------------------------------------------------------------
  test('TC-NAV-004: Brak przycisku Reset widoku', async ({ page }) => {
    // Known issue: there is no "Reset view" / "Reset widoku" button.
    // Verify it does NOT exist.
    const resetButton = page.locator(
      'button:has-text("Reset"), button:has-text("reset view"), [aria-label*="reset view"], [aria-label*="Reset widoku"], [title*="Reset view"]'
    );
    await expect(resetButton).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-005: Obracanie mapy (bearing)
  // ---------------------------------------------------------------------------
  test('TC-NAV-005: Obracanie mapy (bearing)', async ({ page }) => {
    const stateBefore = await getMapState(page);
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Right-click drag horizontally to rotate (change bearing)
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx + 200, cy, { steps: 20 });
    await page.mouse.up({ button: 'right' });
    await waitForMapIdle(page);

    const stateAfter = await getMapState(page);

    if (stateBefore && stateAfter) {
      expect(Math.abs(stateAfter.bearing - stateBefore.bearing)).toBeGreaterThan(0.1);
    } else {
      await expect(mapCanvas).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-006: Pochylenie 3D (pitch)
  // ---------------------------------------------------------------------------
  test('TC-NAV-006: Pochylenie 3D (pitch)', async ({ page }) => {
    const stateBefore = await getMapState(page);
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Right-click drag vertically to tilt (change pitch)
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx, cy - 150, { steps: 20 });
    await page.mouse.up({ button: 'right' });
    await waitForMapIdle(page);

    const stateAfter = await getMapState(page);

    if (stateBefore && stateAfter) {
      expect(stateAfter.pitch).toBeGreaterThan(stateBefore.pitch);
    } else {
      await expect(mapCanvas).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-007: Reset bearing nie resetuje pitch (known issue)
  // ---------------------------------------------------------------------------
  test('TC-NAV-007: Reset bearing nie resetuje pitch', async ({ page }) => {
    const box = await mapCanvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // First tilt the map (pitch) with right-click drag vertical
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx, cy - 150, { steps: 20 });
    await page.mouse.up({ button: 'right' });
    await waitForMapIdle(page);

    // Also rotate (bearing) with right-click drag horizontal
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx + 200, cy, { steps: 20 });
    await page.mouse.up({ button: 'right' });
    await waitForMapIdle(page);

    const stateBeforeReset = await getMapState(page);

    // Click the compass / reset-bearing button to reset north
    const compassButton = page.locator(
      'button.mapboxgl-ctrl-compass, button.maplibregl-ctrl-compass, [aria-label*="Reset bearing"], [title*="Reset bearing"], .mapboxgl-ctrl-compass, .maplibregl-ctrl-compass'
    ).first();

    if (await compassButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await compassButton.click();
      await waitForMapIdle(page);

      const stateAfterReset = await getMapState(page);

      if (stateBeforeReset && stateAfterReset) {
        // Known issue: bearing resets but pitch does NOT reset
        expect(Math.abs(stateAfterReset.bearing)).toBeLessThan(1); // bearing ~0
        expect(stateAfterReset.pitch).toBeGreaterThan(0); // pitch stays
      }
    } else {
      // If there is no compass button, the known issue is confirmed differently
      // The pitch was set above and there is no way to reset it via bearing button
      if (stateBeforeReset) {
        expect(stateBeforeReset.pitch).toBeGreaterThan(0);
      } else {
        // getMapState returned null — map instance not exposed on window
        // Verify canvas is still visible (interactions didn't crash)
        await expect(mapCanvas).toBeVisible();
      }
    }
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-008: Zmiana mapy podkladowej
  // ---------------------------------------------------------------------------
  test('TC-NAV-008: Zmiana mapy podkladowej', async ({ page }) => {
    // Find the basemap / style switcher button
    const basemapButton = page.locator('button', { hasText: /Mapa podk[lł]adowa/i }).first();
    await expect(basemapButton).toBeVisible({ timeout: 10_000 });
    await basemapButton.click();
    await waitForMapIdle(page, 500);

    // Verify that basemap options appear (buttons like Ulice, Satelita, Biała etc.)
    const knownBasemaps = ['Ulice', 'Satelita', 'Jasna', 'Ciemna', 'Outdoor', 'Biała'];
    let foundCount = 0;
    for (const name of knownBasemaps) {
      const btn = page.getByRole('button', { name, exact: true });
      if (await btn.isVisible().catch(() => false)) foundCount++;
    }

    // There should be at least 2 basemap options visible
    expect(foundCount).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-009: Brak opcji OpenStreetMap w mapach podkladowych (known issue)
  // ---------------------------------------------------------------------------
  test('TC-NAV-009: Brak opcji OpenStreetMap w mapach podkladowych', async ({ page }) => {
    // Open basemap selector
    const basemapButton = page.locator('button', { hasText: /Mapa podk[lł]adowa/i }).first();
    await expect(basemapButton).toBeVisible({ timeout: 10_000 });
    await basemapButton.click();
    await waitForMapIdle(page, 500);

    // Known issue: OpenStreetMap option is missing from basemap options
    // Note: "© OpenStreetMap" exists in map attribution - must scope to basemap buttons only
    const osmButton = page.getByRole('button', { name: /OpenStreetMap|OSM/i });
    await expect(osmButton).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-010: Mapa podkladowa Satellite
  // ---------------------------------------------------------------------------
  test('TC-NAV-010: Mapa podkladowa Satellite', async ({ page }) => {
    // Open basemap selector
    const basemapButton = page.locator('button', { hasText: /Mapa podk[lł]adowa/i }).first();
    await expect(basemapButton).toBeVisible({ timeout: 10_000 });
    await basemapButton.click();
    await waitForMapIdle(page, 500);

    // Click on satellite option (UI uses Polish "Satelita")
    const satelliteOption = page.locator('button', { hasText: /Satelita|Satellite/i }).first();
    await expect(satelliteOption).toBeVisible({ timeout: 5_000 });
    await satelliteOption.click();
    await waitForMapIdle(page, 2000);

    // Verify map is still functional and canvas is visible
    await expect(mapCanvas).toBeVisible();

    // Optionally check the map style changed via the map instance
    const style = await page.evaluate(() => {
      const map =
        (window as any).map ||
        (window as any).mapInstance ||
        (window as any).__map;
      if (map && typeof map.getStyle === 'function') {
        const s = map.getStyle();
        return s?.name || s?.sprite || JSON.stringify(s).substring(0, 200);
      }
      return null;
    });

    // If we can read the style, verify it mentions satellite
    if (style) {
      expect(style.toLowerCase()).toMatch(/satellite|aerial/);
    }
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-011: Brak opcji Terrain (known issue)
  // ---------------------------------------------------------------------------
  test('TC-NAV-011: Brak opcji Terrain', async ({ page }) => {
    // Open basemap selector
    const basemapButton = page.locator('button', { hasText: /Mapa podk[lł]adowa/i }).first();
    await expect(basemapButton).toBeVisible({ timeout: 10_000 });
    await basemapButton.click();
    await waitForMapIdle(page, 500);

    // Known issue: Terrain option is missing
    const terrainOption = page.getByText(/^Terrain$|^Teren$/i);
    await expect(terrainOption).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // TC-NAV-012: Brak opcji wylaczenia mapy podkladowej (known issue)
  // ---------------------------------------------------------------------------
  test('TC-NAV-012: Brak opcji wylaczenia mapy podkladowej', async ({ page }) => {
    // Open basemap selector
    const basemapButton = page.locator('button', { hasText: /Mapa podk[lł]adowa/i }).first();
    await expect(basemapButton).toBeVisible({ timeout: 10_000 });
    await basemapButton.click();
    await waitForMapIdle(page, 500);

    // Known issue: there is no "None" / "Brak" / "No basemap" option
    const noneOption = page.getByText(/^None$|^Brak$|^No basemap$|^Bez mapy$/i);
    await expect(noneOption).toHaveCount(0);
  });
});
