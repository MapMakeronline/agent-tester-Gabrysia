/**
 * SKANER SPEC FILES
 *
 * Skanuje pliki .spec.ts i .gen.spec.ts, wypisuje JSON:
 *   { "TC-LOGIN-001": { "file": "login.spec.ts", "isSkipped": false }, ... }
 *
 * Agent wywołuje raz na początku sesji:
 *   node scan-specs.js
 */

const fs = require('fs');
const path = require('path');

const MUIFRONTEND = path.resolve(__dirname, '..', '..', '..', '..', 'MUIFrontend');

function extractTcIdsFromSpecs() {
    const e2eDir = path.join(MUIFRONTEND, 'e2e');
    const dirs = [e2eDir];
    const generatedDir = path.join(e2eDir, 'generated');
    if (fs.existsSync(generatedDir)) dirs.push(generatedDir);

    const allSpecFiles = [];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));
        for (const f of files) allSpecFiles.push({ dir, file: f });
    }

    const coded = {}; // TC-ID -> { file, isSkipped }

    for (const { dir, file } of allSpecFiles) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');

        const testRegex = /(test\.skip|test)\s*\(\s*['"`](TC-\w+-\d+)[^'"`]*['"`]/g;
        let match;
        while ((match = testRegex.exec(content)) !== null) {
            const isSkipped = match[1] === 'test.skip';
            const tcId = match[2];

            // Check for test.skip(true, ...) pattern inside test body
            const isSkippedInBody = !isSkipped && content.includes('test.skip(true') &&
                content.substring(match.index, match.index + 300).includes('test.skip(true');

            coded[tcId] = {
                file,
                isSkipped: isSkipped || isSkippedInBody,
            };
        }
    }

    return coded;
}

const result = extractTcIdsFromSpecs();
const total = Object.keys(result).length;
const active = Object.values(result).filter(v => !v.isSkipped).length;
const skipped = Object.values(result).filter(v => v.isSkipped).length;

// Output JSON to stdout
console.log(JSON.stringify(result, null, 2));

// Summary to stderr (so it doesn't pollute JSON stdout)
process.stderr.write(`\nScan complete: ${total} TC-IDs (${active} coded, ${skipped} stubs)\n`);
