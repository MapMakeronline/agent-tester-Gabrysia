/**
 * WALIDACJA SYNCHRONIZACJI TC-ID
 *
 * Porównuje TC-ID z arkusza Google z TC-ID w plikach .spec.ts
 * Raportuje:
 *   - GAP:    Testy w arkuszu bez odpowiednika w spec (brak pokrycia)
 *   - ORPHAN: Testy w spec bez odpowiednika w arkuszu (nieaktualne)
 *   - STUB:   Testy w spec oznaczone test.skip (do uzupełnienia)
 *
 * Użycie: node validate-test-map.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const MUIFRONTEND = path.resolve(__dirname, '..', '..', '..', '..', 'MUIFrontend');
const SHEET_CONFIG = path.resolve(__dirname, '..', 'config', 'sheet-config.json');

// ==================== CSV HELPERS ====================

function parseCSV(csvText) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        if (char === '"') {
            if (inQuotes && csvText[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (current.length > 0 || lines.length > 0) { lines.push(current); current = ''; }
            if (char === '\r' && csvText[i + 1] === '\n') i++;
        } else { current += char; }
    }
    if (current) lines.push(current);
    return lines.map(line => {
        const fields = []; let field = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { if (inQ && line[i + 1] === '"') { field += '"'; i++; } else { inQ = !inQ; } }
            else if (c === ',' && !inQ) { fields.push(field); field = ''; }
            else { field += c; }
        }
        fields.push(field);
        return fields;
    });
}

function fetchCSV(sheetId, sheetName) {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    if (sheetName) csvUrl += `&sheet=${encodeURIComponent(sheetName)}`;
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(csvUrl);
        const options = { hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: 'GET', headers: { 'Accept': 'text/csv' } };
        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const rUrl = new URL(res.headers.location);
                const rOpt = { hostname: rUrl.hostname, path: rUrl.pathname + rUrl.search, method: 'GET', headers: { 'Accept': 'text/csv' } };
                const rReq = https.request(rOpt, (rRes) => { let d = ''; rRes.on('data', c => d += c); rRes.on('end', () => resolve(d)); });
                rReq.on('error', reject); rReq.end(); return;
            }
            let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

// ==================== MAIN ====================

async function main() {
    console.log('=== WALIDACJA SYNCHRONIZACJI TC-ID ===\n');

    // 1. Read sheet config
    let sheetConfig;
    try {
        sheetConfig = JSON.parse(fs.readFileSync(SHEET_CONFIG, 'utf8'));
    } catch {
        console.log('BŁĄD: Brak sheet-config.json');
        process.exit(1);
    }

    // 2. Fetch sheet TC-IDs
    console.log('Pobieram TC-ID z arkusza Google...');
    const csvData = await fetchCSV(sheetConfig.sheetId, sheetConfig.sheetTitle || 'Testy_Lista');
    const rows = parseCSV(csvData);
    const header = rows[0].map(h => h.toLowerCase().trim());
    const idCol = header.findIndex(h => h === 'id' || h.includes('id'));

    const sheetIds = new Set();
    for (let i = 1; i < rows.length; i++) {
        const id = idCol >= 0 ? rows[i][idCol]?.trim() : '';
        if (id && id.startsWith('TC-')) sheetIds.add(id);
    }
    console.log(`  Arkusz: ${sheetIds.size} TC-ID\n`);

    // 3. Scan spec files (e2e/ + e2e/generated/)
    console.log('Skanuję pliki .spec.ts...');
    const e2eDir = path.join(MUIFRONTEND, 'e2e');
    const generatedDir = path.join(e2eDir, 'generated');

    const scanDirs = [{ dir: e2eDir, label: '' }];
    if (fs.existsSync(generatedDir)) scanDirs.push({ dir: generatedDir, label: 'generated/' });

    const specCoded = new Map();  // TC-ID -> { file, isSkipped, isGenerated }
    const specIds = new Set();

    for (const { dir, label } of scanDirs) {
        const specFiles = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));
        for (const file of specFiles) {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            const testRegex = /(test\.skip|test)\s*\(\s*['"`](TC-\w+-\d+)[^'"`]*['"`]/g;
            let match;
            while ((match = testRegex.exec(content)) !== null) {
                const isSkip = match[1] === 'test.skip';
                const tcId = match[2];
                const isSkipInBody = !isSkip && content.substring(match.index, match.index + 300).includes('test.skip(true');
                const isGenerated = label === 'generated/';
                specCoded.set(tcId, { file: label + file, isSkipped: isSkip || isSkipInBody, isGenerated });
                specIds.add(tcId);
            }
        }
    }

    const coded = [...specCoded.entries()].filter(([, v]) => !v.isSkipped && !v.isGenerated);
    const stubs = [...specCoded.entries()].filter(([, v]) => v.isSkipped);
    const generated = [...specCoded.entries()].filter(([, v]) => v.isGenerated);
    console.log(`  Spec: ${specIds.size} TC-ID (${coded.length} coded, ${stubs.length} stubs, ${generated.length} generated)\n`);

    // 4. Compare
    const gaps = [...sheetIds].filter(id => !specIds.has(id));
    const orphans = [...specIds].filter(id => !sheetIds.has(id));

    // Group gaps by category
    const gapsByCategory = {};
    for (const id of gaps) {
        const cat = id.replace(/^TC-(\w+)-\d+$/, '$1');
        if (!gapsByCategory[cat]) gapsByCategory[cat] = [];
        gapsByCategory[cat].push(id);
    }

    console.log('=== WYNIKI ===\n');

    // GAPs
    if (gaps.length > 0) {
        console.log(`GAP (${gaps.length} testów w arkuszu BEZ spec):`);
        for (const [cat, ids] of Object.entries(gapsByCategory)) {
            console.log(`  ${cat}: ${ids.join(', ')}`);
        }
        console.log();
    } else {
        console.log('GAP: brak (wszystkie testy z arkusza mają spec)\n');
    }

    // ORPHANs
    if (orphans.length > 0) {
        console.log(`ORPHAN (${orphans.length} testów w spec BEZ arkusza):`);
        for (const id of orphans) {
            const info = specCoded.get(id);
            console.log(`  ${id} → ${info.file}${info.isSkipped ? ' (stub)' : ''}`);
        }
        console.log();
    } else {
        console.log('ORPHAN: brak (wszystkie testy z spec mają wpis w arkuszu)\n');
    }

    // STUBs
    if (stubs.length > 0) {
        console.log(`STUB (${stubs.length} testów test.skip do uzupełnienia):`);
        const stubsByFile = {};
        for (const [id, info] of stubs) {
            if (!stubsByFile[info.file]) stubsByFile[info.file] = [];
            stubsByFile[info.file].push(id);
        }
        for (const [file, ids] of Object.entries(stubsByFile)) {
            console.log(`  ${file}: ${ids.join(', ')}`);
        }
        console.log();
    }

    // GENERATED
    if (generated.length > 0) {
        console.log(`GENERATED (${generated.length} testów z learned procedures):`);
        const genByFile = {};
        for (const [id, info] of generated) {
            if (!genByFile[info.file]) genByFile[info.file] = [];
            genByFile[info.file].push(id);
        }
        for (const [file, ids] of Object.entries(genByFile)) {
            console.log(`  ${file}: ${ids.join(', ')}`);
        }
        console.log();
    }

    // Summary
    const coverage = ((coded.length / sheetIds.size) * 100).toFixed(1);
    const totalAutomated = coded.length + generated.length;
    const totalCoverage = ((totalAutomated / sheetIds.size) * 100).toFixed(1);
    console.log('=== PODSUMOWANIE ===');
    console.log(`  Testy w arkuszu:    ${sheetIds.size}`);
    console.log(`  Zakodowane:         ${coded.length} (${coverage}%)`);
    console.log(`  Wygenerowane:       ${generated.length}`);
    console.log(`  Razem auto:         ${totalAutomated} (${totalCoverage}%)`);
    console.log(`  Stuby:              ${stubs.length}`);
    console.log(`  Luki (gaps):        ${gaps.length}`);
    console.log(`  Sieroty (orphans):  ${orphans.length}`);
}

main().catch(err => {
    console.error('Błąd:', err);
    process.exit(1);
});
