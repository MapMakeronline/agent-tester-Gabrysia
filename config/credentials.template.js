/**
 * TEMPLATE - skopiuj jako credentials.js i wypelnij danymi
 */
function getLoginCredentials() {
    return {
        email: 'TWOJ_EMAIL',
        password: 'TWOJE_HASLO'
    };
}

function getSheetConfig() {
    return {
        spreadsheetId: 'ID_ARKUSZA',
        sheetName: 'Testy_Lista',
        csvUrl: 'URL_DO_CSV'
    };
}

function getGoogleApiUrl() {
    return 'URL_APPS_SCRIPT_WEBHOOKA';
}

module.exports = { getLoginCredentials, getSheetConfig, getGoogleApiUrl };
