/**
 * Parsuje Testy_Universe.csv i tworzy uporządkowaną listę testów w Google Sheets
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

const API_URL = 'https://script.google.com/macros/s/AKfycbzV0LbIFePBoARK0iRfH_k90Hu9LEhG1hvW-vYyBZB7uvR4t19PYYYVu5KSXJG1npVwhQ/exec';
const CSV_PATH = 'C:\\Users\\Dom\\Downloads\\Testy_Universe.csv';

// Mapowanie prefiksów na kategorie
const CATEGORIES = {
    'TC-LOGIN': 'LOGOWANIE',
    'TC-PROJ': 'PROJEKTY',
    'TC-IMPORT': 'IMPORT WARSTW',
    'TC-LAYER': 'ZARZĄDZANIE WARSTWAMI',
    'TC-PROPS': 'WŁAŚCIWOŚCI',
    'TC-TABLE': 'TABELA ATRYBUTÓW',
    'TC-NAV': 'NAWIGACJA MAPĄ',
    'TC-TOOLS': 'NARZĘDZIA',
    'TC-PUB': 'PUBLIKOWANIE',
    'TC-UI': 'INTERFEJS',
    'TC-PERF': 'WYDAJNOŚĆ',
    'TC-BUG': 'BŁĘDY'
};

const CATEGORY_ORDER = [
    'LOGOWANIE', 'PROJEKTY', 'IMPORT WARSTW', 'ZARZĄDZANIE WARSTWAMI',
    'WŁAŚCIWOŚCI', 'TABELA ATRYBUTÓW', 'NAWIGACJA MAPĄ', 'NARZĘDZIA',
    'PUBLIKOWANIE', 'INTERFEJS', 'WYDAJNOŚĆ', 'BŁĘDY'
];

function parseCSV(content) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            if (inQuotes && content[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === '\n' && !inQuotes) {
            lines.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current) lines.push(current);

    return lines.map(line => {
        const fields = [];
        let field = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQ && line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQ = !inQ;
                }
            } else if (c === ',' && !inQ) {
                fields.push(field);
                field = '';
            } else {
                field += c;
            }
        }
        fields.push(field);
        return fields;
    });
}

function extractTestCode(name) {
    const match = name.match(/TC-[A-Z]+-\d+/);
    return match ? match[0] : null;
}

function extractCategory(code) {
    if (!code) return 'INNE';
    const prefix = code.match(/TC-[A-Z]+/);
    return prefix ? (CATEGORIES[prefix[0]] || 'INNE') : 'INNE';
}

function extractTestName(name) {
    // Usuń [BUG] prefix i kod testu
    return name
        .replace(/^\[BUG\]\s*/, '')
        .replace(/TC-[A-Z]+-\d+[:\s]*/, '')
        .trim();
}

function parseNotes(notes) {
    if (!notes) return { steps: '', requirements: '', expected: '' };

    let steps = '';
    let requirements = '';
    let expected = '';

    // Wyciągnij kroki
    const stepsMatch = notes.match(/(?:Kroki[:\s]*|## Kroki reprodukcji\s*)([\s\S]*?)(?=Oczekiwany|Faktyczny|## |Priorytet|Test:|$)/i);
    if (stepsMatch) {
        steps = stepsMatch[1]
            .split('\n')
            .filter(l => l.trim())
            .map(l => l.replace(/^\d+\.\s*/, '').trim())
            .filter(l => l.length > 0)
            .join('\n');
    }

    // Wyciągnij oczekiwany rezultat
    const expectedMatch = notes.match(/(?:Oczekiwany[:\s]*rezultat[:\s]*|## Oczekiwany rezultat\s*)([\s\S]*?)(?=Faktyczny|Aktualny|## |Priorytet|Test:|$)/i);
    if (expectedMatch) {
        expected = expectedMatch[1].trim();
    } else {
        const simpleExpected = notes.match(/Oczekiwany[:\s]*(.*?)(?:\n|$)/i);
        if (simpleExpected) expected = simpleExpected[1].trim();
    }

    // Wyciągnij wymagania (warunki wstępne, środowisko)
    const reqMatch = notes.match(/(?:Warunki|Wymagania|Środowisko|Srodowisko)[:\s]*(.*?)(?:\n|$)/i);
    if (reqMatch) {
        requirements = reqMatch[1].trim();
    }

    return { steps, requirements, expected };
}

async function makeRequest(params) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${API_URL}?${queryString}`;
        const parsedUrl = new url.URL(fullUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new url.URL(res.headers.location);
                const redirectOptions = {
                    hostname: redirectUrl.hostname,
                    path: redirectUrl.pathname + redirectUrl.search,
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                };

                const redirectReq = https.request(redirectOptions, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => {
                        try { resolve(JSON.parse(data)); }
                        catch (e) { resolve({ raw: data }); }
                    });
                });
                redirectReq.on('error', reject);
                redirectReq.end();
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve({ raw: data }); }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

async function main() {
    console.log('=== TWORZENIE LISTY TESTÓW ===\n');

    // Wczytaj CSV
    console.log('Wczytuję CSV...');
    const content = fs.readFileSync(CSV_PATH, 'utf8');
    const rows = parseCSV(content);
    const header = rows[0];
    const data = rows.slice(1);

    console.log(`Znaleziono ${data.length} wierszy\n`);

    // Indeksy kolumn
    const nameIdx = header.indexOf('Name');
    const notesIdx = header.indexOf('Notes');
    const completedIdx = header.indexOf('Completed At');
    const taskIdIdx = header.indexOf('Task ID');

    // Parsuj testy
    const tests = [];
    const seen = new Set();

    for (const row of data) {
        const name = row[nameIdx] || '';
        const code = extractTestCode(name);

        if (!code || seen.has(code)) continue;
        seen.add(code);

        const notes = row[notesIdx] || '';
        const { steps, requirements, expected } = parseNotes(notes);
        const completed = row[completedIdx] || '';
        const isBug = name.startsWith('[BUG]');

        tests.push({
            id: code,
            category: extractCategory(code),
            name: extractTestName(name),
            steps: steps || 'Do uzupełnienia',
            requirements: requirements || 'Zalogowany użytkownik',
            expected: expected || 'Do uzupełnienia',
            status: completed ? 'PASSED' : (isBug ? 'FAILED' : 'PENDING'),
            notes: isBug ? 'Znany bug' : '',
            lastTestDate: completed || ''
        });
    }

    // Sortuj według kategorii i ID
    tests.sort((a, b) => {
        const catA = CATEGORY_ORDER.indexOf(a.category);
        const catB = CATEGORY_ORDER.indexOf(b.category);
        if (catA !== catB) return catA - catB;
        return a.id.localeCompare(b.id);
    });

    console.log(`Znaleziono ${tests.length} unikalnych testów:\n`);

    // Pokaż statystyki
    const stats = {};
    for (const t of tests) {
        stats[t.category] = (stats[t.category] || 0) + 1;
    }
    for (const cat of CATEGORY_ORDER) {
        if (stats[cat]) console.log(`  ${cat}: ${stats[cat]}`);
    }

    // Zapisz do pliku JSON (do podglądu)
    const outputPath = path.join(__dirname, '..', 'data', 'tests-list.json');
    fs.writeFileSync(outputPath, JSON.stringify(tests, null, 2));
    console.log(`\nZapisano do: ${outputPath}`);

    // Wygeneruj CSV do importu do Google Sheets
    const csvOutput = [
        ['ID', 'Kategoria', 'Nazwa testu', 'Kroki', 'Wymogi', 'Oczekiwany rezultat', 'Status', 'Notatki', 'Data testu'].join('\t')
    ];

    for (const t of tests) {
        csvOutput.push([
            t.id,
            t.category,
            t.name,
            t.steps.replace(/\n/g, ' | '),
            t.requirements,
            t.expected.replace(/\n/g, ' '),
            t.status,
            t.notes,
            t.lastTestDate
        ].join('\t'));
    }

    const tsvPath = path.join(__dirname, '..', 'data', 'tests-list.tsv');
    fs.writeFileSync(tsvPath, csvOutput.join('\n'), 'utf8');
    console.log(`Zapisano TSV do: ${tsvPath}`);

    console.log('\n=== GOTOWE ===');
    console.log('\nAby zaimportować do Google Sheets:');
    console.log('1. Otwórz arkusz: https://docs.google.com/spreadsheets/d/1wFlv0KrT4JNTXAnGO4mwtDXPkh2dIxQzfM0VCXxA1jA');
    console.log('2. Plik → Importuj → Prześlij → Wybierz tests-list.tsv');
    console.log('3. Separator: Tabulator, Zastąp arkusz');
}

main().catch(console.error);
