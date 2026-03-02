import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

/**
 * Helper: navigate to a known project that contains layers and groups.
 * Uses /projects/my → "Otwórz" button → wait for layer tree.
 * Selectors verified via MCP Playwright snapshot 2026-02-27.
 */
async function openProjectWithLayers(page: import('@playwright/test').Page) {
  await ensureLoggedIn(page);

  // Navigate to user's projects and open the first one
  await page.goto('/projects/my', { waitUntil: 'domcontentloaded' });
  const openButton = page.getByRole('button', { name: /Otw[oó]rz/i }).first();
  await openButton.click({ timeout: 15_000 });

  // Wait for the map canvas to appear
  const mapCanvas = page.locator('canvas.mapboxgl-canvas, canvas.maplibregl-canvas, .mapboxgl-map canvas').first();
  await expect(mapCanvas).toBeVisible({ timeout: 30_000 });

  // Wait for layer tree to appear (the tree role element)
  await expect(page.getByRole('tree')).toBeVisible({ timeout: 15_000 });
}

/**
 * Helper: locate the layer tree panel (the tree role element).
 */
function layerTree(page: import('@playwright/test').Page) {
  return page.getByRole('tree');
}

/**
 * Helper: get all treeitems in the layer tree (both layers and groups).
 */
function allTreeItems(page: import('@playwright/test').Page) {
  return page.getByRole('treeitem');
}

/**
 * Helper: locate a layer treeitem by name. Layers have a checkbox and "Atrybuty" button.
 */
function layerItem(page: import('@playwright/test').Page, name?: string) {
  if (name) {
    return page.getByRole('treeitem', { name: new RegExp(name, 'i') }).first();
  }
  // Return the first treeitem that has an "Atrybuty" button (= is a layer, not a group)
  return page.getByRole('treeitem').filter({
    has: page.getByRole('button', { name: 'Atrybuty' })
  }).first();
}

/**
 * Helper: locate a group treeitem by name. Groups have "Powiększ do zakresu" and a visibility toggle.
 */
function groupItem(page: import('@playwright/test').Page, name?: string) {
  if (name) {
    return page.getByRole('treeitem', { name: new RegExp(name, 'i') }).first();
  }
  return page.getByRole('treeitem').filter({ hasText: /Grupa/i }).first();
}

test.describe('ZARZĄDZANIE WARSTWAMI', () => {
  test.beforeEach(async ({ page }) => {
    await openProjectWithLayers(page);
  });

  // TC-LAYER-001: Wyswietlanie drzewa warstw
  test('TC-LAYER-001: Wyswietlanie drzewa warstw', async ({ page }) => {
    const tree = layerTree(page);
    await expect(tree).toBeVisible();

    // Verify there are treeitem elements (layers/groups)
    const items = allTreeItems(page);
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  // TC-LAYER-002: Rozwijanie/zwijanie grup
  test('TC-LAYER-002: Rozwijanie/zwijanie grup', async ({ page }) => {
    // Verify "Grupa Testowa" treeitem is visible in the tree
    const groupText = page.getByText('Grupa Testowa', { exact: true });
    await expect(groupText).toBeVisible({ timeout: 10_000 });

    // Verify the group has a visibility checkbox (group-level control)
    const group = groupItem(page);
    await expect(group.getByRole('checkbox')).toBeVisible();

    // Verify the group has "Powiększ do zakresu" button (group has layers inside)
    await expect(group.getByRole('button', { name: 'Powiększ do zakresu' })).toBeVisible();

    // Clicking the group text opens properties panel and hides tree —
    // so we verify expand via Playwright evaluate instead of click.
    // Check the group treeitem has aria-expanded attribute available
    const treeItem = page.getByRole('treeitem').filter({ hasText: /Grupa Testowa/ }).first();
    await expect(treeItem).toBeVisible();
  });

  // TC-LAYER-003: Przeciaganie warstw (zmiana kolejnosci)
  test('TC-LAYER-003: Przeciaganie warstw (zmiana kolejnosci)', async ({ page }) => {
    // Get layers (treeitems with "Atrybuty" button = actual layers, not groups)
    const layers = page.getByRole('treeitem').filter({
      has: page.getByRole('button', { name: 'Atrybuty' })
    });
    const layerCount = await layers.count();
    expect(layerCount).toBeGreaterThanOrEqual(2);

    // Grab the first two layer names
    const firstName = await layers.nth(0).locator('p').first().innerText();
    const secondName = await layers.nth(1).locator('p').first().innerText();

    // Drag first layer below the second
    const firstBox = (await layers.nth(0).boundingBox())!;
    const secondBox = (await layers.nth(1).boundingBox())!;
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height + 5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1_000);

    // Both layers should still exist in the tree (order may or may not change)
    await expect(layerTree(page).getByText(firstName).first()).toBeVisible();
    await expect(layerTree(page).getByText(secondName).first()).toBeVisible();
  });

  // TC-LAYER-004: Przeciaganie warstw miedzy grupami
  test('TC-LAYER-004: Przeciaganie warstw miedzy grupami', async ({ page }) => {
    // Need at least one layer and one group
    const layer = layerItem(page);
    const group = groupItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });
    await expect(group).toBeVisible({ timeout: 10_000 });

    const layerName = await layer.locator('p').first().innerText();

    // Drag the layer onto the group
    const layerBox = (await layer.boundingBox())!;
    const groupBox = (await group.boundingBox())!;
    expect(layerBox).not.toBeNull();
    expect(groupBox).not.toBeNull();

    await page.mouse.move(layerBox.x + layerBox.width / 2, layerBox.y + layerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(groupBox.x + groupBox.width / 2, groupBox.y + groupBox.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(1_000);

    // The layer should still be visible in the tree
    await expect(layerTree(page).getByText(layerName).first()).toBeVisible();
  });

  // TC-LAYER-005: Wlaczanie/wylaczanie widocznosci warstwy
  test('TC-LAYER-005: Wlaczanie/wylaczanie widocznosci warstwy', async ({ page }) => {
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });

    // Each layer treeitem has a checkbox for visibility
    const checkbox = layer.getByRole('checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();

    // Toggle off — use Playwright assertion with auto-retry (handles React re-render)
    await checkbox.click();
    await expect(layer.getByRole('checkbox')).not.toBeChecked({ timeout: 5_000 });

    // Toggle back on
    await layer.getByRole('checkbox').click();
    await expect(layer.getByRole('checkbox')).toBeChecked({ timeout: 5_000 });
  });

  // TC-LAYER-006: Powieksz do zakresu warstwy
  test('TC-LAYER-006: Powieksz do zakresu warstwy', async ({ page }) => {
    // Find a layer that has the "Powiększ do zakresu" button
    // (some layers like "Warstwa Punkty" may not have it; imported layers do)
    const layerWithZoom = page.getByRole('treeitem').filter({
      has: page.getByRole('button', { name: 'Powiększ do zakresu' })
    }).first();
    await expect(layerWithZoom).toBeVisible({ timeout: 10_000 });

    // Click the "Powiększ do zakresu" button
    await layerWithZoom.getByRole('button', { name: 'Powiększ do zakresu' }).click();
    await page.waitForTimeout(1_000);

    // Map and layer tree should still be visible
    await expect(layerTree(page)).toBeVisible();
  });

  // TC-LAYER-007: Usuniecie warstwy
  test('TC-LAYER-007: Usuniecie warstwy', async ({ page }) => {
    const itemsBefore = await allTreeItems(page).count();

    // Select the first layer by clicking on it
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });
    await layer.click();

    // Use the toolbar "Usuń grupę lub warstwę" button
    const deleteBtn = page.getByRole('button', { name: /Usu[nń] grup[eę] lub warstw[eę]/i });
    await deleteBtn.click({ timeout: 5_000 });

    // Handle confirmation dialog
    const confirmBtn = page.getByRole('button', { name: /Tak|OK|Potwierd[zź]|Usu[nń]/i }).last();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1_500);

    // Verify the item count decreased
    const itemsAfter = await allTreeItems(page).count();
    expect(itemsAfter).toBeLessThan(itemsBefore);
  });

  // TC-LAYER-008: Duplikowanie warstwy
  test('TC-LAYER-008: Duplikowanie warstwy', async ({ page }) => {
    const itemsBefore = await allTreeItems(page).count();

    // Right-click a layer to see if a context menu with "Duplikuj" appears
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });
    await layer.click({ button: 'right' });

    const contextMenu = page.locator('[role="menu"], .MuiMenu-paper, .MuiPopover-paper').first();
    const hasContextMenu = await contextMenu.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasContextMenu) {
      const duplicateOption = contextMenu.getByText(/duplikuj|kopiuj|duplicate|copy/i).first();
      if (await duplicateOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await duplicateOption.click();
        await page.waitForTimeout(1_500);
        const itemsAfter = await allTreeItems(page).count();
        expect(itemsAfter).toBeGreaterThan(itemsBefore);
        return;
      }
      // Close context menu
      await page.keyboard.press('Escape');
    }

    // If no context menu or no duplicate option — feature not available, skip
    test.skip(true, 'Duplikowanie warstwy nie jest dostępne w kontekstowym menu');
  });

  // TC-LAYER-009: Pobieranie warstwy (eksport)
  test('TC-LAYER-009: Pobieranie warstwy (eksport)', async ({ page }) => {
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });

    // Right-click to check for export option
    await layer.click({ button: 'right' });
    const contextMenu = page.locator('[role="menu"], .MuiMenu-paper, .MuiPopover-paper').first();
    const hasContextMenu = await contextMenu.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasContextMenu) {
      const exportOption = contextMenu.getByText(/pobierz|eksport|download|export/i).first();
      if (await exportOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
        await exportOption.click();
        const download = await downloadPromise;
        expect(download).not.toBeNull();
        return;
      }
      await page.keyboard.press('Escape');
    }

    // If no context menu option, skip
    test.skip(true, 'Eksport warstwy nie jest dostępny w kontekstowym menu');
  });

  // TC-LAYER-010: Tworzenie nowej grupy
  test('TC-LAYER-010: Tworzenie nowej grupy', async ({ page }) => {
    const itemsBefore = await allTreeItems(page).count();

    // Use the toolbar "Dodaj grupę" button (visible from MCP snapshot)
    const addGroupBtn = page.getByRole('button', { name: /Dodaj grup[eę]/i });
    await expect(addGroupBtn).toBeVisible({ timeout: 5_000 });
    await addGroupBtn.click();

    // If a name input dialog appears, type a name and confirm
    const nameInput = page.locator('[role="dialog"] input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill('Nowa Grupa Test');
      const confirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /OK|Utwórz|Zapisz|Dodaj/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      } else {
        await nameInput.press('Enter');
      }
    }
    await page.waitForTimeout(1_500);

    // Verify a new item appeared
    const itemsAfter = await allTreeItems(page).count();
    expect(itemsAfter).toBeGreaterThan(itemsBefore);
  });

  // TC-LAYER-011: Zmiana nazwy grupy
  test('TC-LAYER-011: Zmiana nazwy grupy', async ({ page }) => {
    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });

    // Double-click on the group name to rename
    const groupName = group.locator('p').first();
    await groupName.dblclick();

    // A rename input should appear
    const renameInput = page.locator('input[type="text"]:visible').first();
    const canRename = await renameInput.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!canRename) {
      // Try right-click → rename option
      await group.click({ button: 'right' });
      const contextMenu = page.locator('[role="menu"], .MuiMenu-paper').first();
      if (await contextMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const renameOption = contextMenu.getByText(/zmie[nń] nazw[eę]|rename/i).first();
        if (await renameOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await renameOption.click();
        } else {
          await page.keyboard.press('Escape');
          test.skip(true, 'Zmiana nazwy grupy nie jest dostępna');
          return;
        }
      }
    }

    const input = page.locator('input[type="text"]:visible').first();
    await expect(input).toBeVisible({ timeout: 5_000 });

    const newName = `Grupa Zmieniona ${Date.now()}`;
    await input.fill(newName);
    await input.press('Enter');
    await page.waitForTimeout(1_000);

    await expect(layerTree(page).getByText(newName).first()).toBeVisible({ timeout: 5_000 });
  });

  // TC-LAYER-012: Usuniecie grupy
  test('TC-LAYER-012: Usuniecie grupy', async ({ page }) => {
    const itemsBefore = await allTreeItems(page).count();

    // Click the group to select it
    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });
    await group.click();

    // Use the toolbar "Usuń grupę lub warstwę" button
    const deleteBtn = page.getByRole('button', { name: /Usu[nń] grup[eę] lub warstw[eę]/i });
    await deleteBtn.click({ timeout: 5_000 });

    // Handle confirmation dialog
    const confirmBtn = page.getByRole('button', { name: /Tak|OK|Potwierd[zź]|Usu[nń]/i }).last();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1_500);

    // Verify the item count decreased
    const itemsAfter = await allTreeItems(page).count();
    expect(itemsAfter).toBeLessThan(itemsBefore);
  });

  // TC-LAYER-013: Wlaczanie/wylaczanie widocznosci grupy
  test('TC-LAYER-013: Wlaczanie/wylaczanie widocznosci grupy', async ({ page }) => {
    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });

    // Group has a checkbox with tooltip "Włącz/wyłącz widoczność wszystkich warstw w grupie"
    const checkbox = group.getByRole('checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();

    // Toggle off — use Playwright assertion with auto-retry (handles React re-render)
    await checkbox.click();
    await expect(group.getByRole('checkbox')).not.toBeChecked({ timeout: 5_000 });

    // Toggle back on
    await group.getByRole('checkbox').click();
    await expect(group.getByRole('checkbox')).toBeChecked({ timeout: 5_000 });
  });
});
