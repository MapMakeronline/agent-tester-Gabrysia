# Konfiguracja Google Apps Script

## Instrukcja (jednorazowa konfiguracja)

1. Otwórz arkusz Google Sheets z testami
2. Kliknij **Rozszerzenia** > **Apps Script**
3. Usuń zawartość i wklej kod z pliku `apps-script-code.gs`
4. Kliknij **Wdróż** > **Nowe wdrożenie**
5. Wybierz typ: **Aplikacja internetowa**
6. Ustaw:
   - Opis: "Test Results API"
   - Wykonaj jako: **Ja**
   - Kto ma dostęp: **Każdy**
7. Kliknij **Wdróż**
8. Skopiuj URL wdrożenia (zaczyna się od https://script.google.com/...)
9. Wklej URL do pliku `webhook-config.json` w tym folderze

## Testowanie

Po konfiguracji, agent automatycznie zapisze wyniki testów do kolumn:
- Status (np. PASSED/FAILED)
- Data wykonania
- Błąd (jeśli wystąpił)
