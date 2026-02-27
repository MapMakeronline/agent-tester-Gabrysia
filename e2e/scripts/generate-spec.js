#!/usr/bin/env node
/**
 * generate-spec.js - Generator: learned procedures JSON -> .gen.spec.ts
 *
 * Czyta e2e/learned-procedures/*.json, pomija te ktore maja juz coded spec,
 * grupuje po kategorii i generuje e2e/generated/{category-slug}.gen.spec.ts
 *
 * Uzycie:
 *   node e2e/scripts/generate-spec.js              # Generuj wszystko
 *   node e2e/scripts/generate-spec.js --dry-run    # Podglad bez zapisu
 *   node e2e/scripts/generate-spec.js --test=TC-TABLE-006  # Jeden test
 */

const fs = require('fs');
const path = require('path');

const E2E_DIR = path.resolve(__dirname, '..');
const PROCEDURES_DIR = path.join(E2E_DIR, 'learned-procedures');
const GENERATED_DIR = path.join(E2E_DIR, 'generated');

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINGLE_TEST = args.find(a => a.startsWith('--test='))?.split('=')[1];

// ==================== SPEC SCANNER ====================

/**
 * Scan e2e/*.spec.ts for TC-IDs that have non-skip implementations.
 * Returns a Set of TC-IDs that are already coded.
 */
function getCodedTcIds() {
    const coded = new Set();
    const specFiles = fs.readdirSync(E2E_DIR).filter(f => f.endsWith('.spec.ts'));

    for (const file of specFiles) {
        const content = fs.readFileSync(path.join(E2E_DIR, file), 'utf8');
        const testRegex = /(test\.skip|test)\s*\(\s*['"`](TC-\w+-\d+)[^'"`]*['"`]/g;
        let match;
        while ((match = testRegex.exec(content)) !== null) {
            const isSkipped = match[1] === 'test.skip';
            if (!isSkipped) {
                const tcId = match[2];
                // Also check for test.skip(true, ...) pattern inside test body
                const bodySnippet = content.substring(match.index, match.index + 300);
                if (!bodySnippet.includes('test.skip(true')) {
                    coded.add(tcId);
                }
            }
        }
    }

    return coded;
}

// ==================== SELECTOR MAPPING ====================

function selectorToPlaywright(sel) {
    switch (sel.strategy) {
        case 'role':
            if (sel.name) {
                const escapedName = sel.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return `page.getByRole('${sel.role}', { name: /${escapedName}/i })`;
            }
            return `page.getByRole('${sel.role}')`;

        case 'aria-label':
            return `page.getByLabel(/${escapeRegex(sel.value)}/i)`;

        case 'placeholder':
            return `page.getByPlaceholder(/${escapeRegex(sel.value)}/i)`;

        case 'name':
            return `page.locator('[name="${sel.value}"]')`;

        case 'testid':
            return `page.getByTestId('${sel.value}')`;

        case 'text':
            return `page.getByText(/${escapeRegex(sel.value)}/i)`;

        case 'css-id': {
            const id = sel.value.startsWith('#') ? sel.value : `#${sel.value}`;
            return `page.locator('${id}')`;
        }

        case 'css-class': {
            const cls = sel.value.startsWith('.') ? sel.value : `.${sel.value}`;
            return `page.locator('${cls}').first()`;
        }

        default:
            return null;
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pick the best selector from the list. Returns Playwright locator code string.
 */
function pickLocator(selectors) {
    if (!selectors || selectors.length === 0) return null;

    // Prefer non-lowConfidence selectors first
    const reliable = selectors.filter(s => !s.lowConfidence);
    const candidates = reliable.length > 0 ? reliable : selectors;

    for (const sel of candidates) {
        const code = selectorToPlaywright(sel);
        if (code) return code;
    }
    return null;
}

// ==================== ACTION CODE GENERATION ====================

function generateStepCode(step, indent) {
    const lines = [];
    const pad = ' '.repeat(indent);
    const comment = step.description ? `${pad}// Step ${step.index}: ${step.description}` : '';

    if (comment) lines.push(comment);

    // Wait before if specified
    if (step.waitBefore && step.waitBefore > 0) {
        lines.push(`${pad}await page.waitForTimeout(${step.waitBefore});`);
    }

    switch (step.action) {
        case 'navigate': {
            const url = step.url || '';
            if (url.startsWith('/') || url.startsWith('http')) {
                const targetUrl = url.startsWith('http') ? url : '${BASE_URL}' + url;
                if (url.startsWith('http')) {
                    lines.push(`${pad}await page.goto('${url}');`);
                } else {
                    lines.push(`${pad}await page.goto(\`\${BASE_URL}${url}\`);`);
                }
                lines.push(`${pad}await page.waitForLoadState('networkidle').catch(() => {});`);
            }
            break;
        }

        case 'click': {
            const locator = pickLocator(step.selectors);
            if (locator) {
                lines.push(`${pad}await ${locator}.click();`);
            } else {
                lines.push(`${pad}// TODO: no reliable selector - manual fix needed`);
                lines.push(`${pad}// Description: ${step.description}`);
            }
            break;
        }

        case 'dblclick': {
            const locator = pickLocator(step.selectors);
            if (locator) {
                lines.push(`${pad}await ${locator}.dblclick();`);
            } else {
                lines.push(`${pad}// TODO: no reliable selector for dblclick`);
            }
            break;
        }

        case 'type': {
            const locator = pickLocator(step.selectors);
            const value = step.value || '';
            if (locator) {
                lines.push(`${pad}await ${locator}.fill('${value.replace(/'/g, "\\'")}');`);
            } else {
                lines.push(`${pad}// TODO: no reliable selector for type`);
            }
            break;
        }

        case 'press_key': {
            const key = step.key || 'Enter';
            lines.push(`${pad}await page.keyboard.press('${key}');`);
            break;
        }

        case 'canvas_click': {
            if (step.canvasPosition) {
                lines.push(`${pad}// Canvas click at relative position ${step.canvasPosition.relX}%, ${step.canvasPosition.relY}%`);
                lines.push(`${pad}{`);
                lines.push(`${pad}  const canvas = page.locator('canvas').first();`);
                lines.push(`${pad}  const box = await canvas.boundingBox();`);
                lines.push(`${pad}  if (box) {`);
                lines.push(`${pad}    const x = box.x + box.width * ${step.canvasPosition.relX} / 100;`);
                lines.push(`${pad}    const y = box.y + box.height * ${step.canvasPosition.relY} / 100;`);
                lines.push(`${pad}    await page.mouse.click(x, y);`);
                lines.push(`${pad}  }`);
                lines.push(`${pad}}`);
            } else {
                lines.push(`${pad}// TODO: canvas_click without position data`);
            }
            break;
        }

        case 'select': {
            const locator = pickLocator(step.selectors);
            const value = step.value || '';
            if (locator) {
                lines.push(`${pad}await ${locator}.selectOption('${value.replace(/'/g, "\\'")}');`);
            } else {
                lines.push(`${pad}// TODO: no reliable selector for select`);
            }
            break;
        }

        case 'check': {
            const locator = pickLocator(step.selectors);
            if (locator) {
                lines.push(`${pad}await ${locator}.check();`);
            } else {
                lines.push(`${pad}// TODO: no reliable selector for check`);
            }
            break;
        }

        default:
            lines.push(`${pad}// TODO: unknown action '${step.action}'`);
    }

    return lines.join('\n');
}

// ==================== FILE GENERATION ====================

function categorySlug(category) {
    return category
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateSpecFile(category, procedures) {
    const needsLogin = procedures.some(p => p.preconditions?.loggedIn !== false);
    const noLogin = procedures.every(p => p.preconditions?.loggedIn === false);

    const lines = [];
    lines.push(`// @generated from learned procedures - DO NOT EDIT manually`);
    lines.push(`// Regenerate: node e2e/scripts/generate-spec.js`);
    lines.push(`import { test, expect } from '@playwright/test';`);

    if (!noLogin) {
        lines.push(`import { ensureLoggedIn } from '../helpers/auth';`);
    }

    lines.push(`const BASE_URL = process.env.BASE_URL || 'https://universe-mapmaker.web.app';`);
    lines.push('');
    lines.push(`test.describe('${category}', () => {`);

    if (!noLogin) {
        lines.push(`  test.beforeEach(async ({ page }) => { await ensureLoggedIn(page); });`);
        lines.push('');
    }

    for (let pi = 0; pi < procedures.length; pi++) {
        const proc = procedures[pi];
        const meta = proc.metadata;
        const testTitle = `${meta.testId}: ${meta.testName}`;

        // If this specific procedure doesn't need login but others do, skip beforeEach login
        // (handled by the beforeEach - if not logged in it won't re-login)

        lines.push(`  test('${testTitle.replace(/'/g, "\\'")}', async ({ page }) => {`);

        for (const step of proc.steps) {
            const code = generateStepCode(step, 4);
            if (code) lines.push(code);
        }

        lines.push(`  });`);

        if (pi < procedures.length - 1) lines.push('');
    }

    lines.push(`});`);
    lines.push('');

    return lines.join('\n');
}

// ==================== MAIN ====================

function main() {
    console.log('=== generate-spec.js ===\n');

    // 1. Load all procedures
    if (!fs.existsSync(PROCEDURES_DIR)) {
        console.log('Brak katalogu learned-procedures/. Nic do generowania.');
        return;
    }

    const jsonFiles = fs.readdirSync(PROCEDURES_DIR).filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) {
        console.log('Brak plikow JSON w learned-procedures/. Nic do generowania.');
        return;
    }

    console.log(`Znaleziono ${jsonFiles.length} procedur`);

    const procedures = [];
    for (const file of jsonFiles) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(PROCEDURES_DIR, file), 'utf8'));
            procedures.push(data);
        } catch (e) {
            console.log(`  WARN: Nie mozna odczytac ${file}: ${e.message}`);
        }
    }

    // 2. Filter by --test if specified
    let filtered = procedures;
    if (SINGLE_TEST) {
        filtered = procedures.filter(p => p.metadata?.testId === SINGLE_TEST);
        if (filtered.length === 0) {
            console.log(`Nie znaleziono procedury dla ${SINGLE_TEST}`);
            return;
        }
        console.log(`Filtr: tylko ${SINGLE_TEST}`);
    }

    // 3. Get coded TC-IDs (non-skip implementations in *.spec.ts)
    const codedIds = getCodedTcIds();
    console.log(`Zakodowanych spec: ${codedIds.size} TC-ID`);

    // 4. Filter out already coded
    const toGenerate = filtered.filter(p => !codedIds.has(p.metadata?.testId));
    const skippedCoded = filtered.length - toGenerate.length;
    if (skippedCoded > 0) {
        console.log(`Pominieto ${skippedCoded} (juz zakodowane w spec)`);
    }

    if (toGenerate.length === 0) {
        console.log('\nWszystkie procedury maja juz zakodowane spec. Nic do generowania.');
        return;
    }

    // 5. Group by category
    const byCategory = {};
    for (const proc of toGenerate) {
        const cat = proc.metadata?.category || 'OTHER';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(proc);
    }

    console.log(`\nDo generowania: ${toGenerate.length} procedur w ${Object.keys(byCategory).length} kategoriach:`);
    for (const [cat, procs] of Object.entries(byCategory)) {
        console.log(`  ${cat}: ${procs.map(p => p.metadata.testId).join(', ')}`);
    }

    // 6. Generate files
    if (!DRY_RUN && !fs.existsSync(GENERATED_DIR)) {
        fs.mkdirSync(GENERATED_DIR, { recursive: true });
    }

    const generated = [];
    for (const [cat, procs] of Object.entries(byCategory)) {
        const slug = categorySlug(cat);
        const filename = `${slug}.gen.spec.ts`;
        const filepath = path.join(GENERATED_DIR, filename);
        const content = generateSpecFile(cat, procs);

        if (DRY_RUN) {
            console.log(`\n--- ${filename} (DRY RUN) ---`);
            console.log(content);
            console.log(`--- end ${filename} ---`);
        } else {
            fs.writeFileSync(filepath, content, 'utf8');
            console.log(`\nZapisano: ${filepath}`);
        }

        generated.push({
            file: filename,
            category: cat,
            tests: procs.map(p => p.metadata.testId),
        });
    }

    // 7. Summary
    console.log('\n=== PODSUMOWANIE ===');
    console.log(`  Procedur wejsciowych: ${procedures.length}`);
    console.log(`  Pominieto (coded):    ${skippedCoded}`);
    console.log(`  Wygenerowano:         ${toGenerate.length} testow w ${generated.length} plikach`);
    if (DRY_RUN) {
        console.log('  Tryb: DRY RUN (pliki nie zapisane)');
    }
}

main();
