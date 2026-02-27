import * as http from 'http';

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

/**
 * Global setup: verifies Chrome is reachable on CDP port before any tests run.
 * Fails fast with a clear error instead of cryptic CDP connection timeouts.
 */
async function globalSetup() {
  const available = await checkCDP();
  if (!available) {
    throw new Error(
      `Chrome DevTools Protocol not available at ${CDP_URL}\n` +
      `Start Chrome with: chrome --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-dev"\n` +
      `Or run: node "C:/Users/Dom/.claude/agents/tester/scripts/init-session.js" (auto-starts Chrome)`,
    );
  }
  console.log(`[global-setup] Chrome CDP available at ${CDP_URL}`);
}

function checkCDP(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/json/version', CDP_URL);
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          console.log(`[global-setup] Chrome ${info['Browser'] || 'unknown'}`);
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export default globalSetup;
