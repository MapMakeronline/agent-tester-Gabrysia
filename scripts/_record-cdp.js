/**
 * Non-interactive CDP recorder - saves raw events after timeout.
 * Usage: node _record-cdp.js TC-TABLE-006 90
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_ID = process.argv[2] || 'TC-TABLE-006';
const DURATION = parseInt(process.argv[3] || '90', 10) * 1000;
const PORT = parseInt(process.argv[4] || '9222', 10);
const PROCEDURES_DIR = path.join(__dirname, '..', 'data', 'learned-procedures');

const RECORDER_SCRIPT = `
(() => {
  window.__RECORDER_EVENTS__ = [];
  window.__RECORDER_ACTIVE__ = true;

  function getElementInfo(el) {
    if (!el || !el.tagName) return null;
    const rect = el.getBoundingClientRect();
    const info = {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute('role') || null,
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
      const tagRoles = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', li: 'listitem', option: 'option', img: 'img' };
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
    if (info.isCanvas) { info.canvasWidth = rect.width; info.canvasHeight = rect.height; }
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
  window.addEventListener('popstate', () => { record('navigate', { url: location.href }); });

  return 'RECORDER_INSTALLED';
})();
`;

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

(async () => {
  console.log(`=== CDP Recorder: ${TEST_ID} | ${DURATION/1000}s ===`);
  const pages = await httpGet(`http://localhost:${PORT}/json`);
  const target = pages.find(p => p.url.includes('universe-mapmaker') && p.type === 'page')
    || pages.find(p => p.url.startsWith('http') && p.type === 'page');
  if (!target) { console.error('Brak strony universe-mapmaker.'); process.exit(1); }
  console.log(`Strona: ${target.url}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  await cdpSend(ws, 'Runtime.enable');
  const res = await cdpSend(ws, 'Runtime.evaluate', { expression: RECORDER_SCRIPT, returnByValue: true });
  console.log(`Recorder: ${res.result.value}`);
  console.log(`>>> WYKONAJ TEST W CHROME! Nagrywam ${DURATION/1000}s... <<<`);

  const start = Date.now();
  const poll = setInterval(async () => {
    try {
      const r = await cdpSend(ws, 'Runtime.evaluate', { expression: 'window.__RECORDER_EVENTS__?.length || 0', returnByValue: true });
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`\r  Zdarzenia: ${r.result.value} | Czas: ${elapsed}/${DURATION/1000}s  `);
    } catch(e) {}
  }, 1000);

  await new Promise(r => setTimeout(r, DURATION));
  clearInterval(poll);

  const evtResult = await cdpSend(ws, 'Runtime.evaluate', { expression: 'JSON.stringify(window.__RECORDER_EVENTS__ || [])', returnByValue: true });
  const events = JSON.parse(evtResult.result.value);
  try { await cdpSend(ws, 'Runtime.evaluate', { expression: 'window.__RECORDER_ACTIVE__ = false', returnByValue: false }); } catch(e) {}
  ws.close();

  console.log(`\n\nZebrano ${events.length} zdarzen.`);
  if (events.length > 0) {
    if (!fs.existsSync(PROCEDURES_DIR)) fs.mkdirSync(PROCEDURES_DIR, { recursive: true });
    fs.writeFileSync(path.join(PROCEDURES_DIR, `${TEST_ID}-raw.json`), JSON.stringify(events, null, 2));
    console.log(`Zapisano: data/learned-procedures/${TEST_ID}-raw.json`);
  } else {
    console.log('Brak zdarzen.');
  }
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
