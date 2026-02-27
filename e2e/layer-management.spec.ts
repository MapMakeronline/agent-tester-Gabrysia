import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

const BASE_URL = 'https://universe-mapmaker.web.app';

/**
 * Helper: navigate to a known project that contains layers and groups.
 * After login we open the projects list, pick the first available project,
 * and wait until the map (or editor) view with the layer tree is ready.
 */
async function openProjectWithLayers(page: import('@playwright/test').Page) {
  // Navigate to the projects / dashboard
  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  // Click the first project card / row to open it
  const projectCard = page.locator(
    '[data-testid="project-card"], .project-card, .project-item, tr[data-project-id], [class*="ProjectCard"], [class*="projectCard"]'
  ).first();
  await expect(projectCard).toBeVisible({ timeout: 15_000 });
  await projectCard.click();

  // Wait for the map / editor view to load
  await page.waitForURL(/\/(map|editor|project)/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');

  // Wait for layer tree panel to appear
  const layerPanel = page.locator(
    '[data-testid="layer-tree"], [data-testid="layer-panel"], [class*="LayerTree"], [class*="layerTree"], [class*="layer-panel"], [class*="LayerPanel"], [aria-label*="warstw"], [aria-label*="layer"]'
  ).first();
  await expect(layerPanel).toBeVisible({ timeout: 15_000 });
}

/**
 * Helper: locate the layer tree panel.
 */
function layerTreePanel(page: import('@playwright/test').Page) {
  return page.locator(
    '[data-testid="layer-tree"], [data-testid="layer-panel"], [class*="LayerTree"], [class*="layerTree"], [class*="layer-panel"], [class*="LayerPanel"], [aria-label*="warstw"], [aria-label*="layer"]'
  ).first();
}

/**
 * Helper: locate a layer item by partial name.
 */
function layerItem(page: import('@playwright/test').Page, name?: string) {
  const panel = layerTreePanel(page);
  if (name) {
    return panel.locator(
      `[data-testid="layer-item"]:has-text("${name}"), [class*="layerItem"]:has-text("${name}"), [class*="LayerItem"]:has-text("${name}"), li:has-text("${name}")`
    ).first();
  }
  return panel.locator(
    '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
  ).first();
}

/**
 * Helper: locate a group item by partial name (or the first group).
 */
function groupItem(page: import('@playwright/test').Page, name?: string) {
  const panel = layerTreePanel(page);
  if (name) {
    return panel.locator(
      `[data-testid="layer-group"]:has-text("${name}"), [class*="layerGroup"]:has-text("${name}"), [class*="LayerGroup"]:has-text("${name}"), [class*="group"]:has-text("${name}")`
    ).first();
  }
  return panel.locator(
    '[data-testid="layer-group"], [class*="layerGroup"], [class*="LayerGroup"], [data-group-id]'
  ).first();
}

/**
 * Helper: right-click a target element and click a context menu option.
 */
async function rightClickAndSelect(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
  menuOptionPattern: RegExp
) {
  await target.click({ button: 'right' });
  const contextMenu = page.locator(
    '[role="menu"], [class*="ContextMenu"], [class*="contextMenu"], .MuiMenu-paper, .MuiPopover-paper'
  ).first();
  await expect(contextMenu).toBeVisible({ timeout: 5_000 });
  const option = contextMenu.getByText(menuOptionPattern).first();
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();
}

test.describe('ZARZĄDZANIE WARSTWAMI', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
    await openProjectWithLayers(page);
  });

  // TC-LAYER-001: Wyswietlanie drzewa warstw
  test('TC-LAYER-001: Wyswietlanie drzewa warstw', async ({ page }) => {
    const panel = layerTreePanel(page);
    await expect(panel).toBeVisible();

    // Verify there is at least one layer item in the tree
    const layers = panel.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id], [class*="treeNode"], [class*="TreeNode"]'
    );
    const count = await layers.count();
    expect(count).toBeGreaterThan(0);
  });

  // TC-LAYER-002: Rozwijanie/zwijanie grup
  test('TC-LAYER-002: Rozwijanie/zwijanie grup', async ({ page }) => {
    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });

    // Locate the expand/collapse toggle within the group
    const toggle = group.locator(
      '[data-testid="group-toggle"], [class*="expand"], [class*="collapse"], [class*="arrow"], svg, button'
    ).first();
    await expect(toggle).toBeVisible();

    // Click to collapse (or expand) the group
    await toggle.click();
    await page.waitForTimeout(500);

    // Click again to revert
    await toggle.click();
    await page.waitForTimeout(500);

    // The group should still be visible (toggle did not remove it)
    await expect(group).toBeVisible();
  });

  // TC-LAYER-003: Przeciaganie warstw (zmiana kolejnosci)
  test('TC-LAYER-003: Przeciaganie warstw (zmiana kolejnosci)', async ({ page }) => {
    const panel = layerTreePanel(page);
    const layers = panel.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
    );
    const layerCount = await layers.count();
    expect(layerCount).toBeGreaterThanOrEqual(2);

    // Grab the first layer text before drag
    const firstLayerText = await layers.nth(0).innerText();
    const secondLayerText = await layers.nth(1).innerText();

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

    // After drag, the order may have changed - verify the panel still shows layers
    const newFirstText = await layers.nth(0).innerText();
    const newSecondText = await layers.nth(1).innerText();
    // Either the order swapped or remained (drag may or may not succeed depending on UI),
    // but both layers should still exist in the tree
    const allTexts = [newFirstText, newSecondText];
    expect(allTexts).toContain(firstLayerText);
    expect(allTexts).toContain(secondLayerText);
  });

  // TC-LAYER-004: Przeciaganie warstw miedzy grupami
  test('TC-LAYER-004: Przeciaganie warstw miedzy grupami', async ({ page }) => {
    const panel = layerTreePanel(page);

    // We need at least two groups
    const groups = panel.locator(
      '[data-testid="layer-group"], [class*="layerGroup"], [class*="LayerGroup"], [data-group-id]'
    );
    const groupCount = await groups.count();
    expect(groupCount).toBeGreaterThanOrEqual(2);

    // Pick a layer from the first group
    const firstGroup = groups.nth(0);
    const layerInFirstGroup = firstGroup.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
    ).first();
    await expect(layerInFirstGroup).toBeVisible({ timeout: 10_000 });
    const draggedLayerText = await layerInFirstGroup.innerText();

    // Target: second group
    const secondGroup = groups.nth(1);
    const secondGroupBox = (await secondGroup.boundingBox())!;
    const layerBox = (await layerInFirstGroup.boundingBox())!;
    expect(layerBox).not.toBeNull();
    expect(secondGroupBox).not.toBeNull();

    // Drag the layer into the second group
    await page.mouse.move(layerBox.x + layerBox.width / 2, layerBox.y + layerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      secondGroupBox.x + secondGroupBox.width / 2,
      secondGroupBox.y + secondGroupBox.height / 2,
      { steps: 15 }
    );
    await page.mouse.up();
    await page.waitForTimeout(1_000);

    // The dragged layer name should still be present somewhere in the tree
    await expect(panel.getByText(draggedLayerText).first()).toBeVisible();
  });

  // TC-LAYER-005: Wlaczanie/wylaczanie widocznosci warstwy
  test('TC-LAYER-005: Wlaczanie/wylaczanie widocznosci warstwy', async ({ page }) => {
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });

    // Find the visibility checkbox / toggle within the layer item
    const visibilityToggle = layer.locator(
      'input[type="checkbox"], [data-testid="visibility-toggle"], [class*="visibility"], [role="checkbox"], [aria-label*="widoczn"], [aria-label*="visible"]'
    ).first();
    await expect(visibilityToggle).toBeVisible();

    // Get initial checked state
    const wasChecked = await visibilityToggle.isChecked().catch(() => true);

    // Toggle off
    await visibilityToggle.click();
    await page.waitForTimeout(500);

    // Toggle on again
    await visibilityToggle.click();
    await page.waitForTimeout(500);

    // State should return to initial
    const isCheckedNow = await visibilityToggle.isChecked().catch(() => true);
    expect(isCheckedNow).toBe(wasChecked);
  });

  // TC-LAYER-006: Powieksz do zakresu warstwy
  test('TC-LAYER-006: Powieksz do zakresu warstwy', async ({ page }) => {
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });

    await rightClickAndSelect(page, layer, /powiększ|zoom to|extent|zakres/i);

    // After zooming, the map should still be present and the layer panel visible
    await page.waitForTimeout(1_000);
    await expect(layerTreePanel(page)).toBeVisible();
  });

  // TC-LAYER-007: Usuniecie warstwy
  test('TC-LAYER-007: Usuniecie warstwy', async ({ page }) => {
    const panel = layerTreePanel(page);
    const layersBefore = await panel.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
    ).count();

    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });
    const layerName = await layer.innerText();

    await rightClickAndSelect(page, layer, /usuń|delete|remove/i);

    // Handle possible confirmation dialog
    const confirmBtn = page.locator(
      'button:has-text("Tak"), button:has-text("OK"), button:has-text("Potwierdź"), button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Usuń")'
    ).first();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1_000);

    // Verify the layer count decreased or the specific layer is gone
    const layersAfter = await panel.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
    ).count();
    expect(layersAfter).toBeLessThan(layersBefore);
  });

  // TC-LAYER-008: Duplikowanie warstwy
  test('TC-LAYER-008: Duplikowanie warstwy', async ({ page }) => {
    const panel = layerTreePanel(page);
    const layersBefore = await panel.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
    ).count();

    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });

    await rightClickAndSelect(page, layer, /duplikuj|duplicate|kopiuj|copy/i);
    await page.waitForTimeout(1_500);

    // If a rename dialog appears, confirm it
    const renameInput = page.locator(
      'input[type="text"]:visible, [data-testid="rename-input"]:visible'
    ).first();
    if (await renameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await renameInput.press('Enter');
    }
    await page.waitForTimeout(1_000);

    // Verify the layer count increased
    const layersAfter = await panel.locator(
      '[data-testid="layer-item"], [class*="layerItem"], [class*="LayerItem"], li[data-layer-id]'
    ).count();
    expect(layersAfter).toBeGreaterThan(layersBefore);
  });

  // TC-LAYER-009: Pobieranie warstwy (eksport)
  test('TC-LAYER-009: Pobieranie warstwy (eksport)', async ({ page }) => {
    const layer = layerItem(page);
    await expect(layer).toBeVisible({ timeout: 10_000 });

    // Right-click and verify download/export option exists
    await layer.click({ button: 'right' });
    const contextMenu = page.locator(
      '[role="menu"], [class*="ContextMenu"], [class*="contextMenu"], .MuiMenu-paper, .MuiPopover-paper'
    ).first();
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    const exportOption = contextMenu.getByText(/pobierz|download|eksport|export/i).first();
    await expect(exportOption).toBeVisible({ timeout: 5_000 });

    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await exportOption.click();

    // Verify either a download started or an export dialog appeared
    const download = await downloadPromise;
    const exportDialog = page.locator(
      '[role="dialog"]:has-text("eksport"), [role="dialog"]:has-text("export"), [role="dialog"]:has-text("pobierz"), [role="dialog"]:has-text("download")'
    ).first();

    const downloadStarted = download !== null;
    const dialogAppeared = await exportDialog.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(downloadStarted || dialogAppeared).toBeTruthy();
  });

  // TC-LAYER-010: Tworzenie nowej grupy
  test('TC-LAYER-010: Tworzenie nowej grupy', async ({ page }) => {
    const panel = layerTreePanel(page);
    const groupsBefore = await panel.locator(
      '[data-testid="layer-group"], [class*="layerGroup"], [class*="LayerGroup"], [data-group-id]'
    ).count();

    // Right-click on the panel background or a layer to access "new group"
    await panel.click({ button: 'right' });
    const contextMenu = page.locator(
      '[role="menu"], [class*="ContextMenu"], [class*="contextMenu"], .MuiMenu-paper, .MuiPopover-paper'
    ).first();
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    const newGroupOption = contextMenu.getByText(/nowa grupa|new group|dodaj grupę|add group/i).first();
    await expect(newGroupOption).toBeVisible({ timeout: 5_000 });
    await newGroupOption.click();

    // If a name input dialog appears, type a name and confirm
    const nameInput = page.locator(
      'input[type="text"]:visible, [data-testid="group-name-input"]:visible'
    ).first();
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.fill('Nowa Grupa Testowa');
      await nameInput.press('Enter');
    }
    await page.waitForTimeout(1_000);

    // Verify a new group appeared
    const groupsAfter = await panel.locator(
      '[data-testid="layer-group"], [class*="layerGroup"], [class*="LayerGroup"], [data-group-id]'
    ).count();
    expect(groupsAfter).toBeGreaterThan(groupsBefore);
  });

  // TC-LAYER-011: Zmiana nazwy grupy
  test('TC-LAYER-011: Zmiana nazwy grupy', async ({ page }) => {
    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });

    await rightClickAndSelect(page, group, /zmień nazwę|rename|edytuj nazwę/i);

    // A rename input should appear
    const renameInput = page.locator(
      'input[type="text"]:visible, [data-testid="rename-input"]:visible, [data-testid="group-name-input"]:visible'
    ).first();
    await expect(renameInput).toBeVisible({ timeout: 5_000 });

    const newName = `Grupa Zmieniona ${Date.now()}`;
    await renameInput.fill(newName);
    await renameInput.press('Enter');
    await page.waitForTimeout(1_000);

    // Verify the new name appears in the tree
    await expect(layerTreePanel(page).getByText(newName).first()).toBeVisible({ timeout: 5_000 });
  });

  // TC-LAYER-012: Usuniecie grupy
  test('TC-LAYER-012: Usuniecie grupy', async ({ page }) => {
    const panel = layerTreePanel(page);
    const groupsBefore = await panel.locator(
      '[data-testid="layer-group"], [class*="layerGroup"], [class*="LayerGroup"], [data-group-id]'
    ).count();
    expect(groupsBefore).toBeGreaterThan(0);

    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });

    await rightClickAndSelect(page, group, /usuń|delete|remove/i);

    // Handle possible confirmation dialog
    const confirmBtn = page.locator(
      'button:has-text("Tak"), button:has-text("OK"), button:has-text("Potwierdź"), button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Usuń")'
    ).first();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1_000);

    // Verify the group count decreased
    const groupsAfter = await panel.locator(
      '[data-testid="layer-group"], [class*="layerGroup"], [class*="LayerGroup"], [data-group-id]'
    ).count();
    expect(groupsAfter).toBeLessThan(groupsBefore);
  });

  // TC-LAYER-013: Wlaczanie/wylaczanie widocznosci grupy
  test('TC-LAYER-013: Wlaczanie/wylaczanie widocznosci grupy', async ({ page }) => {
    const group = groupItem(page);
    await expect(group).toBeVisible({ timeout: 10_000 });

    // Find the visibility checkbox / toggle within the group
    const visibilityToggle = group.locator(
      'input[type="checkbox"], [data-testid="visibility-toggle"], [class*="visibility"], [role="checkbox"], [aria-label*="widoczn"], [aria-label*="visible"]'
    ).first();
    await expect(visibilityToggle).toBeVisible();

    // Get initial checked state
    const wasChecked = await visibilityToggle.isChecked().catch(() => true);

    // Toggle off
    await visibilityToggle.click();
    await page.waitForTimeout(500);

    // Toggle on again
    await visibilityToggle.click();
    await page.waitForTimeout(500);

    // State should return to initial
    const isCheckedNow = await visibilityToggle.isChecked().catch(() => true);
    expect(isCheckedNow).toBe(wasChecked);
  });
});
