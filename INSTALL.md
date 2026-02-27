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
:: 1. Sklonuj repo:
git clone https://github.com/gabriela-j/tester-agent.git
cd tester-agent

:: 2. Uruchom setup.bat:
setup.bat

:: 3. Po instalacji uruchom agenta:
claude
:: W Claude Code wpisz: @tester
```

## Instalacja ręczna (krok po kroku)

### KROK 1: Sklonuj oba repozytoria

```bash
cd C:\Users\%USERNAME%

# Repo z aplikacją
git clone https://github.com/MapMakeronline/MUIFrontend.git
cd MUIFrontend
npm install
npx playwright install chromium

# Repo z agentem testerem
cd ..
git clone https://github.com/gabriela-j/tester-agent.git
```

### KROK 2: Skopiuj pliki agenta do Claude Code

Skopiuj pliki z repo `tester-agent` do odpowiednich lokalizacji:

```cmd
set REPO=%USERPROFILE%\tester-agent
set AGENT_DIR=%USERPROFILE%\.claude\agents\tester
set PLUGIN_DIR=%USERPROFILE%\.claude\plugins\tester-agent\agents

:: Agent (instrukcje, skrypty, monitor, config)
xcopy /E /I /Y "%REPO%" "%AGENT_DIR%"

:: Plugin (rejestracja agenta w Claude Code - komenda @tester)
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
copy /Y "%REPO%\plugin\agents\tester.md" "%PLUGIN_DIR%\tester.md"
```

### KROK 3: Skopiuj pliki E2E do MUIFrontend

```cmd
set E2E_SRC=%REPO%\e2e
set E2E_DST=%USERPROFILE%\MUIFrontend\e2e

:: Helpers (auth + reporter)
xcopy /E /I /Y "%E2E_SRC%\helpers" "%E2E_DST%\helpers"

:: Scripts (generator spec z learned procedures)
xcopy /E /I /Y "%E2E_SRC%\scripts" "%E2E_DST%\scripts"

:: Learned procedures (nauczone procedury JSON)
xcopy /E /I /Y "%E2E_SRC%\learned-procedures" "%E2E_DST%\learned-procedures"

:: Generated specs (puste, generowane w runtime)
if not exist "%E2E_DST%\generated" mkdir "%E2E_DST%\generated"

:: Core files
copy /Y "%E2E_SRC%\fixtures.ts" "%E2E_DST%\"
copy /Y "%E2E_SRC%\playwright.config.ts" "%USERPROFILE%\MUIFrontend\"

:: Spec files (11 plików z testami)
for %%f in ("%E2E_SRC%\*.spec.ts") do copy /Y "%%f" "%E2E_DST%\"
```

### KROK 4: Skonfiguruj serwery MCP

Agent tester wymaga **2 obowiązkowych** i **3 opcjonalnych** serwerów MCP.

#### 4a. Skopiuj konfigurację MCP

Template konfiguracji znajduje się w `config/mcp-config.template.json`.
Skopiuj go jako `.mcp.json` do **dwóch** lokalizacji:

```cmd
:: Do katalogu MUIFrontend (Playwright + Vitest)
copy /Y "%REPO%\config\mcp-config.template.json" "%USERPROFILE%\MUIFrontend\.mcp.json"

:: Do katalogu roboczego Claude Code (GSheets)
copy /Y "%REPO%\config\mcp-config.template.json" "%USERPROFILE%\AppData\Local\Google Cloud SDK\.mcp.json"
```

Otwórz skopiowane pliki `.mcp.json` i dostosuj ścieżkę do `sheets-service-account.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--cdp-endpoint", "http://localhost:9222"]
    },
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "mcp-gsheets"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "C:\\Users\\TWOJ_USER\\.claude\\agents\\tester\\config\\sheets-service-account.json"
      }
    },
    "vitest": {
      "command": "npx",
      "args": ["-y", "@djankies/vitest-mcp"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "typescript": {
      "command": "npx",
      "args": ["-y", "typescript-mcp"]
    }
  }
}
```

**Serwery MCP:**

| Serwer | Rola | Wymagany? | Paczka npm |
|--------|------|-----------|------------|
| **Playwright** | Interakcja z przeglądarką (klikanie, wpisywanie, screenshoty) | **TAK** | `@playwright/mcp@latest` |
| **Google Sheets** | Odczyt/zapis wyników testów do arkusza | **TAK** | `mcp-gsheets` |
| Vitest | Testy jednostkowe | opcjonalny | `@djankies/vitest-mcp` |
| Context7 | Dokumentacja bibliotek (React, MUI, Playwright...) | opcjonalny | `@upstash/context7-mcp` |
| TypeScript | Statyczna analiza kodu TS | opcjonalny | `typescript-mcp` |

Pełna dokumentacja narzędzi MCP: patrz `docs/mcp-servers-guide.md`

#### 4b. Skonfiguruj Google Sheets service account

Agent zapisuje wyniki testów do Google Sheets przez MCP (nie przez przeglądarkę).
Wymaga pliku `sheets-service-account.json` z kluczem konta serwisowego Google.

**Jak uzyskać service account:**

1. Otwórz [Google Cloud Console](https://console.cloud.google.com/) → projekt `universe-mapmaker`
2. IAM & Admin → Service Accounts → Create Service Account
3. Nazwa: `tester-agent` → Create
4. Keys → Add Key → Create new key → JSON → Download
5. Przenieś pobrany plik jako:
   ```
   %AGENT_DIR%\config\sheets-service-account.json
   ```
6. Udostępnij arkusz Google Sheets emailowi z service account (Editor)

**Alternatywnie** - poproś Mestwina o kopię istniejącego `sheets-service-account.json`.

#### 4c. Skonfiguruj uprawnienia Claude Code

Agent wymaga uprawnień do narzędzi MCP. Skopiuj template:

```cmd
:: Podgląd wymaganych uprawnień
type "%REPO%\config\claude-settings.template.json"
```

Merge zawartość `claude-settings.template.json` z istniejącym `%USERPROFILE%\.claude\settings.local.json`.

Template zawiera uprawnienia dla:
- 21 narzędzi Playwright MCP (browser_navigate, browser_click, ...)
- 8 narzędzi Google Sheets MCP (sheets_get_values, sheets_update_values, ...)
- Bash (npx playwright, node, npm, git, gcloud)

**Jeśli nie masz jeszcze `settings.local.json`:**

```cmd
copy /Y "%REPO%\config\claude-settings.template.json" "%USERPROFILE%\.claude\settings.local.json"
```

### KROK 5: Skonfiguruj Google Sheets webhook (opcjonalnie)

Webhook to backup - agent głównie zapisuje wyniki przez MCP GSheets.
Webhook jest potrzebny tylko gdy MCP nie działa.

1. Otwórz arkusz Google Sheets z testami
2. Menu: Rozszerzenia > Apps Script
3. Wklej kod z `config/apps-script-code.gs`
4. Kliknij "Wdróż" > "Nowe wdrożenie" > Typ: "Aplikacja internetowa"
5. Ustaw dostęp: "Każdy" (anonimowy)
6. Skopiuj URL wdrożenia
7. Utwórz `config/webhook-config.json` (na bazie template):

```json
{
  "enabled": true,
  "webhookUrl": "https://script.google.com/macros/s/TWOJ_ID/exec"
}
```

### KROK 6: Dostosuj ścieżki (jeśli username != Dom)

Pliki agenta zawierają hardkodowane ścieżki `C:\Users\Dom`. Jeśli Twój username jest inny:

```cmd
:: Automatyczna zamiana:
cd %REPO%
update-paths.bat
```

Lub edytuj ręcznie:
- `AGENT.md` - ścieżki do plików agenta i MUIFrontend
- `plugin/agents/tester.md` - ścieżka do AGENT.md
- `e2e/helpers/sheets-reporter.ts` - AGENT_ROOT
- `config/mcp-config.json` - ścieżka do sheets-service-account.json

**Uwaga:** `auth.ts` nie zawiera hardkodowanych ścieżek (używa env variables).

### KROK 7: Ustaw konto Google (GCP) — opcjonalnie

Potrzebne do synchronizacji z GCS (backup zespołowy):

```bash
gcloud auth login
gcloud config set project universe-mapmaker
```

Dane logowania:
- Email: contact@mapmaker.online
- Hasło: ZnakiSpecjalne!2#4
- Uwaga: Google 2FA wymagane - potwierdź na telefonie

---

## Uruchomienie

### Sposób 1: Przez Claude Code (zalecany)

```bash
claude
# W Claude Code:
# @tester
```

Agent sam:
- Sprawdzi czy Chrome debug działa (auto-start jeśli nie)
- Uruchomi pipeline (133 coded testów w ~45s)
- Wykona remaining testy (NLP/LEARNED) przez Playwright MCP
- Zapisze wyniki do Google Sheets przez GSheets MCP + do dashboardu

### Sposób 2: Przez monitor (dashboard)

```cmd
:: Uruchom serwer monitora
cd %USERPROFILE%\.claude\agents\tester
node scripts/server.js

:: Otwórz w przeglądarce: http://localhost:8081
:: Wklej URL arkusza -> "Rozpocznij testy"
:: Potem uruchom agenta w Claude Code
```

### Sposób 3: Tylko pipeline (bez agenta)

```cmd
:: Tylko coded testy (batch, ~45s):
cd %USERPROFILE%\.claude\agents\tester
node scripts/test-pipeline.js --coded-only

:: Pełny orkiestrator (pipeline + NLP):
node scripts/run-tests.js

:: Z filtrem kategorii:
node scripts/test-pipeline.js --category=LOGIN
```

### Sposób 4: Tylko monitor (bez serwera)

```cmd
:: Otwórz bezpośrednio
start "" "%USERPROFILE%\.claude\agents\tester\monitor\index.html"

:: Monitor odczytuje tests-data.js co 2 sekundy
```

---

## Synchronizacja z GitHub + GCS

Repo jest zsynchronizowane z trzema miejscami:

| Lokalizacja | Rola |
|-------------|------|
| `~/.claude/agents/tester/` | Pliki robocze (SSOT) |
| `github.com/gabriela-j/tester-agent` | Git repo (wersjonowanie) |
| `gs://mapmaker-team-docs/claude-md/Gabrysia-md/tester-agent-config/` | GCS (backup zespołowy) |

**Jedna komenda synchronizuje wszystko:**

```bash
bash sync.sh                    # E2E + GitHub + GCS
bash sync.sh --no-gcs           # Tylko GitHub (szybciej)
bash sync.sh --gcs-only         # Tylko GCS
bash sync.sh -m "opis zmian"    # Custom commit message
```

Na Windows: kliknij `sync.bat` lub uruchom w Git Bash.

---

## Weryfikacja instalacji

Po instalacji sprawdź:

```cmd
:: 1. Czy pliki agenta istnieją
dir %USERPROFILE%\.claude\agents\tester\AGENT.md

:: 2. Czy plugin jest zarejestrowany
dir %USERPROFILE%\.claude\plugins\tester-agent\agents\tester.md

:: 3. Czy MCP config istnieje
dir %USERPROFILE%\MUIFrontend\.mcp.json

:: 4. Czy service account jest skonfigurowany
dir %USERPROFILE%\.claude\agents\tester\config\sheets-service-account.json

:: 5. Czy Node.js skrypty działają
node %USERPROFILE%\.claude\agents\tester\scripts\init-session.js

:: 6. Czy Playwright jest zainstalowany
cd %USERPROFILE%\MUIFrontend && npx playwright --version

:: 7. Czy spec files istnieją
dir %USERPROFILE%\MUIFrontend\e2e\*.spec.ts

:: 8. Czy helpery istnieją
dir %USERPROFILE%\MUIFrontend\e2e\helpers\auth.ts
dir %USERPROFILE%\MUIFrontend\e2e\helpers\sheets-reporter.ts

:: 9. Czy Chrome debug działa
curl http://localhost:9222/json/version
```

---

## Struktura plików po instalacji

```
%USERPROFILE%\
├── tester-agent\                  <- Sklonowane repo (źródło prawdy)
│   ├── AGENT.md                   <- Instrukcje agenta (SSOT)
│   ├── README.md                  <- Dokumentacja z diagramami Mermaid
│   ├── INSTALL.md                 <- Ten plik
│   ├── memory.md                  <- Pamięć agenta
│   ├── package.json               <- Zależności (playwright)
│   ├── sync.sh / sync.bat         <- Sync do GitHub + GCS
│   ├── setup.bat                  <- Automatyczny instalator
│   ├── update-paths.bat           <- Zamiana ścieżek per user
│   ├── config/
│   │   ├── mcp-config.json            <- Konfiguracja 5 serwerów MCP
│   │   ├── mcp-config.template.json   <- Template MCP (z opisami)
│   │   ├── claude-settings.template.json <- Uprawnienia Claude Code
│   │   ├── sheet-config.template.json <- Template Google Sheets ID
│   │   ├── sheets-service-account.template.json <- Template service account
│   │   ├── webhook-config.template.json <- Template webhook
│   │   ├── credentials.template.js    <- Template credentials
│   │   ├── apps-script-code.gs        <- Kod Google Apps Script
│   │   ├── apps-script-setup.md       <- Instrukcja Apps Script
│   │   ├── error-solutions.json       <- Baza rozwiązań błędów
│   │   └── known-bugs.json            <- Znane bugi aplikacji
│   ├── scripts/                   <- 28+ skryptów Node.js
│   │   ├── test-pipeline.js           <- Batch pipeline (CODED)
│   │   ├── auto-tester.js             <- NLP tester (heurystyki)
│   │   ├── run-tests.js               <- Orkiestrator
│   │   ├── server.js                  <- HTTP serwer monitora (:8081)
│   │   ├── save-test-result.js        <- Dual write: monitor + GSheets
│   │   ├── scan-specs.js              <- Skaner specs → mapa TC-ID
│   │   ├── session-manager.js         <- Zarządzanie sesją
│   │   └── ...
│   ├── monitor/
│   │   ├── index.html                 <- Dashboard HTML (real-time)
│   │   ├── favicon.svg                <- Ikona
│   │   └── start-server.bat           <- Uruchom serwer standalone
│   ├── plugin/agents/tester.md    <- Plugin wrapper (@tester)
│   ├── e2e/                       <- Testy (kopia z MUIFrontend)
│   │   ├── *.spec.ts                  <- 11 plików (133 coded + 49 stubs)
│   │   ├── fixtures.ts                <- CDP fixture
│   │   ├── playwright.config.ts       <- Config Playwright
│   │   ├── helpers/auth.ts            <- Login/logout/ensureLoggedIn
│   │   ├── helpers/sheets-reporter.ts <- Reporter → tests-data.js + webhook
│   │   ├── learned-procedures/        <- Nauczone procedury JSON
│   │   └── scripts/generate-spec.js   <- Generator .gen.spec.ts
│   ├── docs/
│   │   ├── agent-tester-dokumentacja.md
│   │   └── mcp-servers-guide.md       <- Przewodnik MCP (5 serwerów, 40+ narzędzi)
│   ├── bin/                       <- Skrypty BAT uruchomieniowe
│   ├── lib/                       <- Biblioteki pomocnicze
│   ├── test-files/                <- Pliki testowe (GeoJSON, KML, CSV, DXF)
│   ├── test-inputs/               <- Produkcyjne dane testowe (16 plików)
│   ├── k8s/                       <- Kubernetes manifesty
│   └── Dockerfile                 <- Kontener Docker
│
├── .claude\
│   ├── agents\tester\             <- Kopia robocza agenta (sync z repo)
│   ├── plugins\tester-agent\
│   │   └── agents\tester.md       <- Plugin (@tester)
│   └── settings.local.json        <- Uprawnienia MCP (z template)
│
├── MUIFrontend\
│   ├── .mcp.json                  <- Konfiguracja MCP serwerów
│   ├── e2e\
│   │   ├── *.spec.ts              <- 11 plików z testami
│   │   ├── fixtures.ts            <- CDP fixture
│   │   ├── helpers\
│   │   │   ├── auth.ts            <- Login/logout
│   │   │   └── sheets-reporter.ts <- Reporter Playwright
│   │   ├── learned-procedures\    <- JSON procedury
│   │   ├── scripts\generate-spec.js
│   │   └── generated\             <- Auto-generated specs
│   └── playwright.config.ts       <- Config z CDP_ENDPOINT
```

---

## Rozwiązywanie problemów

### Chrome debug nie startuje
```cmd
:: Uruchom ręcznie:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-dev"
```

### MCP Playwright nie łączy się
- Sprawdź czy Chrome debug działa: `curl http://localhost:9222/json/version`
- Sprawdź `.mcp.json` - czy `--cdp-endpoint` wskazuje na `http://localhost:9222`
- Restart Claude Code po zmianie `.mcp.json`

### MCP Google Sheets nie działa
- Sprawdź czy `sheets-service-account.json` istnieje w `config/`
- Sprawdź czy ścieżka w `.mcp.json` → `GOOGLE_APPLICATION_CREDENTIALS` jest poprawna
- Sprawdź czy arkusz jest udostępniony emailowi z service account (Editor)
- Fallback: agent może zapisać przez nawigację w przeglądarce (wolniejsze)

### Agent nie widzi testów
- Sprawdź `config/sheet-config.json` - czy sheetId jest poprawny
- Sprawdź czy arkusz jest publiczny lub masz dostęp
- Spróbuj ręcznie: `node scripts/test-pipeline.js --skip-coded` → powinien wypisać listę testów

### Playwright testy failują masowo
- Upewnij się że Chrome debug działa
- Sprawdź czy `CDP_ENDPOINT` jest ustawiony w środowisku
- Upewnij się że `npm install` było uruchomione w MUIFrontend
- Sprawdź `config/error-solutions.json` - może zawiera znane rozwiązanie

### Monitor nie pokazuje wyników
- Sprawdź czy `monitor/tests-data.js` jest aktualizowany
- Otwórz monitor bezpośrednio (nie przez serwer) dla testu
- Sprawdź czy skrypt `save-test-result.js` działa: `node scripts/save-test-result.js --init`

### Testy logowania nie działają
- Sprawdź czy `auth.ts` istnieje w `e2e/helpers/`
- Credentials domyślne: Mestwin / Kaktus,1
- Można nadpisać przez env: `TEST_USER`, `TEST_PASS`

### Sync nie pushuje na GitHub
- Sprawdź: `cd ~/.claude/agents/tester && git remote -v` → powinno być `gabriela-j/tester-agent`
- Sprawdź auth: `gh auth status`
- Ręczny push: `cd ~/.claude/agents/tester && git add -A && git commit -m "manual sync" && git push`
