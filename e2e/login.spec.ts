import { test, expect, clearSession } from './fixtures';
import { login, ensureLoggedIn } from './helpers/auth';

const BASE_URL = 'https://universe-mapmaker.web.app';

test.describe('LOGOWANIE', () => {
  // All login tests need unauthenticated state — clear session before each
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await clearSession(page);
  });

  // TC-LOGIN-001: Logowanie poprawnymi danymi
  test('TC-LOGIN-001: Logowanie poprawnymi danymi', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill('Mestwin');
    await page.getByRole('textbox', { name: /hasło/i }).fill('Kaktus,1');
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForURL(/\/(dashboard|projects|map)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(dashboard|projects|map)/);
  });

  // TC-LOGIN-002: Logowanie błędnymi danymi
  test('TC-LOGIN-002: Logowanie błędnymi danymi', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill('WrongUser');
    await page.getByRole('textbox', { name: /hasło/i }).fill('WrongPassword123');
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  });

  // TC-LOGIN-003: Wylogowanie
  test('TC-LOGIN-003: Wylogowanie', async ({ page }) => {
    // First login, then test logout
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill('Mestwin');
    await page.getByRole('textbox', { name: /hasło/i }).fill('Kaktus,1');
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForURL(/\/(dashboard|projects|map)/, { timeout: 15_000 });

    // Click avatar to open user dropdown menu
    await page.locator('.MuiAvatar-root').last().click();
    await page.getByRole('menuitem', { name: 'Wyloguj' }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  // TC-LOGIN-004: Sesja wygasa po czasie nieaktywności
  test.skip('TC-LOGIN-004: Sesja wygasa po czasie nieaktywności', () => {
    // BLOCKED: wymaga czekania 30 minut
  });

  // TC-LOGIN-005: Przekierowanie na logowanie dla chronionych zasobów
  test('TC-LOGIN-005: Przekierowanie na logowanie dla chronionych zasobów', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  // TC-LOGIN-006: Rejestracja nowego użytkownika
  test('TC-LOGIN-006: Rejestracja nowego użytkownika', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    const ts = Date.now().toString().slice(-6);
    const username = `TestUser${ts}`;

    // Sprawdź widoczność pól
    await expect(page.getByRole('textbox', { name: 'Imię' })).toBeVisible({ timeout: 10_000 });

    // Wypełnij formularz
    await page.getByRole('textbox', { name: 'Imię' }).fill('Test');
    await page.getByRole('textbox', { name: 'Nazwisko' }).fill('User');
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill(username);
    await page.getByRole('textbox', { name: 'Email' }).fill(`${username}@test.com`);
    await page.getByRole('textbox', { name: 'Hasło', exact: true }).fill('TestPassword123!');
    await page.getByRole('textbox', { name: /potwierdź hasło/i }).fill('TestPassword123!');

    // Kliknij Utwórz konto
    await page.getByRole('button', { name: /utwórz konto/i }).click();

    // Sprawdź potwierdzenie rejestracji
    await expect(page.getByRole('heading', { name: /konto utworzone/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /przejdź do panelu/i })).toBeVisible();
  });

  // TC-LOGIN-007: Walidacja formularza rejestracji
  test('TC-LOGIN-007: Walidacja formularza rejestracji', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await expect(page.getByRole('button', { name: /utwórz konto/i })).toBeVisible({ timeout: 10_000 });

    // Scenariusz 1: Puste wymagane pola - native HTML5 validation blokuje submit
    await page.getByRole('button', { name: /utwórz konto/i }).click();
    // Formularz nie powinien przejść dalej - nadal na /register
    expect(page.url()).toContain('/register');

    // Scenariusz 2: Różne hasła - custom walidacja aplikacji
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill('TestValidation');
    await page.getByRole('textbox', { name: 'Email' }).fill('test@test.com');
    await page.getByRole('textbox', { name: 'Hasło', exact: true }).fill('Password123');
    await page.getByRole('textbox', { name: /potwierdź hasło/i }).fill('DifferentPassword456');
    await page.getByRole('button', { name: /utwórz konto/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/hasła nie pasują/i)).toBeVisible();
  });

  // TC-LOGIN-008: Redirect podczas rejestracji
  test('TC-LOGIN-008: Redirect podczas rejestracji', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.waitForURL(/\/register/, { timeout: 10_000 });
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill('TestUser123');
    await page.waitForTimeout(2_000);
    expect(page.url()).toContain('/register');
  });

  // TC-LOGIN-009: Zmiana hasła użytkownika
  test('TC-LOGIN-009: Zmiana hasła użytkownika', async ({ page }) => {
    // Logowanie jako tester
    await page.goto(`${BASE_URL}/login`);
    await page.getByRole('textbox', { name: /nazwa użytkownika/i }).fill('tester');
    await page.getByRole('textbox', { name: /hasło/i }).fill('testowanie');
    await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForURL(/\/(dashboard|projects|map)/, { timeout: 15_000 });

    // Nawiguj do ustawień
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.getByRole('heading', { name: 'Zmień hasło' })).toBeVisible({ timeout: 10_000 });

    // Zmień hasło na tymczasowe
    await page.getByRole('textbox', { name: 'Aktualne hasło' }).fill('testowanie');
    await page.getByRole('textbox', { name: 'Nowe hasło' }).fill('testowanie2');
    await page.getByRole('textbox', { name: 'Potwierdź hasło' }).fill('testowanie2');
    await page.getByRole('button', { name: 'Zmień hasło' }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/hasło zostało pomyślnie zmienione/i)).toBeVisible();

    // Przywróć oryginalne hasło (cleanup)
    await page.getByRole('textbox', { name: 'Aktualne hasło' }).fill('testowanie2');
    await page.getByRole('textbox', { name: 'Nowe hasło' }).fill('testowanie');
    await page.getByRole('textbox', { name: 'Potwierdź hasło' }).fill('testowanie');
    await page.getByRole('button', { name: 'Zmień hasło' }).click();
    await expect(page.getByText(/hasło zostało pomyślnie zmienione/i)).toBeVisible({ timeout: 10_000 });
  });
});
