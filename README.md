# Agent Tester - Architektura i schemat działania

Autonomiczny agent testowy dla **Universe MapMaker**. Pobiera testy z Google Sheets, wykonuje je przez Playwright, wyniki zapisuje z powrotem do arkusza i lokalnego dashboardu.

---

## Schemat ogólny

```mermaid
flowchart TB
    subgraph ŹRÓDŁA["📋 Źródło testów"]
        GS["Google Sheets<br/>(Testy_Lista)<br/>182 test cases"]
    end

    subgraph PIPELINE["⚙️ Pipeline (KROK 0)"]
        TP["test-pipeline.js"]
        SS["scan-specs.js"]
        CSV["parse-csv-tests.js"]
    end

    subgraph METODY["🔀 3 metody testowania"]
        CODED["CODED<br/>Playwright .spec.ts<br/>batch ~45s<br/>133 testów"]
        LEARNED["LEARNED<br/>learned-procedures/*.json<br/>~15-30s/test"]
        NLP["NLP<br/>Playwright MCP (LLM)<br/>~60-180s/test"]
    end

    subgraph ZAPIS["💾 Zapis wyników"]
        MCP_GS["GSheets MCP<br/>(sheets_update_values)"]
        SAVE["save-test-result.js"]
        TD["tests-data.js<br/>(monitor lokalny)"]
        APPS["Apps Script API<br/>(batch write)"]
    end

    subgraph MONITOR["📊 Monitoring"]
        DASH["Dashboard HTML<br/>(index.html)"]
        SRV["server.js<br/>:8081 API"]
    end

    GS -->|CSV export| TP
    TP --> SS
    TP --> CSV
    SS -->|mapa TC-ID → spec| TP
    CSV -->|lista testów| TP

    TP -->|npx playwright test batch| CODED
    TP -->|remaining-tests.json| LEARNED
    TP -->|remaining-tests.json| NLP

    CODED -->|pw-coded-results.json| APPS
    CODED -->|pw-coded-results.json| SAVE
    LEARNED -->|Playwright MCP| MCP_GS
    LEARNED -->|Bash| SAVE
    NLP -->|Playwright MCP| MCP_GS
    NLP -->|Bash| SAVE

    APPS -->|batch update| GS
    MCP_GS -->|update G:I| GS
    SAVE --> TD
    TD --> DASH
    SRV --> DASH
```

---

## Pipeline - szczegółowy przepływ

```mermaid
sequenceDiagram
    participant Agent as Agent (Claude)
    participant Pipeline as test-pipeline.js
    participant Scanner as scan-specs.js
    participant PW as Playwright
    participant GSheets as Google Sheets
    participant Monitor as tests-data.js

    Agent->>Pipeline: node test-pipeline.js [--category=X]
    Pipeline->>GSheets: Pobierz testy (CSV export)
    GSheets-->>Pipeline: 182 test cases

    Pipeline->>Scanner: Skanuj *.spec.ts + learned-procedures/
    Scanner-->>Pipeline: Mapa: TC-ID → {file, method, isSkipped}

    rect rgb(200, 255, 200)
        Note over Pipeline,PW: CODED TESTS (batch)
        Pipeline->>PW: npx playwright test --grep-invert @exploratory
        PW-->>Pipeline: pw-coded-results.json (133 testów)
    end

    Pipeline->>GSheets: Apps Script API batch write (status, wynik, data)
    Pipeline->>Monitor: Aktualizuj tests-data.js

    Pipeline-->>Agent: JSON: {coded: {passed, failed}, remaining: [...]}

    rect rgb(255, 230, 200)
        Note over Agent,GSheets: REMAINING (NLP/LEARNED) - pętla
        loop Dla każdego remaining test
            Agent->>Agent: Sprawdź stop-signal.txt
            alt method = LEARNED
                Agent->>Agent: Read learned-procedures/{TC-ID}.json
                Agent->>PW: Playwright MCP (selektory z JSON)
            else method = NLP
                Agent->>PW: Playwright MCP (heurystyki z kroków)
            end
            PW-->>Agent: Snapshot → weryfikacja
            Agent->>GSheets: MCP sheets_update_values (G:I)
            Agent->>Monitor: node save-test-result.js
        end
    end
```

---

## 3 metody testowania - hierarchia

```mermaid
flowchart LR
    subgraph PRIORYTET["Hierarchia (zawsze najwyższa dostępna)"]
        direction TB
        C["🥇 CODED<br/>~0.3s/test w batch<br/>Playwright .spec.ts"]
        L["🥈 LEARNED<br/>~15-30s/test<br/>Procedura JSON + MCP"]
        N["🥉 NLP<br/>~60-180s/test<br/>LLM + Playwright MCP"]
        C --> L --> N
    end

    subgraph CODED_DETAIL["CODED"]
        C1["scan-specs.js znajduje<br/>TC-ID w *.spec.ts"]
        C2["test.skip = false"]
        C3["npx playwright test<br/>--grep TC-ID"]
        C4["Badge: [Coded]"]
        C1 --> C2 --> C3 --> C4
    end

    subgraph LEARNED_DETAIL["LEARNED"]
        L1["Istnieje plik<br/>learned-procedures/<br/>TC-ID.json"]
        L2["Selektory: role,<br/>aria-label, text,<br/>testid, css-id"]
        L3["Playwright MCP<br/>z JSON krokami"]
        L4["Badge: [Learned]"]
        L1 --> L2 --> L3 --> L4
    end

    subgraph NLP_DETAIL["NLP"]
        N1["Brak coded<br/>ani learned"]
        N2["Parsuj kroki<br/>z arkusza"]
        N3["Playwright MCP<br/>heurystyki NLP"]
        N4["Badge: [LLM]"]
        N1 --> N2 --> N3 --> N4
    end
```

---

## Flywheel - samouczenie

```mermaid
flowchart LR
    NLP["NLP test<br/>(ręczne MCP)"] -->|PASSED| RECORD["Self-recording<br/>(agent nagrywa akcje)"]
    RECORD --> JSON["learned-procedures/<br/>TC-ID.json"]
    JSON --> LEARNED["LEARNED test<br/>(JSON + MCP)"]
    LEARNED -->|stabilny| GEN["generate-spec.js"]
    GEN --> SPEC["generated/<br/>*.gen.spec.ts"]
    SPEC --> CODED["CODED test<br/>(Playwright batch)"]

    style NLP fill:#e3f2fd
    style LEARNED fill:#f3e5f5
    style CODED fill:#e8f5e9
```

> **Flywheel:** Test NLP → nagrany jako JSON → następnym razem LEARNED → wygenerowany jako .spec.ts → na zawsze CODED. Każdy test ewoluuje w kierunku szybszej metody.

---

## Struktura plików

```
~/.claude/agents/tester/           # Konfiguracja agenta (poza repo)
├── AGENT.md                       # Instrukcje agenta (SSOT)
├── memory.md                      # Pamięć agenta
├── config/
│   ├── sheet-config.json          # ID arkusza Google Sheets
│   ├── error-solutions.json       # Baza wiedzy o błędach
│   ├── known-bugs.json            # Znane bugi aplikacji
│   └── sheets-service-account.json
├── scripts/
│   ├── test-pipeline.js           # Batch pipeline (CODED + remaining)
│   ├── auto-tester.js             # NLP tester (heurystyki, bez LLM)
│   ├── run-tests.js               # Orkiestrator (pipeline + auto-tester)
│   ├── server.js                  # HTTP mikroserwis (:8081)
│   ├── scan-specs.js              # Skanuje specs → mapa TC-ID
│   ├── save-test-result.js        # Dual write: tests-data.js + GSheets
│   ├── session-manager.js         # Zarządzanie sesją testową
│   └── stop-monitor.js            # Hook: zatrzymaj monitor
├── monitor/
│   ├── index.html                 # Dashboard HTML (real-time)
│   ├── tests-data.js              # Dane dla dashboardu
│   └── stop-signal.txt            # Sygnał stopu
├── data/
│   ├── tests-queue.json           # Kolejka testów
│   ├── remaining-tests.json       # Testy dla LLM (po pipeline)
│   └── session-state.json         # Stan sesji
├── Dockerfile                     # Kontener (Playwright + tester)
└── k8s/                           # Kubernetes manifesty

MUIFrontend/e2e/                   # Pliki testowe (w repo)
├── *.spec.ts                      # 11 plików z coded testami
├── playwright.config.ts           # Konfiguracja Playwright
├── fixtures.ts                    # Fixture'y testowe
├── global-setup.ts                # Global setup (auth)
├── helpers/
│   ├── auth.ts                    # Login/logout helper
│   └── sheets-reporter.ts        # Reporter: wyniki → GSheets
├── learned-procedures/            # Nauczone procedury JSON
│   ├── TC-LOGIN-001.json
│   └── TC-TABLE-006.json
├── generated/                     # Auto-generated specs
│   └── *.gen.spec.ts
└── scripts/
    └── generate-spec.js           # JSON → .gen.spec.ts
```

---

## Integracje

```mermaid
flowchart LR
    subgraph AGENT["Agent Tester (Claude Sonnet)"]
        AGENT_MD["AGENT.md<br/>(instrukcje)"]
    end

    subgraph MCP["MCP Servers"]
        PW_MCP["Playwright MCP<br/>(22 narzędzia)"]
        GS_MCP["Google Sheets MCP<br/>(8 narzędzi)"]
    end

    subgraph INFRA["Infrastruktura"]
        CHROME["Chrome CDP<br/>port 9222"]
        GAPI["Apps Script API"]
        K8S["Kubernetes<br/>(przygotowane)"]
    end

    subgraph DANE["Dane"]
        SHEETS["Google Sheets<br/>Testy_Lista"]
        SPECS["*.spec.ts<br/>(11 plików)"]
        LP["learned-procedures/<br/>(JSON)"]
    end

    AGENT --> PW_MCP
    AGENT --> GS_MCP
    PW_MCP --> CHROME
    GS_MCP --> SHEETS
    AGENT --> GAPI
    GAPI --> SHEETS
    AGENT --> SPECS
    AGENT --> LP
```

---

## Mikroserwis (server.js)

Standalone HTTP serwer do uruchamiania testów zdalnie lub z dashboardu.

| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/api/start` | POST | `{ category?, testId? }` - uruchom testy |
| `/api/stop` | POST | Zatrzymaj testy |
| `/api/status` | GET | `{ running, finished, summary }` |
| `/api/results` | GET | `{ summary, tests[] }` - pełne wyniki |
| `/api/reset` | POST | Reset sesji |
| `/` | GET | Dashboard HTML (monitor) |

- **Auth:** `X-API-Key` header
- **Port:** 8081 (domyślny)
- **Deploy:** Docker + K8s (`tests.universemapmaker.online`)

---

## Arkusz Google Sheets

**Spreadsheet:** `Testy_Lista` (ID: `1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA`)

| Kolumna | Zawartość | Zapis |
|---------|-----------|-------|
| A: ID | `TC-LOGIN-001` | - |
| B: Kategoria | `LOGOWANIE` | - |
| C: Nazwa | Opis testu | - |
| D: Kroki | Numerowane kroki | - |
| E: Wymogi | Wymagania wstępne | - |
| F: Oczekiwany rezultat | Co powinno się wydarzyć | - |
| **G: Status** | `PASSED / FAILED / BLOCKED` | **Agent zapisuje** |
| **H: Wynik** | `[Coded/LLM/Learned] opis` | **Agent zapisuje** |
| **I: Data** | `YYYY-MM-DD HH:MM` | **Agent zapisuje** |

---

## Statystyki

| Metryka | Wartość |
|---------|---------|
| Testów w arkuszu | 182 |
| Coded (aktywnych) | 133 (73%) |
| Learned procedures | 2 |
| NLP (remaining) | 47 |
| Kategorii | 12 |
| Plików .spec.ts | 11 |

---

## Jak uruchomić

### Lokalnie (Claude Code)

```bash
# 1. Uruchom Chrome z remote debugging
chrome --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-dev

# 2. Uruchom agenta testera
# (automatycznie: pipeline → coded batch → NLP pętla)
```

### Standalone (bez Claude)

```bash
# Tylko coded testy (batch)
cd ~/.claude/agents/tester
node scripts/test-pipeline.js --coded-only

# Pełny pipeline + NLP
node scripts/run-tests.js

# Mikroserwis z dashboardem
node scripts/server.js
# Otwórz http://localhost:8081
```

### Docker / Kubernetes

```bash
# Build i deploy
cd ~/.claude/agents/tester
docker build -t tester-agent .
# lub: bash k8s/deploy.sh
```

---

## Kategorie testów i aliasy

| Alias | Pełna nazwa | Prefix TC-ID |
|-------|-------------|---------------|
| LOGIN | LOGOWANIE | TC-LOGIN-* |
| PROJ | PROJEKTY | TC-PROJ-* |
| IMPORT | IMPORT WARSTW | TC-IMP-* |
| LAYER | ZARZĄDZANIE WARSTWAMI | TC-LAYER-* |
| TABLE | TABELA ATRYBUTÓW | TC-TABLE-* |
| NAV | NAWIGACJA MAPĄ | TC-NAV-* |
| PROPS | WŁAŚCIWOŚCI | TC-PROP-* |
| TOOLS | NARZĘDZIA | TC-TOOL-* |
| PUB | PUBLIKOWANIE | TC-PUB-* |
| UI | INTERFEJS | TC-UI-* |
| PERF | WYDAJNOŚĆ | TC-PERF-* |
| BUG | BŁĘDY | TC-BUG-* |
