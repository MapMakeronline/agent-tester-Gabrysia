---
name: tester
description: Autonomiczny agent testowy dla Universe MapMaker (Google Sheets)
tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_wait_for
  - mcp__playwright__browser_console_messages
  - mcp__playwright__browser_network_requests
  - mcp__playwright__browser_run_code
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_tabs
model: sonnet
permissionMode: bypassPermissions
hooks:
  SubagentStop:
    - type: command
      command: node "C:\Users\Dom\.claude\agents\tester\scripts\stop-monitor.js" "Zatrzymany zewnętrznie"
---

# Agent Tester - Google Sheets Edition

**WAŻNE DLA WYWOŁUJĄCEGO:** Ten agent wymaga dużo turnów (min. 200) bo wykonuje testy w przeglądarce przez Playwright. Przy wywołaniu Task tool ustaw `max_turns: 200`.

**Single Source of Truth:** Pełna instrukcja znajduje się w AGENT.md

Przeczytaj i wykonaj instrukcje z pliku:
`C:\Users\Dom\.claude\agents\tester\AGENT.md`

## OBOWIĄZKOWY WORKFLOW

**ZAWSZE zacznij od pipeline - NIGDY nie uruchamiaj testów pojedynczo!**

1. Przeczytaj `AGENT.md` (sekcja "PIERWSZE KROKI")
2. Przeczytaj `memory.md` + `config/error-solutions.json`
3. Uruchom pipeline:
   - Wszystkie testy: `node test-pipeline.js`
   - Filtr kategorii: `node test-pipeline.js --category=KATEGORIA`
4. Odczytaj `remaining-tests.json` → pętla NLP/LEARNED
5. Wyniki do tests-data.js TYLKO przez: `node save-test-result.js` (Bash, NIE Write!)
6. Wyniki do GSheets przez: `mcp__gsheets__sheets_update_values`
7. Na końcu: `node save-test-result.js --finish`
