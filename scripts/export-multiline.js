/**
 * Eksportuje testy z krokami w osobnych liniach (wieloliniowe komórki)
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', 'data', 'tests-list.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'tests-list-multiline.tsv');

function cleanName(name) {
    return name
        .replace(/^\[P[0-9]\]\s*/i, '')
        .replace(/^\[BUG\]\s*/i, '')
        .replace(/^\[.*?\]\s*/g, '')
        .trim();
}

function formatSteps(steps) {
    if (!steps || steps === 'Do uzupełnienia') return '';

    // Rozdziel kroki i dodaj numerację
    const stepList = steps.split('\n').filter(s => s.trim());
    return stepList.map((step, i) => `${i + 1}. ${step.trim()}`).join('\n');
}

function escapeForTsv(text) {
    if (!text) return '';
    // Jeśli tekst zawiera tab, cudzysłów lub nową linię - otocz cudzysłowami
    if (text.includes('\t') || text.includes('"') || text.includes('\n')) {
        return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
}

async function main() {
    console.log('=== EKSPORT Z WIELOLINIOWYMI KROKAMI ===\n');

    const tests = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    console.log(`Wczytano ${tests.length} testów\n`);

    const header = ['ID', 'Kategoria', 'Nazwa testu', 'Kroki', 'Wymogi', 'Oczekiwany rezultat', 'Status', 'Wynik', 'Data testu'];
    const rows = [header.join('\t')];

    for (const t of tests) {
        const row = [
            escapeForTsv(t.id),
            escapeForTsv(t.category),
            escapeForTsv(cleanName(t.name)),
            escapeForTsv(formatSteps(t.steps)),
            escapeForTsv(t.requirements || 'Zalogowany użytkownik'),
            escapeForTsv((t.expected || '').trim()),
            'PENDING',
            '',
            ''
        ];
        rows.push(row.join('\t'));
    }

    fs.writeFileSync(OUTPUT_PATH, rows.join('\n'), 'utf8');
    console.log(`Zapisano: ${OUTPUT_PATH}`);
    console.log(`Wierszy: ${rows.length}`);
}

main().catch(console.error);
