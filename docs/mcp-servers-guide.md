# Serwery MCP - Przewodnik dla Agent Testera

## 5 Najwazniejszych serwerow MCP

### 1. Playwright MCP (testowanie UI)

**Do czego:** Interakcja z przegladarka - klikanie, wpisywanie, nawigacja, screenshoty.
To GLOWNE narzedzie testera.

**Konfiguracja (.mcp.json):**
```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest", "--cdp-endpoint", "http://localhost:9222"]
  }
}
```

**Wymaganie:** Chrome musi byc uruchomiony z `--remote-debugging-port=9222`

**Narzedzia (26):**
| Narzedzie | Opis |
|-----------|------|
| `browser_navigate` | Nawigacja do URL |
| `browser_snapshot` | Pobranie drzewa DOM (do identyfikacji elementow) |
| `browser_click` | Klikniecie elementu (ref z snapshot) |
| `browser_type` | Wpisanie tekstu |
| `browser_fill_form` | Wypelnienie formularza |
| `browser_press_key` | Wcisniecie klawisza (Enter, Tab, Escape) |
| `browser_take_screenshot` | Screenshot strony/elementu |
| `browser_wait_for` | Czekanie na element/URL/tekst |
| `browser_hover` | Najechanie na element |
| `browser_select_option` | Wybranie opcji z dropdown |
| `browser_navigate_back` | Powrot do poprzedniej strony |
| `browser_tabs` | Lista otwartych zakladek |
| `browser_console_messages` | Logi z konsoli przegladarki |
| `browser_network_requests` | Requesty sieciowe |
| `browser_run_code` | Wykonanie JS w konsoli |
| `browser_evaluate` | Ewaluacja JS i zwrot wyniku |
| `browser_drag` | Przeciaganie elementu |
| `browser_file_upload` | Upload pliku |
| `browser_handle_dialog` | Obsluga alert/confirm/prompt |
| `browser_resize` | Zmiana rozmiaru okna |
| `browser_close` | Zamkniecie przegladarki |

**Przyklad uzycia w tescie:**
```
1. browser_navigate -> http://localhost:3000
2. browser_snapshot -> identyfikacja elementow
3. browser_click ref="e5" -> klikniecie przycisku logowania
4. browser_type ref="e10" text="user@email.com"
5. browser_press_key key="Enter"
6. browser_wait_for text="Dashboard"
7. browser_take_screenshot filename="after-login.png"
```

---

### 2. Google Sheets MCP (zapis wynikow)

**Do czego:** Odczyt/zapis danych z/do Google Sheets BEZ otwierania arkusza w przegladarce.
Uzywany do zapisywania wynikow testow i odczytu listy testow.

**Konfiguracja (.mcp.json):**
```json
{
  "google-sheets": {
    "command": "npx",
    "args": ["-y", "mcp-gsheets"],
    "env": {
      "GOOGLE_APPLICATION_CREDENTIALS": "C:\\Users\\Dom\\.claude\\agents\\tester\\config\\sheets-service-account.json"
    }
  }
}
```

**Wymaganie:** Plik `sheets-service-account.json` z kluczem konta serwisowego Google.
Arkusz musi miec udostepnienie dla emaila z service account.

**Narzedzia (kluczowe):**
| Narzedzie | Opis |
|-----------|------|
| `sheets_get_values` | Pobranie wartosci z zakresu (np. A1:I200) |
| `sheets_update_values` | Zapis do zakresu (np. wynik testu do G5:I5) |
| `sheets_batch_update_values` | Zapis wielu zakresow naraz (batch wynikow) |
| `sheets_batch_get_values` | Pobranie wielu zakresow naraz |
| `sheets_get_metadata` | Metadane arkusza (nazwy zakladek, wymiary) |
| `sheets_append_values` | Dodanie wiersza na koncu |
| `sheets_format_cells` | Formatowanie komorek (kolory, czcionki) |
| `sheets_batch_format_cells` | Formatowanie wielu zakresow |

**Przyklad zapisu wyniku testu:**
```
sheets_update_values({
  spreadsheetId: "1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA",
  range: "Arkusz1!G5:I5",
  values: [["PASSED", "[Coded] Logowanie poprawne", "2026-02-26 12:00"]],
  valueInputOption: "USER_ENTERED"
})
```

**Struktura arkusza Testy_Lista:**
| Kol | Zawartosc | Kto wypelnia |
|-----|-----------|--------------|
| A | ID (TC-LOGIN-001) | Gabrysia |
| B | Kategoria | Gabrysia |
| C | Nazwa testu | Gabrysia |
| D | Kroki | Gabrysia |
| E | Wymogi | Gabrysia |
| F | Oczekiwany rezultat | Gabrysia |
| G | Status (PASSED/FAILED/BLOCKED) | **Agent** |
| H | Wynik ([Coded]/[LLM]/[Learned] + opis) | **Agent** |
| I | Data testu (YYYY-MM-DD HH:MM) | **Agent** |

---

### 3. Context7 MCP (dokumentacja bibliotek)

**Do czego:** Pobieranie aktualnej dokumentacji dowolnej biblioteki (React, MUI, Playwright, Mapbox...).
Przydatne gdy agent nie wie jak uzyc API danej biblioteki.

**Konfiguracja (.mcp.json):**
```json
{
  "context7": {
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp"]
  }
}
```

**Narzedzia (2):**
| Narzedzie | Opis |
|-----------|------|
| `resolve-library-id` | Znajdz ID biblioteki (np. "playwright" -> "/playwright/playwright") |
| `query-docs` | Pobierz dokumentacje dla zapytania (np. "how to click element") |

**Przyklad:**
```
1. resolve-library-id("playwright") -> "/playwright/playwright"
2. query-docs(libraryId="/playwright/playwright", query="locator click", tokens=5000)
   -> zwraca aktualna dokumentacje z przykladami
```

---

### 4. TypeScript MCP (analiza kodu)

**Do czego:** Statyczna analiza kodu TypeScript - znajdowanie definicji, referencji, typow.
Przydatne do rozumienia kodu aplikacji podczas testowania.

**Konfiguracja (.mcp.json):**
```json
{
  "typescript": {
    "command": "npx",
    "args": ["-y", "typescript-mcp"]
  }
}
```

**Narzedzia (kluczowe):**
| Narzedzie | Opis |
|-----------|------|
| `get_definitions` | Znajdz definicje symbolu (funkcji, klasy) |
| `find_references` | Znajdz wszystkie uzycia symbolu |
| `get_type_at_symbol` | Typ zmiennej/parametru |
| `get_module_symbols` | Lista eksportow z modulu |
| `get_diagnostics` | Bledy TypeScript w pliku |
| `rename_symbol` | Zmiana nazwy symbolu (refactoring) |

**Przyklad:**
```
get_definitions("MapComponent") -> src/components/Map/MapComponent.tsx:15
find_references("useMapStore") -> [5 plikow uzywajacych tego hooka]
```

---

### 5. Vitest MCP (testy jednostkowe)

**Do czego:** Uruchamianie testow jednostkowych Vitest, analiza pokrycia kodu.
Uzupelnienie do Playwright (ktory robi E2E).

**Konfiguracja (.mcp.json):**
```json
{
  "vitest": {
    "command": "npx",
    "args": ["-y", "@djankies/vitest-mcp"]
  }
}
```

**Narzedzia (4):**
| Narzedzie | Opis |
|-----------|------|
| `run_tests` | Uruchom testy (z filtrami) |
| `list_tests` | Lista dostepnych testow |
| `analyze_coverage` | Analiza pokrycia kodu |
| `set_project_root` | Ustaw sciezke projektu |

---

## Dodatkowe serwery MCP (opcjonalne)

| Serwer | Do czego | Paczka npm |
|--------|----------|------------|
| **ESLint** | Linting plikow JS/TS | wbudowany w Claude Code |
| **MDN** | Dokumentacja HTML/CSS/JS | wbudowany w Claude Code |
| **MUI** | Dokumentacja Material UI | wbudowany w Claude Code |
| **Asana** | Zarzadzanie zadaniami | `mcp.asana.com/sse` |
| **Firebase** | Hosting, auth | marketplace plugin |
| **GitHub** | Operacje na repo | marketplace plugin |

---

## Konfiguracja MCP dla Agent Testera

Agent tester uzywa MCP serwerow zdefiniowanych w **dwoch miejscach**:

1. **AGENT.md** (frontmatter `tools:`) - lista dostepnych narzedzi MCP
2. **Pliki .mcp.json** - konfiguracja polaczenia z serwerami

### Gdzie sa pliki .mcp.json:

```
C:\Users\Dom\AppData\Local\Google Cloud SDK\.mcp.json     <- Google Sheets MCP
C:\Users\Dom\MUIFrontend\.mcp.json                        <- Vitest + Google Sheets
C:\Users\Dom\.claude\plugins\...\playwright\.mcp.json     <- Playwright MCP
C:\Users\Dom\.claude\plugins\...\context7\.mcp.json       <- Context7 MCP
```

### Hierarchia priorytetow MCP w agenie testerze:

```
1. Playwright MCP  - ZAWSZE (interakcja z UI)
2. GSheets MCP     - ZAWSZE (zapis wynikow)
3. Context7        - OPCJONALNIE (gdy potrzebna dokumentacja)
4. TypeScript      - OPCJONALNIE (gdy analiza kodu)
5. Vitest          - OPCJONALNIE (gdy testy jednostkowe)
```
