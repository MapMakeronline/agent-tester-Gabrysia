# Agent Tester - Dokumentacja
## Universe MapMaker Testing Agent
### Ostatnia aktualizacja: 2026-02-26 (v4)

---

## 1. Czym jest Agent Tester

Autonomiczny agent testowy dla Universe MapMaker. Pobiera testy z Google Sheets,
wykonuje je w przegladarce przez Playwright, wyniki zapisuje do arkusza (MCP) i na dashboard.

- **Model:** Sonnet (szybki, tani)
- **Tryb uprawnien:** bypassPermissions (pelna autonomia)
- **Hook:** SubagentStop -> stop-monitor.js
- **Min turnow:** 200

---

## 2. Testowana aplikacja

| Parametr | Wartosc |
|----------|---------|
| URL | https://universe-mapmaker.web.app |
| Login | Mestwin |
| Haslo | Kaktus,1 |
| Konto Google | contact@mapmaker.online |
| Haslo Google | ZnakiSpecjalne!2#4 |

---

## 3. Zrodlo testow - Google Sheets

| Parametr | Wartosc |
|----------|---------|
| Arkusz | Testy_Lista |
| Sheet ID | 1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA |

Struktura kolumn:

| Kol | Zawartosc | Kto wypelnia |
|-----|-----------|--------------|
| A | ID (TC-LOGIN-001) | Gabrysia |
| B | Kategoria | Gabrysia |
| C | Nazwa testu | Gabrysia |
| D | Kroki (numerowane, jezyk naturalny) | Gabrysia |
| E | Wymogi | Gabrysia |
| F | Oczekiwany rezultat | Gabrysia |
| G | Status (PASSED/FAILED/BLOCKED) | **Agent** |
| H | Wynik ([Coded]/[LLM]/[Learned] + opis) | **Agent** |
| I | Data testu (YYYY-MM-DD HH:MM) | **Agent** |

Wiersz 1 = naglowek, dane od wiersza 2.

---

## 4. Przegladarka: Chrome Debug (port 9222)

Agent uzywa prawdziwego Chrome podlaczonego przez CDP (Chrome DevTools Protocol).

- Sesja logowania persystuje miedzy testami
- Uzytkownik widzi testy na zywo
- Google Sheets NIE potrzebny w przegladarce (wyniki przez MCP)
- Auto-start przez test-pipeline.js / init-session.js
- Fallback: recznie uruchom Chrome z --remote-debugging-port=9222

Wyjatki logowania:
- Testy TC-LOGIN-*: agent WYLOGOWUJE sie przed testem
- Inne testy: sesja persystuje

---

## 5. Narzedzia MCP

### Playwright MCP (interakcja z Chrome)
| Narzedzie | Opis |
|-----------|------|
| browser_navigate | Nawigacja do URL |
| browser_snapshot | Odczyt drzewa DOM |
| browser_click | Klikniecie elementu |
| browser_type | Wpisanie tekstu |
| browser_fill_form | Wypelnienie formularza |
| browser_press_key | Wcisniecie klawisza |
| browser_take_screenshot | Screenshot |
| browser_wait_for | Czekanie na element/tekst |
| browser_hover | Najechanie na element |
| browser_select_option | Wybranie z dropdown |
| browser_navigate_back | Powrot |
| browser_tabs | Lista zakladek |
| browser_console_messages | Logi konsoli |
| browser_network_requests | Requesty sieciowe |
| browser_run_code | Wykonanie JS |
| browser_evaluate | Ewaluacja JS |
| browser_drag | Przeciaganie |
| browser_file_upload | Upload pliku |
| browser_handle_dialog | Alert/confirm/prompt |
| browser_resize | Zmiana rozmiaru |
| browser_close | Zamkniecie |

### Google Sheets MCP (zapis wynikow - NOWY od v4)
| Narzedzie | Opis |
|-----------|------|
| sheets_get_values | Odczyt zakresu |
| sheets_update_values | Zapis do zakresu (wynik testu) |
| sheets_batch_update_values | Batch zapis (po pipeline) |
| sheets_batch_get_values | Batch odczyt |
| sheets_get_metadata | Metadane arkusza |
| sheets_format_cells | Formatowanie |

Przyklad zapisu wyniku:
```
mcp__gsheets__sheets_update_values({
  spreadsheetId: "1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA",
  range: "Arkusz1!G5:I5",
  values: [["PASSED", "[Coded] Logowanie poprawne", "2026-02-26 12:00"]],
  valueInputOption: "USER_ENTERED"
})
```

### Inne narzedzia
- Read, Write, Glob, Grep - operacje plikowe
- Bash - komendy systemowe (node, npx playwright test)
- AskUserQuestion - pytania do uzytkownika

Pelny przewodnik MCP: [mcp-servers-guide.md](./mcp-servers-guide.md)

---

## 6. Schemat dzialania - HYBRYDOWY PIPELINE (od v4)

```
Uzytkownik klika "Start" w monitorze (localhost:8081)
        |
        v
 +------------------------------+
 |  FAZA 1: test-pipeline.js    |  ~45s dla 133 testow
 |  (Node.js, bez AI)           |
 |                              |
 |  1. Pobiera testy z GSheets  |
 |     (CSV przez HTTP)         |
 |  2. Skanuje pliki .spec.ts   |
 |  3. Uruchamia Playwright     |
 |     batch (wszystkie coded)  |
 |  4. Zapisuje wyniki do       |
 |     GSheets (Apps Script)    |
 |  5. Generuje remaining-      |
 |     tests.json (co zostalo)  |
 +----------+-------------------+
            |
     Czy sa remaining tests?
     /              \
   NIE              TAK
    |                |
  KONIEC    +--------v-----------+
            |  FAZA 2: auto-     |  ~60-180s per test
            |  tester.js (LLM)   |
            |                    |
            |  Per test:         |
            |  - LEARNED: JSON   |
            |    procedury       |
            |  - NLP: AI czyta   |
            |    kroki, klika    |
            |  Wyniki -> GSheets |
            |  (MCP, nie browser)|
            +--------------------+
```

### Stary model (unified orchestrator, v3)
Agent LLM orkiestrowal WSZYSTKIE testy po kolei (coded + NLP).
Problem: coded testy pojedynczo (~4s overhead per test).

### Nowy model (pipeline + LLM, v4)
Faza 1 (pipeline): batch ALL coded w ~45s.
Faza 2 (LLM): TYLKO remaining (learned + NLP).
Zysk: ~9 min szybciej, wyniki coded natychmiast.

---

## 7. Trzy metody testowania

### 1. CODED (batch przez pipeline, ~0.3s/test)
- **Warunek:** scan-specs.js znalazl TC-ID w *.spec.ts z isSkipped=false
- **Wykonanie:** test-pipeline.js (batch) lub fallback: npx playwright test --grep
- **Wynik z:** pw-coded-results.json (sheets-reporter.ts)
- **Badge:** [Coded] zielony, source: "playwright-coded"
- **Ilosc:** 133 testow

### 2. LEARNED (~15-30s, ~5 turnow)
- **Warunek:** istnieje learned-procedures/{TC-ID}.json
- **Wykonanie:** Playwright MCP z selektorami z JSON
- **Selektory:** role+name > aria-label > placeholder > testid > text > css-id
- **Fallback:** jesli selektor nie pasuje -> NLP na opisie kroku
- **Badge:** [Learned] fioletowy, source: "llm-learned"
- **Ilosc:** 2 procedury (TC-LOGIN-001, TC-TABLE-006)

### 3. NLP (~60-180s, ~15 turnow)
- **Warunek:** brak coded ani learned
- **Wykonanie:** Playwright MCP z tlumaczeniem krokow z arkusza
- **Schemat:** snapshot -> identyfikacja elementu -> akcja -> weryfikacja
- **Badge:** [LLM] niebieski, source: "llm-agent"
- **Ilosc:** ~47 testow

---

## 8. Zapis wynikow - GSheets MCP (od v4)

Zamiast nawigacji w przegladarce (Name Box -> wpisywanie w komorki):

- **Faza 1 (coded):** Apps Script API -> batch update naraz
- **Faza 2 (LLM):** mcp__gsheets__sheets_update_values -> wiersz po wierszu
- **Backup:** test-pipeline.js generuje dane MCP batch w remaining-tests.json

---

## 9. Test Monitor (localhost:8081)

Dashboard HTML odswiezany co 2s:
- Podsumowanie (passed/failed/blocked/in-progress)
- Aktywnosc agenta (co robi)
- Aktualnie testowany test (kod + nazwa + kategoria + biezaca akcja)
- Lista testow z wynikami (kliknij aby rozwinac):
  - PASSED: status, czasy, krotki opis wyniku
  - FAILED: blad + diagnostyka mozliwych przyczyn + opis
  - BLOCKED: opis przyczyny blokady
- Log zdarzen

Uruchamianie:
- `node server.js` -> http://localhost:8081
- `test-pipeline.js --monitor` -> auto-start serwera + otwarcie przegladarki

---

## 10. Kluczowe pliki

### Skrypty glowne
| Skrypt | Rola |
|--------|------|
| **test-pipeline.js** | Faza 1: batch coded + GSheets + remaining |
| **auto-tester.js** | Faza 2: LLM testy (remaining) |
| **server.js** | HTTP server monitora + orkiestrator faz |
| **init-session.js** | Fast init: Chrome + CSV + specs + queue |
| **scan-specs.js** | Skanuje specs -> JSON mapa TC-ID -> metoda |
| **session-manager.js** | Zarzadzanie sesja (start/complete/finish) |
| **save-test-result.js** | Dual write: GSheets + tests-data.js |
| **google-sheets-api.js** | Apps Script API wrapper |
| **run-hybrid.js** | Legacy orchestrator (fallback) |

### Biblioteki (lib/)
| Plik | Rola |
|------|------|
| sheets.js | Pobieranie CSV, parsowanie testow |
| csv.js | Parser CSV |
| monitor.js | Aktualizacja tests-data.js |
| log.js | Logowanie |
| spec-scanner.js | Wrapper scan-specs |

### Konfiguracja (config/)
| Plik | Rola |
|------|------|
| sheet-config.json | ID i URL arkusza |
| credentials.js | Dane logowania (WRAZLIWE) |
| sheets-service-account.json | Klucz GSheets API (WRAZLIWE) |
| apps-script-code.gs | Kod Apps Script |
| error-solutions.json | Baza rozwiazan bledow |
| known-bugs.json | Znane bugi aplikacji |

### Monitor (monitor/)
| Plik | Rola |
|------|------|
| index.html | Dashboard UI |
| tests-data.js | Dane testow (pollowane co 2s) |
| favicon.svg | Ikona |
| start-server.bat | Starter |

### Dane (data/)
| Plik | Rola |
|------|------|
| tests-queue.json | Kolejka testow z metodami |
| remaining-tests.json | Testy do LLM (po pipeline) |
| spec-map.json | Mapa TC-ID -> plik spec |
| session-state.json | Stan sesji |
| learned-procedures/*.json | Nauczone procedury |

### Pliki BAT (bin/)
| Plik | Rola |
|------|------|
| StartTester.bat | Glowny starter (port 8081) |
| start-testing.bat | Uproszczony (port 8080) |
| stop-testing.bat | Zatrzymanie |
| TestMonitor.bat | Tylko monitor |
| learn-test.bat | Nagrywanie procedur |

---

## 11. Tryb serwerowy (headless)

test-pipeline.js moze dzialac na serwerze bez GUI:
```bash
node test-pipeline.js --headless          # Wszystko
node test-pipeline.js --coded-only        # Tylko coded
node test-pipeline.js --skip-coded        # Pomija coded (remaining)
node test-pipeline.js --category=LOGIN    # Tylko kategoria
node test-pipeline.js --no-write          # Bez zapisu do GSheets
node test-pipeline.js --monitor           # Auto-start monitora
```

Dla pelnego pipeline + NLP testow na serwerze -> Claude Agent SDK z kluczem API.

---

## 12. Statusy testow

| Status | Znaczenie |
|--------|-----------|
| PASSED | Wszystkie kroki OK, oczekiwany rezultat potwierdzony |
| FAILED | Krok sie nie powiodl (+ opis bledu + diagnostyka) |
| BLOCKED | Test niemozliwy (brak funkcji, strona niedostepna, zablokowany) |

---

## 13. Statystyki (2026-02-26)

- 182 testow w arkuszu
- 133 coded (aktywnych, isSkipped=false)
- 49 stubow (test.skip) -> delegowane do LLM
- 2 nauczone procedury (TC-LOGIN-001, TC-TABLE-006)
- 11 plikow .spec.ts w MUIFrontend/e2e/
- 0 GAP, 0 ORPHAN - pelna synchronizacja sheet <-> specs
- 5 serwerow MCP (Playwright, GSheets, Context7, TypeScript, Vitest)

---

## 14. Zasady agenta

- PIPELINE FIRST: zawsze uruchamiaj test-pipeline.js przed LLM testami
- MCP DO SHEETS: wyniki przez GSheets MCP, NIE przez nawigacje w przegladarce
- Jedna karta Chrome: tylko aplikacja (GSheets niepotrzebny w przegladarce)
- Sprawdza stop signal przed kazdym testem
- Nie symuluje testow - wykonuje PRAWDZIWE akcje
- Opisuje w wynikach to co NAPRAWDE widzi
- Nie robi commitow Git
- Nie modyfikuje istniejacych projektow uzytkownika
- Zapisuje nowe bledy do error-solutions.json
- Konczy TYLKO gdy: wszystkie testy wykonane LUB stop signal
