# Agent Tester - Instalacja na nowym urządzeniu

## Wymagania wstępne

| Narzędzie | Wersja | Sprawdzenie |
|-----------|--------|-------------|
| **Claude Code** | najnowsza | `claude --version` |
| **Node.js** | >= 18 | `node --version` |
| **npm** | >= 9 | `npm --version` |
| **Git** | dowolna | `git --version` |
| **Google Chrome** | najnowsza | zainstalowany w standardowej ścieżce |
| **Google Cloud SDK** | dowolna | `gcloud --version` (opcjonalnie, do sync GCS) |

## Szybka instalacja (Windows)

```cmd
:: 1. Uruchom setup.bat z tego folderu:
setup.bat

:: 2. Po instalacji uruchom agenta:
claude
:: W Claude Code wpisz: @tester
```

## Instalacja ręczna (krok po kroku)

### KROK 1: Sklonuj repo MUIFrontend

```bash
cd C:\Users\%USERNAME%
git clone https://github.com/MapMakeronline/MUIFrontend.git
cd MUIFrontend
npm install
npx playwright install chromium
```

### KROK 2: Skopiuj pliki agenta

Skopiuj foldery z tego eksportu do odpowiednich lokalizacji:

```
agent/          ->  %USERPROFILE%\.claude\agents\tester\
plugin/agents/  ->  %USERPROFILE%\.claude\plugins\tester-agent\agents\
e2e/            ->  %USERPROFILE%\MUIFrontend\e2e\  (merge z istniejącym)
```

**Szczegółowo:**

```cmd
:: Agent (instrukcje, skrypty, monitor, config)
xcopy /E /I /Y "agent" "%USERPROFILE%\.claude\agents\tester"

:: Plugin (rejestracja agenta w Claude Code)
xcopy /E /I /Y "plugin" "%USERPROFILE%\.claude\plugins\tester-agent"

:: E2E (testy Playwright, fixtures, reporter, auth helper) - merge!
xcopy /E /I /Y "e2e\helpers" "%USERPROFILE%\MUIFrontend\e2e\helpers"
xcopy /E /I /Y "e2e\scripts" "%USERPROFILE%\MUIFrontend\e2e\scripts"
xcopy /E /I /Y "e2e\learned-procedures" "%USERPROFILE%\MUIFrontend\e2e\learned-procedures"
xcopy /E /I /Y "e2e\generated" "%USERPROFILE%\MUIFrontend\e2e\generated"
copy /Y "e2e\fixtures.ts" "%USERPROFILE%\MUIFrontend\e2e\"
copy /Y "e2e\playwright.config.ts" "%USERPROFILE%\MUIFrontend\"

:: Spec files (zakodowane testy)
for %%f in (e2e\*.spec.ts) do copy /Y "%%f" "%USERPROFILE%\MUIFrontend\e2e\"
```

### KROK 3: Zainstaluj Playwright MCP

W pliku konfiguracyjnym Claude Code (`%USERPROFILE%\.claude\plugins\` lub settings):

Upewnij się że Playwright MCP jest skonfigurowany z CDP:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright", "--cdp-endpoint", "http://localhost:9222"]
    }
  }
}
```

### KROK 4: Skonfiguruj Google Sheets webhook (opcjonalnie)

Aby agent automatycznie zapisywał wyniki do arkusza Google:

1. Otwórz arkusz Google Sheets z testami
2. Menu: Rozszerzenia > Apps Script
3. Wklej kod z `apps-script/apps-script-code.gs`
4. Kliknij "Wdróż" > "Nowe wdrożenie" > Typ: "Aplikacja internetowa"
5. Ustaw dostęp: "Każdy" (anonimowy)
6. Skopiuj URL wdrożenia
7. Wklej do `agent/config/webhook-config.json`:

```json
{
  "enabled": true,
  "webhookUrl": "https://script.google.com/macros/s/TWOJ_ID/exec"
}
```

### KROK 5: Dostosuj ścieżki (jeśli inne niż domyślne)

Jeśli MUIFrontend jest w innej lokalizacji niż `C:\Users\%USERNAME%\MUIFrontend`:

1. Uruchom `update-paths.bat` (automatyczna zamiana)
2. Lub edytuj ręcznie:
   - `agent/AGENT.md` - zmień ścieżki
   - `plugin/agents/tester.md` - zmień ścieżkę do AGENT.md
   - `e2e/helpers/sheets-reporter.ts` - zmień AGENT_ROOT
   - `e2e/helpers/auth.ts` - nie zawiera ścieżek (env variables)

### KROK 6: Ustaw konto Google (GCP)

```bash
gcloud auth login
gcloud config set project universe-mapmaker
```

Dane logowania:
- Email: contact@mapmaker.online
- Hasło: ZnakiSpecjalne!2#4
- Uwaga: Google 2FA wymagane - potwierdź na telefonie

## Uruchomienie

### Sposób 1: Przez Claude Code (zalecany)

```bash
claude
# W Claude Code:
# @tester
```

Agent sam:
- Sprawdzi czy Chrome debug działa (auto-start jeśli nie)
- Pobierze testy z arkusza
- Wykona testy po kolei
- Zapisze wyniki do arkusza i monitora

### Sposób 2: Przez monitor (dashboard)

```cmd
:: Uruchom serwer monitora
cd %USERPROFILE%\.claude\agents\tester
node scripts/server.js

:: Otwórz w przeglądarce: http://localhost:8081
:: Wklej URL arkusza -> "Rozpocznij testy"
:: Potem uruchom agenta w Claude Code
```

### Sposób 3: Tylko monitor (bez serwera)

```cmd
:: Otwórz bezpośrednio
start "" "%USERPROFILE%\.claude\agents\tester\monitor\index.html"

:: Monitor odczytuje tests-data.js co 2 sekundy
```

## Weryfikacja instalacji

Po instalacji sprawdź:

```cmd
:: 1. Czy pliki agenta istnieją
dir %USERPROFILE%\.claude\agents\tester\AGENT.md

:: 2. Czy plugin jest zarejestrowany
dir %USERPROFILE%\.claude\plugins\tester-agent\agents\tester.md

:: 3. Czy Node.js skrypty działają
node %USERPROFILE%\.claude\agents\tester\scripts\init-session.js

:: 4. Czy Playwright jest zainstalowany
cd %USERPROFILE%\MUIFrontend && npx playwright --version

:: 5. Czy spec files istnieją
dir %USERPROFILE%\MUIFrontend\e2e\*.spec.ts

:: 6. Czy helpery istnieją
dir %USERPROFILE%\MUIFrontend\e2e\helpers\auth.ts
dir %USERPROFILE%\MUIFrontend\e2e\helpers\sheets-reporter.ts
```

## Struktura plików po instalacji

```
%USERPROFILE%\
├── .claude\
│   ├── agents\tester\
│   │   ├── AGENT.md              <- Instrukcje agenta (SSOT)
│   │   ├── memory.md             <- Pamięć agenta
│   │   ├── config\               <- Konfiguracja (sheet, webhook, błędy)
│   │   ├── scripts\              <- 30+ skryptów Node.js
│   │   ├── monitor\
│   │   │   ├── index.html        <- Dashboard HTML
│   │   │   ├── tests-data.js     <- Dane dla dashboardu (auto-generowane)
│   │   │   ├── favicon.svg       <- Ikona
│   │   │   └── start-server.bat  <- Uruchom serwer standalone
│   │   ├── bin\                  <- Skrypty BAT
│   │   ├── data\                 <- Dane sesji (auto-generowane)
│   │   └── test-files\           <- Pliki testowe do importu
│   └── plugins\tester-agent\
│       └── agents\tester.md      <- Plugin wrapper
├── MUIFrontend\
│   ├── e2e\
│   │   ├── *.spec.ts             <- 11 plików z testami (133 coded + 49 stubs)
│   │   ├── fixtures.ts           <- CDP fixture
│   │   ├── helpers\
│   │   │   ├── auth.ts           <- Reusable login/logout/ensureLoggedIn
│   │   │   └── sheets-reporter.ts <- Custom Playwright reporter
│   │   ├── learned-procedures\   <- Nauczone procedury JSON (2 pliki)
│   │   ├── scripts\
│   │   │   └── generate-spec.js  <- Generator .gen.spec.ts z procedur
│   │   └── generated\            <- Auto-generated specs
│   └── playwright.config.ts      <- Config z CDP_ENDPOINT
```

## Rozwiązywanie problemów

### Chrome debug nie startuje
```cmd
:: Uruchom ręcznie:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-dev"
```

### Agent nie widzi testów
- Sprawdź `agent/config/sheet-config.json` - czy sheetId jest poprawny
- Sprawdź czy arkusz jest publiczny lub masz dostęp

### Playwright testy failują masowo
- Upewnij się że Chrome debug działa: `curl http://localhost:9222/json/version`
- Sprawdź czy `CDP_ENDPOINT` jest ustawiony w środowisku
- Upewnij się że `npm install` było uruchomione w MUIFrontend

### Monitor nie pokazuje wyników
- Sprawdź czy `monitor/tests-data.js` jest aktualizowany
- Otwórz monitor bezpośrednio (nie przez serwer) dla testu

### Testy logowania nie działają
- Sprawdź czy `auth.ts` istnieje w `e2e/helpers/`
- Credentials domyślne: Mestwin / Kaktus,1
- Można nadpisać przez env: `TEST_USER`, `TEST_PASS`
