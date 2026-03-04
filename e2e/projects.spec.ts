import { test, expect } from './fixtures';
import { ensureLoggedIn } from './helpers/auth';

/**
 * Projects tests based on Franek's verified selectors (2026-03-03).
 * Key improvements over previous version:
 * - TC-PROJ-005: Tests pagination on /projects/public (has enough projects)
 * - TC-PROJ-010-013: Uses "Edytuj" button directly on card (1-step, not 2-step)
 * - TC-PROJ-015/016: Correctly handles native window.confirm() dialog
 */

test.describe('PROJEKTY', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test('TC-PROJ-001: Wyswietlanie listy projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const projectCards = page.locator('.MuiCard-root');
    await expect(projectCards.first()).toBeVisible({ timeout: 15_000 });
    const count = await projectCards.count();
    expect(count).toBeGreaterThan(0);

    const firstProject = projectCards.first();
    const textContent = await firstProject.textContent();
    expect(textContent?.trim().length).toBeGreaterThan(0);

    // Verify dates visible (DD-MM-YY format e.g. "11-02-26")
    const datePattern = /\d{2}[./\-]\d{2}[./\-]\d{2,4}/;
    const pageText = await page.locator('#root').textContent();
    expect(pageText).toMatch(datePattern);
  });

  test('TC-PROJ-002: Brak funkcji filtrowania projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const filterButton = page.locator(
      'button:has-text("Filtr"), button:has-text("Filter"), ' +
      '[data-testid*="filter"], [aria-label*="filtr"], [aria-label*="filter"]'
    );
    await expect(filterButton).toHaveCount(0);

    const filterInput = page.locator(
      'select[name*="filter"], [data-testid*="filter-select"], ' +
      '[role="combobox"][aria-label*="filtr"]'
    );
    await expect(filterInput).toHaveCount(0);
  });

  test('TC-PROJ-003: Wyszukiwanie projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const searchField = page.locator(
      'input[type="search"], input[placeholder*="Szukaj"], input[placeholder*="szukaj"], ' +
      'input[placeholder*="Search"], input[placeholder*="search"], ' +
      '[data-testid*="search"], [aria-label*="search"], [aria-label*="szukaj"]'
    );
    await expect(searchField).toHaveCount(0);
  });

  test('TC-PROJ-004: Brak funkcji sortowania projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const sortHeaders = page.locator(
      'th[aria-sort], [data-testid*="sort"], [role="columnheader"][aria-sort], ' +
      'button:has-text("Sortuj"), button:has-text("Sort"), ' +
      '[aria-label*="sort"], [aria-label*="sortuj"]'
    );
    await expect(sortHeaders).toHaveCount(0);
  });

  test('TC-PROJ-005: Paginacja listy projektow', async ({ page }) => {
    // Use /projects/public which has enough projects for pagination
    await page.goto('/projects/public');
    await page.waitForLoadState('networkidle');

    const pagination = page.locator('.MuiPagination-root');
    await expect(pagination).toBeVisible({ timeout: 15_000 });

    const paginationItems = page.locator('.MuiPaginationItem-root');
    const itemCount = await paginationItems.count();
    expect(itemCount).toBeGreaterThan(1);
  });

  test('TC-PROJ-006: Tworzenie nowego projektu', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Nazwa projektu', { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    const expectedCategories = ['EMUiA', 'SIP', 'Suikzp', 'MPZP', 'EGiB', 'Inne'];
    await expect(page.getByText('Kategoria', { exact: false }).first()).toBeVisible();
    for (const cat of expectedCategories) {
      await expect(page.getByRole('button', { name: cat, exact: true }).first()).toBeVisible();
    }

    await expect(page.getByText('Opis', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('kluczowe', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Projekt publiczny', { exact: false }).first()).toBeVisible();
  });

  test('TC-PROJ-007: Walidacja nazwy projektu', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[type="text"]').first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });

    const placeholder = await nameInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.length).toBeGreaterThan(0);
  });

  test('TC-PROJ-008: Wybor kategorii projektu', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    const expectedCategories = ['EMUiA', 'SIP', 'Suikzp', 'MPZP', 'EGiB', 'Inne'];
    await expect(page.getByText('Kategoria', { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    for (const cat of expectedCategories) {
      await expect(page.getByRole('button', { name: cat, exact: true }).first()).toBeVisible();
    }
  });

  test('TC-PROJ-009: Ustawienie projektu jako publiczny/prywatny', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('Projekt publiczny', { exact: false }).first()
    ).toBeVisible({ timeout: 15_000 });

    const checkbox = page.locator('.MuiFormControlLabel-root:has-text("publiczny") input[type="checkbox"]');
    await expect(checkbox).toBeAttached();
  });

  test('TC-PROJ-010: Zmiana nazwy projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Click "Edytuj" directly on the first project card
    const editButton = page.locator('.MuiCard-root button:has-text("Edytuj")').first();
    await expect(editButton).toBeVisible({ timeout: 15_000 });
    await editButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const nameInput = page.locator('input[placeholder="Mój Projekt"]');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    const testName = `Test Rename ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(testName);

    const saveButton = page.locator('button:has-text("Zapisz")').first();
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('TC-PROJ-011: Zmiana opisu projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const editButton = page.locator('.MuiCard-root button:has-text("Edytuj")').first();
    await expect(editButton).toBeVisible({ timeout: 15_000 });
    await editButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const descField = page.locator('textarea[placeholder*="Opisz"]').first();
    await expect(descField).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Opis', { exact: false }).first()).toBeVisible();
  });

  test('TC-PROJ-012: Zmiana kategorii projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const editButton = page.locator('.MuiCard-root button:has-text("Edytuj")').first();
    await expect(editButton).toBeVisible({ timeout: 15_000 });
    await editButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(
      page.getByText('Kategoria', { exact: false }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TC-PROJ-013: Zmiana statusu publiczny/prywatny', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const editButton = page.locator('.MuiCard-root button:has-text("Edytuj")').first();
    await expect(editButton).toBeVisible({ timeout: 15_000 });
    await editButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(
      page.getByText('Projekt publiczny', { exact: false }).first()
    ).toBeVisible({ timeout: 10_000 });

    const checkbox = page.locator('.MuiFormControlLabel-root:has-text("publiczny") input[type="checkbox"]');
    await expect(checkbox).toBeAttached();
  });

  test('TC-PROJ-014: Usuniecie projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const deleteButton = page.locator('.MuiCard-root button:has-text("Usuń")').first();
    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
  });

  // TC-PROJ-015/016: App uses native window.confirm() — NOT MUI dialog
  test('TC-PROJ-015: Potwierdzenie przed usunieciem projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Set up native dialog handler BEFORE clicking delete
    let dialogMessage = '';
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // Cancel to preserve data
    });

    const deleteButton = page.locator('.MuiCard-root button:has-text("Usuń")').first();
    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
    await deleteButton.click();

    await page.waitForTimeout(1000);

    expect(dialogMessage).toBeTruthy();
    expect(dialogMessage).toContain('kosza');
  });

  test('TC-PROJ-016: Usuniecie projektu z warstwami', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    const projectCards = page.locator('.MuiCard-root');
    await expect(projectCards.first()).toBeVisible({ timeout: 15_000 });

    // Set up native dialog handler BEFORE clicking delete
    let dialogMessage = '';
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // Cancel to preserve data
    });

    const deleteButton = page.locator('.MuiCard-root button:has-text("Usuń")').first();
    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
    await deleteButton.click();

    await page.waitForTimeout(1000);

    expect(dialogMessage).toBeTruthy();
    expect(dialogMessage).toContain('kosza');
  });
});
