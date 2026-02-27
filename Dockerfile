FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# 1. Zależności (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
RUN npx playwright install chromium

# 2. Playwright config (e2e/playwright.config.ts -> /app root)
COPY e2e/playwright.config.ts ./playwright.config.ts
COPY e2e/ ./e2e/

# 3. Tester: skrypty, config, monitor, lib
COPY scripts/ ./scripts/
COPY config/error-solutions.json config/known-bugs.json ./config/
COPY monitor/index.html monitor/favicon.svg ./monitor/
COPY lib/ ./lib/

# 4. Pliki runtime (puste lub domyslne)
RUN mkdir -p data config monitor \
    && echo '{}' > config/sheet-config.json \
    && echo '{}' > config/webhook-config.json \
    && echo '{}' > config/sheets-service-account.json \
    && echo '{}' > data/remaining-tests.json \
    && echo '{}' > data/session-state.json \
    && echo '// empty' > monitor/tests-data.js

# 5. Env vars
# MUIFRONTEND=/app bo e2e/ i playwright.config.ts sa w /app/
ENV MUIFRONTEND=/app
ENV HEADLESS=1
ENV NODE_ENV=production
EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "require('http').get('http://localhost:8081/api/status',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "scripts/server.js"]
