/**
 * Czyści i upraszcza listę testów
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', 'data', 'tests-list.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'tests-list-clean.tsv');

// Mapowanie kategorii na kolory (do późniejszego użycia)
const CATEGORIES = [
    'LOGOWANIE', 'PROJEKTY', 'IMPORT WARSTW', 'ZARZĄDZANIE WARSTWAMI',
    'WŁAŚCIWOŚCI', 'TABELA ATRYBUTÓW', 'NAWIGACJA MAPĄ', 'NARZĘDZIA',
    'PUBLIKOWANIE', 'INTERFEJS', 'WYDAJNOŚĆ', 'BŁĘDY'
];

function cleanName(name) {
    // Usuń [P1], [P2], [P3], [BUG] itd.
    return name
        .replace(/^\[P[0-9]\]\s*/i, '')
        .replace(/^\[BUG\]\s*/i, '')
        .replace(/^\[.*?\]\s*/g, '')
        .trim();
}

function cleanSteps(steps) {
    if (!steps || steps === 'Do uzupełnienia') return '';
    // Zamień " | " z powrotem na nowe linie dla czytelności
    return steps.replace(/\s*\|\s*/g, '\n').trim();
}

function cleanExpected(expected) {
    if (!expected || expected === 'Do uzupełnienia') return '';
    return expected.trim();
}

function cleanRequirements(req) {
    if (!req || req === 'Zalogowany użytkownik') return 'Zalogowany użytkownik';
    return req.trim();
}

async function main() {
    console.log('=== CZYSZCZENIE LISTY TESTÓW ===\n');

    const tests = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    console.log(`Wczytano ${tests.length} testów\n`);

    // Przygotuj czysty TSV
    const header = ['ID', 'Kategoria', 'Nazwa testu', 'Kroki', 'Wymogi', 'Oczekiwany rezultat', 'Status', 'Wynik', 'Data testu'];
    const rows = [header.join('\t')];

    for (const t of tests) {
        const row = [
            t.id,
            t.category,
            cleanName(t.name),
            cleanSteps(t.steps).replace(/\n/g, ' | '),
            cleanRequirements(t.requirements),
            cleanExpected(t.expected),
            'PENDING',  // Wszystkie do wykonania
            '',         // Pusty wynik
            ''          // Pusta data
        ];
        rows.push(row.join('\t'));
    }

    fs.writeFileSync(OUTPUT_PATH, rows.join('\n'), 'utf8');
    console.log(`Zapisano czysty TSV: ${OUTPUT_PATH}`);
    console.log(`Liczba wierszy: ${rows.length}`);
}

main().catch(console.error);
