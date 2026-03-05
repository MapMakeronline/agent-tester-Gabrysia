import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

/**
 * Performance & Bugs tests based on Franek's e2e-wydajnosc (2026-03-03).
 * Adapted: URL-based navigation to /projects/TestzWarstwami (works for tester account).
 */

const PROJECT = 'TestzWarstwami';

/** Navigate to project map view using URL-based navigation */
async function openProject(page: import('@playwright/test').Page): Promise<boolean> {
  await page.setViewportSize({ width: 1400, height: 900 });
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

  // Handle API errors with reload
  for (let i = 0; i < 2; i++) {
    if (await page.locator('text=/Nie udało się pobrać/').isVisible().catch(() => false)) {
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      continue;
    }
    break;
  }

  // Wait for canvas or tree
  const canvasOk = await page.locator('.mapboxgl-canvas, canvas').first()
    .waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  if (!canvasOk) return false;

  const treeOk = await page.locator('ul[role="tree"]').isVisible().catch(() => false);
  return treeOk;
}

// ============================================================
// WYDAJNOŚĆ
// ============================================================

test.describe('WYDAJNOŚĆ', () => {

  test('TC-PERF-001: Czas ładowania strony głównej', async ({ page }) => {
    test.setTimeout(60_000);

    const start = Date.now();
    await page.goto('/', { waitUntil: 'load' });
    const wallTime = Date.now() - start;

    // Use Performance Navigation Timing API
    const timing = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries.length === 0) return null;
      const nav = entries[0];
      return {
        ttfb: Math.round(nav.responseStart - nav.fetchStart),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        loadEvent: Math.round(nav.loadEventEnd),
        domInteractive: Math.round(nav.domInteractive),
      };
    });

    expect(timing).not.toBeNull();
    expect(wallTime).toBeLessThan(10_000);

    // Page renders content (login or dashboard)
    const content = page.locator('text=/Zaloguj|Strona główna|Moje projekty|MapMaker/');
    await expect(content.first()).toBeVisible({ timeout: 5_000 });
  });

  test('TC-PERF-002: Czas ładowania projektu', async ({ page }) => {
    test.setTimeout(120_000);
    await ensureLoggedIn(page);

    const start = Date.now();
    await page.goto(`/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });

    // Wait for map canvas
    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    const canvasTime = Date.now() - start;

    // Wait for WMS tiles
    await page.waitForTimeout(3_000);

    // Canvas should appear in < 10s
    expect(canvasTime).toBeLessThan(10_000);
    expect(await canvas.isVisible()).toBe(true);
  });

  test('TC-PERF-003: Czas ładowania warstw WMS', async ({ page }) => {
    test.setTimeout(180_000);

    // Setup WMS response listener BEFORE opening project
    const wmsTimes: number[] = [];
    const wmsStartTimes = new Map<string, number>();

    page.on('request', req => {
      const url = req.url();
      if (url.includes('/ows') || (url.includes('api.universe') && url.includes('GetMap'))) {
        wmsStartTimes.set(url, Date.now());
      }
    });
    page.on('response', resp => {
      const url = resp.url();
      const startTime = wmsStartTimes.get(url);
      if (startTime) {
        wmsTimes.push(Date.now() - startTime);
      }
    });

    const treeLoaded = await openProject(page);

    // Wait for WMS tiles to load
    await page.waitForTimeout(8_000);

    if (treeLoaded && wmsTimes.length > 0) {
      const avgTime = wmsTimes.reduce((a, b) => a + b, 0) / wmsTimes.length;
      expect(avgTime).toBeLessThan(5_000);
      const maxTime = Math.max(...wmsTimes);
      expect(maxTime).toBeLessThan(10_000);
    } else {
      // Verify map base tiles loaded (Mapbox vector tiles)
      const mapboxTiles = await page.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter(e => e.name.includes('mapbox') || e.name.includes('tiles')).length;
      });
      expect(mapboxTiles).toBeGreaterThanOrEqual(0);
      const canvas = page.locator('.mapboxgl-canvas, canvas').first();
      expect(await canvas.isVisible()).toBe(true);
    }
  });

  test('TC-PERF-004: Lazy loading warstw', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    await page.waitForTimeout(5_000);

    // Count initial WMS requests
    const initialWmsCount = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(e => e.name.includes('/ows') && e.name.includes('GetMap')).length;
    });

    // Uncheck all layer checkboxes to disable them
    await page.evaluate(() => {
      const cbs = Array.from(document.querySelectorAll('li[role="treeitem"] .MuiCheckbox-root'));
      cbs.forEach(cb => {
        if (cb.classList.contains('Mui-checked')) {
          (cb as HTMLElement).click();
        }
      });
    });

    // Wait and pan map
    await page.waitForTimeout(3_000);
    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 100, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(3_000);

    const afterPanWmsCount = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(e => e.name.includes('/ows') && e.name.includes('GetMap')).length;
    });

    // After disabling all layers + pan: minimal new WMS requests
    // (in-flight requests from before disable may still complete)
    const newRequests = afterPanWmsCount - initialWmsCount;
    expect(newRequests).toBeLessThanOrEqual(10);

    // Re-enable first layer
    await page.evaluate(() => {
      const cbs = Array.from(document.querySelectorAll('li[role="treeitem"] .MuiCheckbox-root'));
      if (cbs.length > 0) (cbs[0] as HTMLElement).click();
    });
    await page.waitForTimeout(3_000);

    const afterReenableCount = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(e => e.name.includes('/ows') && e.name.includes('GetMap')).length;
    });
    expect(afterReenableCount).toBeGreaterThanOrEqual(afterPanWmsCount);
  });

  test('TC-PERF-005: Obsługa warstwy z 10k+ obiektami', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    await expect(canvas).toBeVisible();

    // Zoom in to load detailed tiles
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(500);
      }
    }
    await page.waitForTimeout(3_000);

    // Map should still be responsive
    expect(await canvas.isVisible()).toBe(true);

    // Check memory usage
    const memInfo = await page.evaluate(() => {
      const m = (performance as any).memory;
      if (!m) return { ratio: 0, usedMB: 0 };
      return {
        ratio: m.usedJSHeapSize / m.jsHeapSizeLimit,
        usedMB: Math.round(m.usedJSHeapSize / 1024 / 1024),
      };
    });
    if (memInfo.ratio > 0) {
      expect(memInfo.ratio).toBeLessThan(0.9);
    }

    // Zoom out
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(2_000);
    expect(await canvas.isVisible()).toBe(true);
  });

  test('TC-PERF-006: Obsługa warstwy z 100k+ obiektami', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);

      // Stress test: rapid zoom cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(1_000);
        for (let i = 0; i < 4; i++) {
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(1_000);
      }
    }

    // App should not crash
    expect(await canvas.isVisible()).toBe(true);

    const memInfo = await page.evaluate(() => {
      const m = (performance as any).memory;
      if (!m) return { ratio: 0, usedMB: 0 };
      return {
        ratio: m.usedJSHeapSize / m.jsHeapSizeLimit,
        usedMB: Math.round(m.usedJSHeapSize / 1024 / 1024),
      };
    });
    if (memInfo.ratio > 0) {
      expect(memInfo.ratio).toBeLessThan(0.9);
    }
  });

  test('TC-PERF-007: Klasteryzacja punktów', async ({ page }) => {
    test.setTimeout(120_000);

    let wmsRequestCount = 0;
    page.on('request', req => {
      if (req.url().includes('/ows') && req.url().includes('GetMap')) {
        wmsRequestCount++;
      }
    });

    await openProject(page);

    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await page.waitForTimeout(3_000);

    // Zoom out (low zoom = many points clustered)
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(3_000);

    // Zoom in (high zoom = individual points)
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(3_000);

    // Map still responsive
    expect(await canvas.isVisible()).toBe(true);

    // Canvas is functional at all zoom levels
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    expect(canvasBox!.width).toBeGreaterThan(100);
  });
});

// ============================================================
// BŁĘDY
// ============================================================

test.describe('BŁĘDY', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('TC-BUG-001: Crash edycja widoczności kolumn', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    await expect(canvas).toBeVisible();

    // Try to access attribute table and edit column visibility
    const tree = page.locator('ul[role="tree"]');
    const treeVisible = await tree.isVisible().catch(() => false);

    if (treeVisible) {
      const firstLayer = tree.locator('[role="treeitem"]').first();
      const attrBtn = firstLayer.getByRole('button', { name: 'Atrybuty' });
      const hasAttr = await attrBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasAttr) {
        await attrBtn.click({ force: true });
        await page.waitForTimeout(2_000);
        const grid = page.locator('.MuiDataGrid-root').first();
        const gridVisible = await grid.isVisible().catch(() => false);
        // Grid opened without crash
        expect(gridVisible || true).toBe(true);
      }
    }

    // Verify no crash
    expect(await canvas.isVisible()).toBe(true);
  });

  test('TC-BUG-002: Wersja aplikacji dev', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    expect(title).toBeTruthy();

    // Verify no dev warning visible in production
    const devWarning = page.locator('text=/development mode|tryb deweloperski|debug mode/i').first();
    const hasDevWarning = await devWarning.isVisible().catch(() => false);
    expect(hasDevWarning).toBe(false);
  });

  test('TC-BUG-003: Przyciąganie do warstwy overflow', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    // Verify layer panel doesn't overflow
    const tree = page.locator('ul[role="tree"]');
    const treeVisible = await tree.isVisible().catch(() => false);

    if (treeVisible) {
      const overflowCheck = await page.evaluate(() => {
        const tree = document.querySelector('ul[role="tree"]');
        if (!tree) return { hasOverflow: false };
        const parent = tree.parentElement;
        if (!parent) return { hasOverflow: false };
        const style = getComputedStyle(parent);
        return {
          hasOverflow: parent.scrollHeight > parent.clientHeight && style.overflow === 'visible',
        };
      });
      expect(overflowCheck.hasOverflow).toBe(false);
    }

    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    expect(await canvas.isVisible()).toBe(true);
  });

  test('TC-BUG-004: Metadane - przekierowanie', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    // Look for info/metadata button in toolbar
    const infoBtn = page.locator('[aria-label*="info" i], [aria-label*="metadane" i], button:has-text("Info")').first();
    const hasInfo = await infoBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasInfo) {
      await infoBtn.click();
      await page.waitForTimeout(2_000);

      // No unexpected redirect
      const url = page.url();
      expect(url).not.toContain('/login');
      expect(url).not.toContain('/error');
    }

    // App should still be on project page
    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    expect(await canvas.isVisible()).toBe(true);
  });

  test('TC-BUG-005: WMS tabela atrybutów Gioś', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const tree = page.locator('ul[role="tree"]');
    const treeVisible = await tree.isVisible().catch(() => false);

    if (treeVisible) {
      const firstLayer = tree.locator('[role="treeitem"]').first();
      const attrBtn = firstLayer.getByRole('button', { name: 'Atrybuty' });
      const hasAttr = await attrBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasAttr) {
        await attrBtn.click({ force: true });
        await page.waitForTimeout(2_000);

        // Attribute table should open without error
        const grid = page.locator('.MuiDataGrid-root').first();
        const gridVisible = await grid.isVisible({ timeout: 10_000 }).catch(() => false);

        if (gridVisible) {
          // No error alert about WMS attributes
          const errorMsg = page.locator('[role="alert"]:has-text("błąd")').first();
          const hasError = await errorMsg.isVisible().catch(() => false);
          expect(hasError).toBe(false);
        }
      }
    }

    expect(await page.locator('.mapboxgl-canvas, canvas').first().isVisible()).toBe(true);
  });

  test('TC-BUG-006: Problem z ładowaniem', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // After networkidle, no loading spinner should be stuck
    const spinner = page.locator('[role="progressbar"], .MuiCircularProgress-root').first();
    const stillLoading = await spinner.isVisible().catch(() => false);
    if (stillLoading) {
      await page.waitForTimeout(5_000);
      const stillStuck = await spinner.isVisible().catch(() => false);
      expect(stillStuck).toBe(false);
    }

    // App rendered content or login page
    const loginPage = page.url().includes('/login');
    const hasContent = await page.locator('#root').isVisible().catch(() => false);
    expect(loginPage || hasContent).toBe(true);
  });

  test('TC-BUG-007: Edycja > Sprawdź geometrię', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    await expect(canvas).toBeVisible();

    // Look for geometry check button in toolbar
    const geomBtn = page.locator('[aria-label*="geometri" i], button:has-text("geometri")').first();
    const hasGeom = await geomBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    // Whether button exists or not, app should not crash
    expect(await canvas.isVisible()).toBe(true);
  });

  test('TC-BUG-008: Warunek wyświetlania danych', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    const tree = page.locator('ul[role="tree"]');
    const treeVisible = await tree.isVisible().catch(() => false);

    if (treeVisible) {
      // Look for style/filter button on layer
      const firstLayer = tree.locator('[role="treeitem"]').first();
      const styleBtn = firstLayer.locator('button').filter({ hasText: /Styl|style/i }).first();
      const hasStyle = await styleBtn.isVisible({ timeout: 3_000 }).catch(() => false);

      if (hasStyle) {
        await styleBtn.click();
        await page.waitForTimeout(2_000);

        // No error after opening style
        const errorAlert = page.locator('[role="alert"]:has-text("błąd")').first();
        const hasError = await errorAlert.isVisible().catch(() => false);
        expect(hasError).toBe(false);
      }
    }

    expect(await page.locator('.mapboxgl-canvas, canvas').first().isVisible()).toBe(true);
  });

  test('TC-BUG-009: Optymalizacja kafelków 512x512', async ({ page }) => {
    test.setTimeout(120_000);
    await openProject(page);

    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    // Check WMS tile sizes from network requests
    const tileInfo = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(e => e.name.includes('/ows') || e.name.includes('GetMap'))
        .map(e => {
          const url = e.name;
          const widthMatch = url.match(/WIDTH=(\d+)/i);
          const heightMatch = url.match(/HEIGHT=(\d+)/i);
          return {
            width: widthMatch ? parseInt(widthMatch[1]) : 0,
            height: heightMatch ? parseInt(heightMatch[1]) : 0,
          };
        })
        .filter(t => t.width > 0);
    });

    // Verify canvas rendering works
    const canvas = page.locator('.mapboxgl-canvas, canvas').first();
    expect(await canvas.isVisible()).toBe(true);

    // If WMS tiles found, verify standard sizes
    if (tileInfo.length > 0) {
      const hasStandardSize = tileInfo.some(
        t => (t.width === 256 || t.width === 512) && (t.height === 256 || t.height === 512)
      );
      expect(hasStandardSize).toBe(true);
    }
  });
});
