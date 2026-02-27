FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

# 1. MUIFrontend: package.json + playwright config + e2e testy
COPY MUIFrontend/package.json MUIFrontend/package-lock.json ./
RUN npm ci --ignore-scripts
RUN npx playwright install chromium

COPY MUIFrontend/playwright.config.ts ./
COPY MUIFrontend/e2e/ ./e2e/
COPY MUIFrontend/tsconfig.json ./

# 2. Tester: skrypty, config, monitor
COPY tester/scripts/ ./scripts/
COPY tester/config/sheet-config.json ./config/sheet-config.json
COPY tester/config/sheets-service-account.json ./config/sheets-service-account.json
COPY tester/config/webhook-config.json ./config/webhook-config.json
COPY tester/monitor/ ./monitor/
COPY tester/data/ ./data/

# 3. Tester dependencies (playwright lib)
COPY tester/package.json ./tester-package.json
RUN cd /tmp && cp /app/tester-package.json package.json && npm install && cp -r node_modules/playwright /app/node_modules/ 2>/dev/null || true

ENV HEADLESS=1
ENV NODE_ENV=production
EXPOSE 8081

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "require('http').get('http://localhost:8081/api/status',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "scripts/server.js"]
