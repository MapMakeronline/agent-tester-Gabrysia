#!/usr/bin/env node
/**
 * learn-test.js - Nagrywanie procedur testowych przez obserwację użytkownika
 *
 * Łączy się z Chrome przez CDP (--remote-debugging-port=9222) używając
 * czystego WebSocket (bez Playwright, który blokuje fizyczne kliknięcia).
 * Wstrzykuje recorder DOM, nagrywa akcje użytkownika,
 * transformuje na semantyczne kroki i zapisuje jako JSON.
 *
 * Użycie:
 *   node learn-test.js TC-TOOLS-008
 *   node learn-test.js TC-TOOLS-008 --port=9223
 *   node learn-test.js TC-TOOLS-008 --duration=60
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_DIR = path.resolve(__dirname, '..');
const MUIFRONTEND = process.env.MUIFRONTEND || path.resolve(__dirname, '..', '..', '..', '..', 'MUIFrontend');
const PROCEDURES_DIR = path.join(MUIFRONTEND, 'e2e', 'learned-procedures');
const QUEUE_PATH = path.join(BASE_DIR, 'data', 'tests-queue.json');

// --- CLI args ---
const args = process.argv.slice(2);
const testId = args.find(a => !a.startsWith('--'));
const portArg = args.find(a => a.startsWith('--port='));
const durationArg = args.find(a => a.startsWith('--duration='));

const CDP_PORT = portArg ? parseInt(portArg.split('=')[1], 10) : 9222;
const MAX_DURATION = durationArg ? parseInt(durationArg.split('=')[1], 10) * 1000 : 120000;

if (!testId || !/^TC-[A-Z]+-\d{3}$/.test(testId)) {
  console.error('Użycie: node learn-test.js TC-XXX-NNN [--port=9222] [--duration=60]');
  console.error('Przykład: node learn-test.js TC-TOOLS-008');
  process.exit(1);
}

// --- CDP helpers (pure WebSocket, no Playwright) ---
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (evt) => {
      const data = JSON.parse(typeof evt === 'string' ? evt : evt.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// --- Recorder script injected into the page ---
const RECORDER_SCRIPT = `
(() => {
  if (window.__RECORDER_EVENTS__ && window.__RECORDER_EVENTS__.length > 0) return 'ALREADY_ACTIVE';
  window.__RECORDER_EVENTS__ = [];
  window.__RECORDER_ACTIVE__ = true;

  function getElementInfo(el) {
    if (!el || !el.tagName) return null;
    const rect = el.getBoundingClientRect();
    const info = {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label') || null,
      placeholder: el.getAttribute('placeholder') || null,
      name: el.getAttribute('name') || null,
      testId: el.getAttribute('data-testid') || null,
      type: el.getAttribute('type') || null,
      text: (el.textContent || '').trim().substring(0, 80),
      value: el.value !== undefined ? el.value : null,
      className: el.className ? String(el.className).substring(0, 120) : null,
      isCanvas: el.tagName === 'CANVAS' || (el.className && String(el.className).includes('mapboxgl-canvas')),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };

    if (!el.getAttribute('role')) {
      const tagRoles = {
        button: 'button', a: 'link', select: 'combobox',
        textarea: 'textbox', li: 'listitem', option: 'option', img: 'img'
      };
      if (el.tagName === 'INPUT') {
        const t = (el.type || 'text').toLowerCase();
        if (t === 'checkbox') info.role = 'checkbox';
        else if (t === 'radio') info.role = 'radio';
        else if (t === 'submit' || t === 'button') info.role = 'button';
        else info.role = 'textbox';
      } else {
        info.role = tagRoles[el.tagName.toLowerCase()] || null;
      }
    }

    if (info.isCanvas) {
      info.canvasWidth = rect.width;
      info.canvasHeight = rect.height;
    }

    return info;
  }

  function record(type, extra) {
    if (!window.__RECORDER_ACTIVE__) return;
    window.__RECORDER_EVENTS__.push({ type, timestamp: Date.now(), ...extra });
  }

  for (const evtType of ['click', 'dblclick']) {
    document.addEventListener(evtType, (e) => {
      const el = getElementInfo(e.target);
      if (!el) return;
      const data = { element: el };
      if (el.isCanvas) {
        const rect = e.target.getBoundingClientRect();
        data.canvasPosition = {
          relX: Math.round(((e.clientX - rect.left) / rect.width) * 10000) / 100,
          relY: Math.round(((e.clientY - rect.top) / rect.height) * 10000) / 100
        };
      }
      record(evtType, data);
    }, true);
  }

  document.addEventListener('input', (e) => {
    const el = getElementInfo(e.target);
    if (!el) return;
    record('input', { element: el, value: e.target.value || '' });
  }, true);

  document.addEventListener('change', (e) => {
    const el = getElementInfo(e.target);
    if (!el) return;
    record('change', { element: el, value: e.target.value || '', checked: e.target.checked });
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!['Enter', 'Tab', 'Escape'].includes(e.key)) return;
    const el = getElementInfo(e.target);
    record('keydown', { element: el, key: e.key });
  }, true);

  const origPushState = history.pushState;
  history.pushState = function(...args) {
    record('navigate', { url: args[2] || location.href });
    return origPushState.apply(this, args);
  };

  window.addEventListener('popstate', () => {
    record('navigate', { url: location.href });
  });

  return 'RECORDER_INSTALLED';
})();
`;

// --- Helpers ---
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function generateSelectors(el) {
  const selectors = [];
  if (!el) return selectors;

  if (el.role && (el.ariaLabel || el.text)) {
    const name = el.ariaLabel || el.text;
    if (name.length <= 60) selectors.push({ strategy: 'role', role: el.role, name });
  }
  if (el.ariaLabel) selectors.push({ strategy: 'aria-label', value: el.ariaLabel });
  if (el.placeholder) selectors.push({ strategy: 'placeholder', value: el.placeholder });
  if (el.name) selectors.push({ strategy: 'name', value: el.name });
  if (el.testId) selectors.push({ strategy: 'testid', value: el.testId });
  if (el.text && el.text.length > 0 && el.text.length <= 60) selectors.push({ strategy: 'text', value: el.text });
  if (el.id) selectors.push({ strategy: 'css-id', value: `#${el.id}` });
  if (selectors.length === 0 && el.className) selectors.push({ strategy: 'css-class', value: el.className.split(' ')[0], lowConfidence: true });

  return selectors;
}

function generateDescription(action, el, extra) {
  const name = el?.ariaLabel || el?.placeholder || el?.text || el?.name || el?.id || '(nieznany)';
  const shortName = name.length > 40 ? name.substring(0, 40) + '...' : name;

  switch (action) {
    case 'click':
      if (el?.isCanvas) return `Kliknij na mapie - pozycja ~${extra?.canvasPosition?.relX}%, ~${extra?.canvasPosition?.relY}%`;
      return `Kliknij ${el?.role === 'button' ? 'przycisk' : el?.role === 'link' ? 'link' : 'element'} '${shortName}'`;
    case 'dblclick': return `Dwukrotnie kliknij '${shortName}'`;
    case 'type': return `Wpisz '${extra?.value || ''}' w pole '${shortName}'`;
    case 'press_key': return `Nacisnij klawisz ${extra?.key}`;
    case 'canvas_click': return `Kliknij na mapie - pozycja ~${extra?.canvasPosition?.relX}%, ~${extra?.canvasPosition?.relY}%`;
    case 'navigate': return `Przejdz do ${extra?.url || ''}`;
    case 'select': return `Wybierz '${extra?.value || ''}' z listy '${shortName}'`;
    case 'check': return `${extra?.checked ? 'Zaznacz' : 'Odznacz'} checkbox '${shortName}'`;
    default: return `Akcja ${action} na '${shortName}'`;
  }
}

function sameElement(a, b) {
  if (!a || !b) return false;
  return a.tag === b.tag && a.id === b.id && a.name === b.name && a.ariaLabel === b.ariaLabel;
}

function transformEvents(rawEvents) {
  if (!rawEvents || rawEvents.length === 0) return [];

  const deduped = [];
  for (const evt of rawEvents) {
    const last = deduped[deduped.length - 1];
    if (last && last.type === evt.type && Math.abs(last.timestamp - evt.timestamp) < 50) continue;
    deduped.push(evt);
  }

  const steps = [];
  let i = 0;

  while (i < deduped.length) {
    const evt = deduped[i];

    if (evt.type === 'input') {
      let lastValue = evt.value;
      let lastEl = evt.element;
      let j = i + 1;
      while (j < deduped.length) {
        const next = deduped[j];
        if (next.type === 'input' && sameElement(next.element, evt.element)) {
          if (next.timestamp - deduped[j - 1].timestamp > 5000) break;
          lastValue = next.value;
          lastEl = next.element;
          j++;
        } else break;
      }
      steps.push({ action: 'type', element: lastEl, value: lastValue, selectors: generateSelectors(lastEl), description: generateDescription('type', lastEl, { value: lastValue }) });
      i = j;
      continue;
    }

    if ((evt.type === 'click' || evt.type === 'dblclick') && evt.element?.isCanvas) {
      steps.push({ action: 'canvas_click', element: evt.element, canvasPosition: evt.canvasPosition, selectors: [{ strategy: 'canvas-position' }], description: generateDescription('canvas_click', evt.element, evt) });
      i++;
      continue;
    }

    if (evt.type === 'click' || evt.type === 'dblclick') {
      // Look ahead up to 5 events for input on same element (click-to-focus detection)
      let isClickToFocus = false;
      for (let k = i + 1; k < Math.min(i + 6, deduped.length); k++) {
        const ahead = deduped[k];
        if (ahead.type === 'input' && sameElement(ahead.element, evt.element)) { isClickToFocus = true; break; }
        if (!sameElement(ahead.element, evt.element) && ahead.type !== 'click') break;
      }
      if (isClickToFocus) { i++; continue; }
      steps.push({ action: evt.type === 'dblclick' ? 'dblclick' : 'click', element: evt.element, selectors: generateSelectors(evt.element), description: generateDescription(evt.type, evt.element, evt) });
      i++;
      continue;
    }

    if (evt.type === 'change') {
      if (evt.element?.role === 'combobox' || evt.element?.tag === 'select') {
        steps.push({ action: 'select', element: evt.element, value: evt.value, selectors: generateSelectors(evt.element), description: generateDescription('select', evt.element, evt) });
      } else if (evt.element?.type === 'checkbox' || evt.element?.role === 'checkbox') {
        steps.push({ action: 'check', element: evt.element, checked: evt.checked, selectors: generateSelectors(evt.element), description: generateDescription('check', evt.element, evt) });
      }
      i++;
      continue;
    }

    if (evt.type === 'keydown') {
      steps.push({ action: 'press_key', key: evt.key, element: evt.element, selectors: generateSelectors(evt.element), description: generateDescription('press_key', evt.element, evt) });
      i++;
      continue;
    }

    if (evt.type === 'navigate') {
      steps.push({ action: 'navigate', url: evt.url, selectors: [], description: generateDescription('navigate', null, evt) });
      i++;
      continue;
    }

    i++;
  }

  return steps.map((step, idx) => {
    const result = { index: idx + 1, action: step.action, description: step.description, selectors: step.selectors };
    if (step.action === 'canvas_click') result.canvasPosition = step.canvasPosition;
    if (step.action === 'type') result.value = step.value;
    if (step.action === 'select') result.value = step.value;
    if (step.action === 'check') result.checked = step.checked;
    if (step.action === 'press_key') result.key = step.key;
    if (step.action === 'navigate') result.url = step.url;
    if (idx > 0 && steps[idx - 1].action === 'click') result.waitBefore = 500;
    return result;
  });
}

// --- Main ---
async function main() {
  console.log(`\n=== learn-test.js ===`);
  console.log(`Test: ${testId}`);
  console.log(`CDP port: ${CDP_PORT}`);
  console.log(`Max duration: ${MAX_DURATION / 1000}s\n`);

  // Check if procedure already exists
  const outPath = path.join(PROCEDURES_DIR, `${testId}.json`);
  if (fs.existsSync(outPath)) {
    const overwrite = await ask(`Plik ${testId}.json juz istnieje. Nadpisac? (t/n) `);
    if (overwrite.toLowerCase() !== 't') {
      console.log('Anulowano.');
      process.exit(0);
    }
  }

  // Load test metadata from queue if available
  let testMeta = { testId, category: '', testName: '' };
  if (fs.existsSync(QUEUE_PATH)) {
    try {
      const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
      const found = queue.tests?.find(t => t.id === testId);
      if (found) {
        testMeta.category = found.category || '';
        testMeta.testName = found.name || '';
        console.log(`Znaleziono metadane: ${found.category} / ${found.name}`);
      }
    } catch (e) { /* ignore */ }
  }

  // Get Chrome pages via CDP HTTP API
  console.log(`Laczenie z Chrome na localhost:${CDP_PORT}...`);
  let pages;
  try {
    pages = await httpGet(`http://localhost:${CDP_PORT}/json`);
  } catch (e) {
    console.error(`\nNie mozna polaczyc z Chrome na porcie ${CDP_PORT}.`);
    console.error('Uruchom Chrome z flaga:');
    console.error(`  chrome --remote-debugging-port=${CDP_PORT}`);
    process.exit(1);
  }

  // Find target page
  const target = pages.find(p => p.url.includes('universe-mapmaker') && p.type === 'page')
    || pages.find(p => p.url.startsWith('http') && p.type === 'page');

  if (!target) {
    console.error('Brak otwartych stron HTTP w Chrome.');
    process.exit(1);
  }

  console.log(`Strona: ${target.url}\n`);

  // Connect via WebSocket (pure CDP, no Playwright)
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  await cdpSend(ws, 'Runtime.enable');

  // Inject recorder
  const injectResult = await cdpSend(ws, 'Runtime.evaluate', {
    expression: RECORDER_SCRIPT,
    returnByValue: true
  });
  console.log(`Recorder: ${injectResult.result.value}`);
  console.log('Nagrywanie rozpoczete! Wykonaj test w przegladarce.');
  console.log('Nacisnij Enter aby zakonczyc nagrywanie.\n');

  const recordStart = Date.now();

  // Poll events and show counter
  const pollInterval = setInterval(async () => {
    try {
      const r = await cdpSend(ws, 'Runtime.evaluate', {
        expression: 'window.__RECORDER_EVENTS__?.length || 0',
        returnByValue: true
      });
      const count = r.result.value;
      const elapsed = Math.round((Date.now() - recordStart) / 1000);
      process.stdout.write(`\r  Zdarzenia: ${count} | Czas: ${elapsed}s  `);
    } catch (e) { /* ignore */ }
  }, 1000);

  // Wait for Enter or timeout
  await Promise.race([
    new Promise(resolve => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on('line', () => { rl.close(); resolve(); });
    }),
    new Promise(resolve => setTimeout(resolve, MAX_DURATION))
  ]);

  clearInterval(pollInterval);
  const duration = Date.now() - recordStart;
  console.log(`\n\nNagrywanie zakonczone (${Math.round(duration / 1000)}s).`);

  // Collect raw events
  let rawEvents;
  try {
    const r = await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'JSON.stringify(window.__RECORDER_EVENTS__ || [])',
      returnByValue: true
    });
    rawEvents = JSON.parse(r.result.value);
  } catch (e) {
    console.error('Nie mozna odczytac zdarzen z przegladarki.');
    ws.close();
    process.exit(1);
  }

  // Deactivate recorder
  try {
    await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'window.__RECORDER_ACTIVE__ = false',
      returnByValue: false
    });
  } catch (e) { /* ignore */ }

  ws.close();

  console.log(`Zebrano ${rawEvents.length} surowych zdarzen.`);

  if (rawEvents.length === 0) {
    console.log('Brak zdarzen - nie tworze pliku.');
    process.exit(0);
  }

  // Transform to semantic steps
  const steps = transformEvents(rawEvents);
  console.log(`Wygenerowano ${steps.length} krokow:\n`);

  for (const step of steps) {
    const confidence = step.selectors.some(s => s.lowConfidence) ? ' [!]' : '';
    console.log(`  ${step.index}. [${step.action}] ${step.description}${confidence}`);
  }

  // Ask for approval
  console.log('');
  const save = await ask('Zapisac procedure? (t/n) ');
  if (save.toLowerCase() !== 't') {
    console.log('Odrzucono.');
    process.exit(0);
  }

  // Build output JSON
  const procedure = {
    version: 1,
    metadata: {
      testId,
      category: testMeta.category,
      testName: testMeta.testName,
      recordedAt: new Date().toISOString(),
      recordedFrom: target.url,
      duration
    },
    preconditions: {
      loggedIn: !target.url.includes('/login'),
      startUrl: target.url
    },
    steps
  };

  if (!fs.existsSync(PROCEDURES_DIR)) {
    fs.mkdirSync(PROCEDURES_DIR, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(procedure, null, 2), 'utf8');
  console.log(`\nZapisano: ${outPath}`);
  console.log('Gotowe!');
}

main().catch(e => {
  console.error('Blad:', e.message);
  process.exit(1);
});
