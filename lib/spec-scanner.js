/**
 * Playwright spec file scanner.
 *
 * Scans .spec.ts files in e2e/ and e2e/generated/ for TC-ID patterns
 * like test('TC-LOGIN-001 ...') and test.skip('TC-NAV-002 ...').
 */

const fs = require('fs');
const path = require('path');

/**
 * Scan spec files and return a Map of TC-ID -> { file, isSkipped, isGenerated }.
 *
 * @param {string} muiFrontendPath - path to MUIFrontend root
 * @returns {Map<string, {file: string, isSkipped: boolean, isGenerated: boolean}>}
 */
function extractTcIdsFromSpecs(muiFrontendPath) {
    const e2eDir = path.join(muiFrontendPath, 'e2e');
    const generatedDir = path.join(e2eDir, 'generated');

    const scanDirs = [{ dir: e2eDir, label: '' }];
    if (fs.existsSync(generatedDir)) scanDirs.push({ dir: generatedDir, label: 'generated/' });

    const coded = new Map();

    for (const { dir, label } of scanDirs) {
        if (!fs.existsSync(dir)) continue;
        const specFiles = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));

        for (const file of specFiles) {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            const testRegex = /(test\.skip|test)\s*\(\s*['"`](TC-\w+-\d+)[^'"`]*['"`]/g;
            let match;

            while ((match = testRegex.exec(content)) !== null) {
                const isSkipped = match[1] === 'test.skip';
                const tcId = match[2];

                const isSkippedInBody = !isSkipped && content.includes('test.skip(true') &&
                    content.substring(match.index, match.index + 300).includes('test.skip(true');

                coded.set(tcId, {
                    file: label + file,
                    isSkipped: isSkipped || isSkippedInBody,
                    isGenerated: label === 'generated/',
                });
            }
        }
    }

    return coded;
}

module.exports = { extractTcIdsFromSpecs };
