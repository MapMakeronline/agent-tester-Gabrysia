/**
 * Google Apps Script - Test Results API
 * Wklej ten kod do Apps Script w arkuszu z testami
 */

// Konfiguracja kolumn (dostosuj do swojego arkusza)
const CONFIG = {
  ID_COLUMN: 1,        // Kolumna z ID testu (A)
  STEPS_COLUMN: 4,     // Kolumna kroków (D)
  REQUIREMENTS_COLUMN: 5, // Kolumna wymagań (E)
  EXPECTED_COLUMN: 6,  // Kolumna oczekiwanego wyniku (F)
  STATUS_COLUMN: 7,    // Kolumna statusu (G)
  RESULT_COLUMN: 8,    // Kolumna wyniku (H)
  DATE_COLUMN: 9,      // Kolumna daty wykonania (I)
  HEADER_ROW: 1        // Wiersz nagłówków
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const results = data.results || [];

    if (results.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Brak wyników do zapisania'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    let updated = 0;

    for (const result of results) {
      const testId = result.code || result.id;
      if (!testId) continue;

      // Znajdź wiersz z tym ID testu
      for (let i = CONFIG.HEADER_ROW; i < values.length; i++) {
        if (values[i][CONFIG.ID_COLUMN - 1] === testId) {
          const row = i + 1;

          // Aktualizuj definicję testu (kroki, wymagania, oczekiwany wynik)
          if (result.steps) {
            sheet.getRange(row, CONFIG.STEPS_COLUMN).setValue(result.steps);
          }
          if (result.requirements) {
            sheet.getRange(row, CONFIG.REQUIREMENTS_COLUMN).setValue(result.requirements);
          }
          if (result.expectedResult) {
            sheet.getRange(row, CONFIG.EXPECTED_COLUMN).setValue(result.expectedResult);
          }

          // Zapisz status
          if (result.status) {
            sheet.getRange(row, CONFIG.STATUS_COLUMN).setValue(result.status.toUpperCase());
          }

          // Zapisz wynik do kolumny H
          if (result.resultText || result.error || result.notes) {
            const resultText = result.resultText || result.error || result.notes || '';
            sheet.getRange(row, CONFIG.RESULT_COLUMN).setValue(resultText.substring(0, 500));
          }

          // Zapisz datę i godzinę do kolumny I
          if (result.status) {
            if (result.finishedAtDisplay) {
              sheet.getRange(row, CONFIG.DATE_COLUMN).setValue(result.finishedAtDisplay);
            } else if (result.finishedAt) {
              sheet.getRange(row, CONFIG.DATE_COLUMN).setValue(result.finishedAt);
            } else {
              const dateTimeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
              sheet.getRange(row, CONFIG.DATE_COLUMN).setValue(dateTimeStr);
            }
          }

          updated++;
          break;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      updated: updated,
      total: results.length
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'OK',
    message: 'Test Results API is running',
    config: CONFIG
  })).setMimeType(ContentService.MimeType.JSON);
}

// Funkcja testowa - uruchom ręcznie żeby sprawdzić konfigurację
function testConfig() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];

  Logger.log('Nagłówki arkusza:');
  headers.forEach((h, i) => {
    Logger.log(`Kolumna ${i + 1}: ${h}`);
  });

  Logger.log('\nAktualna konfiguracja:');
  Logger.log(`ID w kolumnie: ${CONFIG.ID_COLUMN}`);
  Logger.log(`Kroki w kolumnie: ${CONFIG.STEPS_COLUMN}`);
  Logger.log(`Wymagania w kolumnie: ${CONFIG.REQUIREMENTS_COLUMN}`);
  Logger.log(`Oczekiwany wynik w kolumnie: ${CONFIG.EXPECTED_COLUMN}`);
  Logger.log(`Status w kolumnie: ${CONFIG.STATUS_COLUMN}`);
  Logger.log(`Wynik w kolumnie: ${CONFIG.RESULT_COLUMN}`);
  Logger.log(`Data w kolumnie: ${CONFIG.DATE_COLUMN}`);
}
