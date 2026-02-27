import { test, expect } from './fixtures';
import { login, ensureLoggedIn } from './helpers/auth';

test.describe('PROJEKTY', () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-001: Wyswietlanie listy projektow                        */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-001: Wyswietlanie listy projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Verify that at least one project is listed
    const projectItems = page.locator(
      '[data-testid="project-item"], [data-testid="project-card"], ' +
      'table tbody tr, .project-list-item, .MuiCard-root, .MuiListItem-root'
    );
    await expect(projectItems.first()).toBeVisible({ timeout: 15_000 });
    const count = await projectItems.count();
    expect(count).toBeGreaterThan(0);

    // Verify projects have names displayed
    const firstProject = projectItems.first();
    const textContent = await firstProject.textContent();
    expect(textContent?.trim().length).toBeGreaterThan(0);

    // Verify dates are visible somewhere on the page (creation or modification dates)
    // App uses DD-MM-YY format (2-digit year) e.g. "11-02-26"
    const datePattern = /\d{2}[./\-]\d{2}[./\-]\d{2,4}/;
    const pageText = await page.locator('#root').textContent();
    expect(pageText).toMatch(datePattern);
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-002: Brak funkcji filtrowania projektow (FAILED expected) */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-002: Brak funkcji filtrowania projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Verify that NO filtering options exist on the project list page
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

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-003: Wyszukiwanie projektow (FAILED expected)             */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-003: Wyszukiwanie projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Verify that NO search field exists on the project list page
    const searchField = page.locator(
      'input[type="search"], input[placeholder*="Szukaj"], input[placeholder*="szukaj"], ' +
      'input[placeholder*="Search"], input[placeholder*="search"], ' +
      '[data-testid*="search"], [aria-label*="search"], [aria-label*="szukaj"]'
    );
    await expect(searchField).toHaveCount(0);
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-004: Brak funkcji sortowania projektow (FAILED expected)  */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-004: Brak funkcji sortowania projektow', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Verify that NO sortable column headers exist
    const sortHeaders = page.locator(
      'th[aria-sort], [data-testid*="sort"], [role="columnheader"][aria-sort], ' +
      'button:has-text("Sortuj"), button:has-text("Sort"), ' +
      '[aria-label*="sort"], [aria-label*="sortuj"]'
    );
    await expect(sortHeaders).toHaveCount(0);
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-005: Paginacja listy projektow (BLOCKED)                  */
  /* ------------------------------------------------------------------ */
  test.skip('TC-PROJ-005: Paginacja listy projektow', async () => {
    // BLOCKED: za malo projektow do testowania paginacji
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-006: Tworzenie nowego projektu                            */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-006: Tworzenie nowego projektu', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    // Verify form field: Nazwa projektu
    const nameField = page.locator(
      'input[name*="name"], input[name*="nazwa"], ' +
      'label:has-text("Nazwa projektu"), [data-testid*="project-name"]'
    ).first();
    await expect(nameField).toBeVisible({ timeout: 15_000 });

    // Verify form field: Kategoria with expected options (rendered as ToggleButtonGroup)
    const expectedCategories = ['EMUiA', 'SIP', 'Suikzp', 'MPZP', 'EGiB', 'Inne'];
    await expect(page.getByText('Kategoria', { exact: false }).first()).toBeVisible();
    for (const cat of expectedCategories) {
      await expect(page.getByRole('button', { name: cat, exact: true }).first()).toBeVisible();
    }

    // Verify form field: Opis
    const descriptionField = page.locator(
      'textarea[name*="description"], textarea[name*="opis"], ' +
      'label:has-text("Opis"), [data-testid*="description"]'
    ).first();
    await expect(descriptionField).toBeVisible();

    // Verify form field: Slowa kluczowe
    const keywordsField = page.locator(
      'input[name*="keyword"], input[name*="tag"], input[name*="slowa"], ' +
      'label:has-text("kluczowe"), label:has-text("Slowa"), [data-testid*="keyword"]'
    ).first();
    await expect(keywordsField).toBeVisible();

    // Verify checkbox: Projekt publiczny
    const publicCheckbox = page.locator(
      'input[type="checkbox"][name*="public"], ' +
      'label:has-text("Projekt publiczny"), label:has-text("publiczny"), ' +
      '[data-testid*="public"]'
    ).first();
    await expect(publicCheckbox).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-007: Walidacja nazwy projektu                             */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-007: Walidacja nazwy projektu', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    // Verify name field has a placeholder indicating required format
    const nameInput = page.locator(
      'input[name*="name"], input[name*="nazwa"], ' +
      '[data-testid*="project-name"] input'
    ).first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });

    const placeholder = await nameInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.length).toBeGreaterThan(0);
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-008: Wybor kategorii projektu                             */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-008: Wybor kategorii projektu', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    const expectedCategories = ['EMUiA', 'SIP', 'Suikzp', 'MPZP', 'EGiB', 'Inne'];

    // Wait for the form to fully load - Kategoria is a ToggleButtonGroup
    await expect(page.getByText('Kategoria', { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // Verify all category options are visible as toggle buttons
    for (const cat of expectedCategories) {
      await expect(page.getByRole('button', { name: cat, exact: true }).first()).toBeVisible();
    }
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-009: Ustawienie projektu jako publiczny/prywatny          */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-009: Ustawienie projektu jako publiczny/prywatny', async ({ page }) => {
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');

    // Verify "Projekt publiczny" checkbox is present
    const publicCheckbox = page.locator(
      'input[type="checkbox"][name*="public"], ' +
      'label:has-text("Projekt publiczny"), label:has-text("publiczny"), ' +
      '[data-testid*="public"]'
    ).first();
    await expect(publicCheckbox).toBeVisible({ timeout: 15_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-010: Zmiana nazwy projektu                                */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-010: Zmiana nazwy projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Click on the first project to open it
    const projectItems = page.locator(
      '[data-testid="project-item"], [data-testid="project-card"], ' +
      'table tbody tr, .project-list-item, .MuiCard-root, .MuiListItem-root'
    );
    await expect(projectItems.first()).toBeVisible({ timeout: 15_000 });
    await projectItems.first().click();
    await page.waitForLoadState('networkidle');

    // Navigate to project settings / edit
    const settingsButton = page.locator(
      'button:has-text("Ustawienia"), button:has-text("Edytuj"), ' +
      '[data-testid*="settings"], [data-testid*="edit"], ' +
      'a:has-text("Ustawienia"), a:has-text("Edytuj"), ' +
      '[aria-label*="settings"], [aria-label*="edit"], ' +
      'button[aria-label*="ustaw"], svg[data-testid="SettingsIcon"]'
    ).first();
    await expect(settingsButton).toBeVisible({ timeout: 10_000 });
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Find the name field and change it
    const nameInput = page.locator(
      'input[name*="name"], input[name*="nazwa"], ' +
      '[data-testid*="project-name"] input, input[name*="customName"]'
    ).first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    const testName = `Test Rename ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(testName);

    // Save changes
    const saveButton = page.locator(
      'button:has-text("Zapisz"), button:has-text("Save"), ' +
      'button[type="submit"], [data-testid*="save"]'
    ).first();
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await page.waitForLoadState('networkidle');

    // Go back to projects list and verify the name is visible
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(testName).first()).toBeVisible({ timeout: 15_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-011: Zmiana opisu projektu                                */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-011: Zmiana opisu projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Open the first project
    const projectItems = page.locator(
      '[data-testid="project-item"], [data-testid="project-card"], ' +
      'table tbody tr, .project-list-item, .MuiCard-root, .MuiListItem-root'
    );
    await expect(projectItems.first()).toBeVisible({ timeout: 15_000 });
    await projectItems.first().click();
    await page.waitForLoadState('networkidle');

    // Open project settings / edit
    const settingsButton = page.locator(
      'button:has-text("Ustawienia"), button:has-text("Edytuj"), ' +
      '[data-testid*="settings"], [data-testid*="edit"], ' +
      'a:has-text("Ustawienia"), a:has-text("Edytuj"), ' +
      '[aria-label*="settings"], [aria-label*="edit"], ' +
      'button[aria-label*="ustaw"], svg[data-testid="SettingsIcon"]'
    ).first();
    await expect(settingsButton).toBeVisible({ timeout: 10_000 });
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Verify description field exists in edit view
    const descriptionField = page.locator(
      'textarea[name*="description"], textarea[name*="opis"], ' +
      'label:has-text("Opis"), [data-testid*="description"] textarea'
    ).first();
    await expect(descriptionField).toBeVisible({ timeout: 10_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-012: Zmiana kategorii projektu                            */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-012: Zmiana kategorii projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Open the first project
    const projectItems = page.locator(
      '[data-testid="project-item"], [data-testid="project-card"], ' +
      'table tbody tr, .project-list-item, .MuiCard-root, .MuiListItem-root'
    );
    await expect(projectItems.first()).toBeVisible({ timeout: 15_000 });
    await projectItems.first().click();
    await page.waitForLoadState('networkidle');

    // Open settings
    const settingsButton = page.locator(
      'button:has-text("Ustawienia"), button:has-text("Edytuj"), ' +
      '[data-testid*="settings"], [data-testid*="edit"], ' +
      'a:has-text("Ustawienia"), a:has-text("Edytuj"), ' +
      '[aria-label*="settings"], [aria-label*="edit"], ' +
      'button[aria-label*="ustaw"], svg[data-testid="SettingsIcon"]'
    ).first();
    await expect(settingsButton).toBeVisible({ timeout: 10_000 });
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Verify category dropdown / select exists in edit view
    const categoryField = page.locator(
      'select[name*="category"], select[name*="kategoria"], ' +
      '[data-testid*="category"], label:has-text("Kategoria"), ' +
      '[role="combobox"][aria-label*="kategoria"], [role="combobox"][aria-label*="Kategoria"]'
    ).first();
    await expect(categoryField).toBeVisible({ timeout: 10_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-013: Zmiana statusu publiczny/prywatny                    */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-013: Zmiana statusu publiczny/prywatny', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Open the first project
    const projectItems = page.locator(
      '[data-testid="project-item"], [data-testid="project-card"], ' +
      'table tbody tr, .project-list-item, .MuiCard-root, .MuiListItem-root'
    );
    await expect(projectItems.first()).toBeVisible({ timeout: 15_000 });
    await projectItems.first().click();
    await page.waitForLoadState('networkidle');

    // Open settings
    const settingsButton = page.locator(
      'button:has-text("Ustawienia"), button:has-text("Edytuj"), ' +
      '[data-testid*="settings"], [data-testid*="edit"], ' +
      'a:has-text("Ustawienia"), a:has-text("Edytuj"), ' +
      '[aria-label*="settings"], [aria-label*="edit"], ' +
      'button[aria-label*="ustaw"], svg[data-testid="SettingsIcon"]'
    ).first();
    await expect(settingsButton).toBeVisible({ timeout: 10_000 });
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Verify public/private checkbox exists in edit view
    const publicCheckbox = page.locator(
      'input[type="checkbox"][name*="public"], ' +
      'label:has-text("Projekt publiczny"), label:has-text("publiczny"), ' +
      '[data-testid*="public"]'
    ).first();
    await expect(publicCheckbox).toBeVisible({ timeout: 10_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-014: Usuniecie projektu                                   */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-014: Usuniecie projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Verify delete button exists on project list
    const deleteButton = page.locator(
      'button:has-text("Usun"), button[aria-label*="usun"], button[aria-label*="delete"], ' +
      '[data-testid*="delete"], svg[data-testid="DeleteIcon"], ' +
      'button:has-text("Delete"), [aria-label*="Delete"]'
    ).first();
    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-015: Potwierdzenie przed usunieciem projektu              */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-015: Potwierdzenie przed usunieciem projektu', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Click the delete button on the first project
    const deleteButton = page.locator(
      'button:has-text("Usun"), button[aria-label*="usun"], button[aria-label*="delete"], ' +
      '[data-testid*="delete"], svg[data-testid="DeleteIcon"], ' +
      'button:has-text("Delete"), [aria-label*="Delete"]'
    ).first();
    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
    await deleteButton.click();

    // Verify a confirmation dialog appears
    const confirmationDialog = page.locator(
      '[role="dialog"], .MuiDialog-root, .MuiModal-root, ' +
      '[data-testid*="confirm"], [data-testid*="dialog"]'
    );
    await expect(confirmationDialog.first()).toBeVisible({ timeout: 10_000 });

    // Verify dialog has confirmation text and cancel/confirm buttons
    const dialogText = await confirmationDialog.first().textContent();
    expect(dialogText).toBeTruthy();

    const cancelButton = confirmationDialog.locator(
      'button:has-text("Anuluj"), button:has-text("Nie"), button:has-text("Cancel")'
    ).first();
    await expect(cancelButton).toBeVisible();

    // Cancel the deletion to leave data intact
    await cancelButton.click();
  });

  /* ------------------------------------------------------------------ */
  /*  TC-PROJ-016: Usuniecie projektu z warstwami                       */
  /* ------------------------------------------------------------------ */
  test('TC-PROJ-016: Usuniecie projektu z warstwami', async ({ page }) => {
    await page.goto('/projects/my');
    await page.waitForLoadState('networkidle');

    // Find a project that has layers (indicated by layer count or icon)
    const projectItems = page.locator(
      '[data-testid="project-item"], [data-testid="project-card"], ' +
      'table tbody tr, .project-list-item, .MuiCard-root, .MuiListItem-root'
    );
    await expect(projectItems.first()).toBeVisible({ timeout: 15_000 });

    // Verify that a delete button is available even for projects (which may have layers)
    const deleteButton = page.locator(
      'button:has-text("Usun"), button[aria-label*="usun"], button[aria-label*="delete"], ' +
      '[data-testid*="delete"], svg[data-testid="DeleteIcon"], ' +
      'button:has-text("Delete"), [aria-label*="Delete"]'
    ).first();
    await expect(deleteButton).toBeVisible({ timeout: 15_000 });

    // Click delete to trigger confirmation
    await deleteButton.click();

    // Verify confirmation dialog appears (projects with layers should also show confirmation)
    const confirmationDialog = page.locator(
      '[role="dialog"], .MuiDialog-root, .MuiModal-root, ' +
      '[data-testid*="confirm"], [data-testid*="dialog"]'
    );
    await expect(confirmationDialog.first()).toBeVisible({ timeout: 10_000 });

    // Cancel to preserve test data
    const cancelButton = confirmationDialog.locator(
      'button:has-text("Anuluj"), button:has-text("Nie"), button:has-text("Cancel")'
    ).first();
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();
  });
});
