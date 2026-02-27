# Memory - Agent Tester

## ⚠️ TEN PLIK ZAWIERA TYLKO TRWAŁE FAKTY TECHNICZNE

NIE dodawaj tutaj:
- ❌ Opisów sesji
- ❌ Debug historii
- ❌ Statystyk per run (są w tests-data.js i Google Sheets)
- ❌ Narracji
- ❌ Błędów i ich rozwiązań → zapisuj je w `config/error-solutions.json`

## Baza wiedzy o błędach
- **Plik:** `config/error-solutions.json`
- **Cel:** Trwała pamięć o napotkanych błędach i sprawdzonych rozwiązaniach
- **Obowiązek:** Czytaj na początku sesji, aktualizuj po każdym nowym błędzie

---

## Pokrycie testów (stan 2026-02-26)

- 182 TC-ID w arkuszu Google Sheets
- 133 coded w Playwright specs (73%) — wykonywane batch przez test-pipeline.js
- 49 stubs (test.skip) — delegowane do agenta LLM (remaining-tests.json)
- 2 learned procedures: TC-LOGIN-001, TC-TABLE-006
- 11 plików .spec.ts w `MUIFrontend/e2e/`
- 0 GAP, 0 ORPHAN — pełna synchronizacja sheet ↔ specs

## Pipeline (od 2026-02-26)

- **test-pipeline.js** = Faza 1: batch coded + zapis GSheets + remaining
- **auto-tester.js** = Faza 2: LLM testy (learned + NLP)
- Wyniki do GSheets przez **MCP** (sheets_update_values), NIE przez przeglądarkę
- Flagi: --skip-coded, --coded-only, --headless, --no-write, --category=X, --monitor

---

## Ograniczenia środowiska

### Playwright MCP
- **NIE obsługuje** natywnych JavaScript dialogs (confirm/alert/prompt)
- Testy wymagające confirm() → oznacz jako MANUAL TEST
- Dotyczy: TC-PROJ-015, TC-PROJ-016 (usuwanie projektu)

### Konto testowe
- **Login:** Mestwin / Kaktus,1
- **Subskrypcja:** BRAK - import plików zwraca 402 Payment Required
- **Uprawnienia:** admin

### Import plików
- **Obsługiwane formaty:** CSV, GML, SHP, GeoJSON, GeoTIFF, KML, GeoPackage
- **NIEOBSŁUGIWANE:** DXF, TopoJSON, WMTS
- **CSV ograniczenia:**
  - Kolumna "id" jest zabroniona (zmień na np. "punkt_id")
  - Wymaga kolumn lat/lon lub latitude/longitude
- TC-IMPORT-002+ → BLOCKED bez subskrypcji (402 Payment Required)

### Duże pliki
- TC-IMPORT-014 wymaga pliku >50MB
- Agent nie ma dostępu do takich plików → BLOCKED

### Dane testowe - DOSTĘPNE ✅

#### Projekt testowy: TESTAGENT
- **URL:** https://universe-mapmaker.web.app/projects/TESTAGENT
- **Warstwy:**
  - TestGroup (pusta grupa)
  - Obszary (KML polygon - Park Jordana)
  - Punkty testowe (KML points - Kraków, Wawel, Kazimierz, Nowa Huta)
  - test-lines (GeoJSON LineString - drogi, rzeka, ścieżka)
  - test-polygons (GeoJSON Polygon - 3 obszary A, B, C)
  - test-points (GeoJSON Point - 5 punktów z atrybutami)

#### Pliki testowe (C:\Users\Dom\.claude\agents\tester\test-files\)
- **test-points.geojson** - 5 punktów z id, name, category, value
- **test-polygons.geojson** - 3 poligony z id, name, type, area_ha
- **test-lines.geojson** - 3 linie z id, name, type, length_km
- **test-places.kml** - 4 placemarki + 1 polygon
- **test-data.csv** - 10 wierszy (wymaga naprawy formatu dla importu)
- **test-topo.json** - TopoJSON (format nieobsługiwany)
- **test-drawing.dxf** - DXF (format nieobsługiwany)

#### Dane testowe z produkcji (C:\Users\Dom\.claude\agents\tester\test-inputs\do testów\)
Rzeczywiste pliki do testowania importu warstw w różnych formatach:
- **GeoJSON:** 77.25 - przeznaczenie terenu Geojson.geojson (+.qmd)
- **KML:** 77.25 - przeznaczenie terenu KML.kml (+.qmd)
- **CSV:** 77.25 - przeznaczenie terenu CSV.csv (+.qmd)
- **XLSX:** 77.25 - przeznacz.terenu XLSX.xlsx (+.qmd)
- **SHP:** 77.25 - przeznaczenie terenu SHP.zip
- **SLD:** 77.25 - styl sld.sld
- **QML:** XIII.77.25 - przeznaczenie terenu_style.qml
- **GML:** GML_20.15_aktualizowany.gml
- **GPKG:** OZNACZENIA Z MPZP_RAZEM_wyciete.gpkg
- **GeoTIFF:** MPZP_Ostroleka_zal.1_z_nr_uchwaly_CROP.tif
- **DXF (zip):** 014 Plan fotowoltaika Florentynow Mariampol zal 1 DXF.zip
- **PDF:** uchwała 77.25.pdf (dokument referencyjny)

---

## Dokumentacja agenta

Folder `docs/` zawiera:
- **agent-tester-dokumentacja.md** - pełna dokumentacja (połączenie instrukcji, schematu i workflow)
- **mcp-servers-guide.md** - przewodnik po 5 najważniejszych serwerach MCP

Folder `config/` zawiera template'y do dystrybucji:
- **sheet-config.template.json** - szablon konfiguracji Google Sheets
- **webhook-config.template.json** - szablon konfiguracji webhooka

E2E Playwright config: `C:\Users\Dom\MUIFrontend\e2e\playwright.config.ts`

---

## Stabilne selektory

### Strona logowania (/login)
```
Email input: input[type="email"], [name="email"]
Hasło input: input[type="password"], [name="password"]
Przycisk: button:has-text("Zaloguj")
Błąd: .error, .alert-danger, [class*="error"]
```

### Strona projektów (/projects/my)
```
Lista: .project-card, [class*="project"]
Przycisk tworzenia: button:has-text("Utwórz projekt")
```

### Dialog importu warstwy
```
Zakładki: Plik, WMS, WFS (brak XYZ Tiles!)
Modal: .modal, [role="dialog"]
```

### Mapa
```
Kontrolki zoom: .mapboxgl-ctrl-zoom-in, .mapboxgl-ctrl-zoom-out
Bearing reset: .mapboxgl-ctrl-compass
```

---

## Znane flaki / niestabilności

### TC-LOGIN-008 (rejestracja)
- Jeśli Mestwin zalogowany → redirect na /dashboard zamiast formularza
- Rozwiązanie: wyloguj przed testem LUB oznacz BLOCKED

---

## Brakujące funkcje (confirmed)

| Funkcja | Status | Od |
|---------|--------|-----|
| Filtrowanie projektów | BRAK | 2026-01-27 |
| Sortowanie projektów | BRAK | 2026-01-27 |
| Wyszukiwanie projektów | BRAK | 2026-01-27 |
| Paginacja projektów | BRAK | 2026-01-27 |
| XYZ Tiles w imporcie | BRAK | 2026-02-03 |
| Reset widoku mapy | BRAK | 2026-01-28 |
| WMTS w imporcie | BRAK | 2026-02-05 |

---

