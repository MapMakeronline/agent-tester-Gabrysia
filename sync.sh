#!/bin/bash
# =============================================================================
#  SYNC & PUSH - Synchronizuj lokalne zmiany z GitHub + GCS
#
#  Użycie:
#    bash sync.sh                    # Sync wszystko: e2e + GitHub + GCS
#    bash sync.sh --no-push          # Tylko sync e2e + commit (bez push/GCS)
#    bash sync.sh --no-gcs           # Sync e2e + GitHub (bez GCS)
#    bash sync.sh --gcs-only         # Tylko sync do GCS (bez git)
#    bash sync.sh --e2e-only         # Tylko sync e2e z MUIFrontend
#    bash sync.sh -m "opis zmian"    # Custom commit message
#
#  Co robi:
#    1. Kopiuje e2e/ z MUIFrontend (specs, helpers, learned-procedures)
#    2. git add + commit + push na origin/main
#    3. gcloud storage rsync do GCS (backup)
# =============================================================================

set -e

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
MUIFRONTEND="$HOME/MUIFrontend"
E2E_SRC="$MUIFRONTEND/e2e"
E2E_DST="$AGENT_DIR/e2e"
GCS_BUCKET="gs://mapmaker-team-docs/claude-md/Gabrysia-md/tester-agent-config"

# Parse args
NO_PUSH=false
NO_GCS=false
GCS_ONLY=false
E2E_ONLY=false
CUSTOM_MSG=""

for arg in "$@"; do
    case $arg in
        --no-push)   NO_PUSH=true ;;
        --no-gcs)    NO_GCS=true ;;
        --gcs-only)  GCS_ONLY=true ;;
        --e2e-only)  E2E_ONLY=true ;;
        -m)          shift; CUSTOM_MSG="$1" ;;
    esac
done

echo "============================================"
echo "  SYNC: tester-agent -> GitHub + GCS"
echo "============================================"
echo ""

# --- KROK 1: Sync e2e z MUIFrontend ---
echo "[1/4] Syncing e2e/ z MUIFrontend..."

if [ ! -d "$E2E_SRC" ]; then
    echo "  WARN: $E2E_SRC nie istnieje, pomijam sync e2e"
else
    # Spec files
    cp -f "$E2E_SRC"/*.spec.ts "$E2E_DST/" 2>/dev/null && echo "  OK: *.spec.ts" || true

    # Config files
    cp -f "$E2E_SRC/fixtures.ts" "$E2E_DST/" 2>/dev/null && echo "  OK: fixtures.ts" || true
    cp -f "$E2E_SRC/global-setup.ts" "$E2E_DST/" 2>/dev/null && echo "  OK: global-setup.ts" || true
    cp -f "$E2E_SRC/playwright.config.ts" "$E2E_DST/" 2>/dev/null && echo "  OK: playwright.config.ts" || true

    # Helpers
    mkdir -p "$E2E_DST/helpers"
    cp -f "$E2E_SRC/helpers/"* "$E2E_DST/helpers/" 2>/dev/null && echo "  OK: helpers/" || true

    # Learned procedures
    mkdir -p "$E2E_DST/learned-procedures"
    cp -f "$E2E_SRC/learned-procedures/"*.json "$E2E_DST/learned-procedures/" 2>/dev/null && echo "  OK: learned-procedures/" || true

    # Scripts
    mkdir -p "$E2E_DST/scripts"
    cp -f "$E2E_SRC/scripts/"* "$E2E_DST/scripts/" 2>/dev/null && echo "  OK: scripts/" || true
fi

if [ "$E2E_ONLY" = true ]; then
    echo ""
    echo "  --e2e-only: pomijam commit/push/gcs"
    exit 0
fi

# --- GCS ONLY shortcut ---
if [ "$GCS_ONLY" = true ]; then
    echo "[GCS] Syncing to $GCS_BUCKET ..."
    gcloud storage rsync -r \
        --exclude='.*\.git.*|.*node_modules.*|.*\/data\/.*' \
        "$AGENT_DIR" "$GCS_BUCKET" 2>&1 | tail -5
    echo "  GCS sync done!"
    exit 0
fi

# --- KROK 2: Sprawdź zmiany ---
echo ""
echo "[2/4] Sprawdzam zmiany..."
cd "$AGENT_DIR"

git add -A
CHANGES=$(git diff --cached --stat)

if [ -z "$CHANGES" ]; then
    echo "  Brak zmian do commitowania."
    exit 0
fi

echo "$CHANGES"

# --- KROK 3: Commit ---
echo ""
echo "[3/4] Commituję..."

if [ -n "$CUSTOM_MSG" ]; then
    MSG="$CUSTOM_MSG"
else
    # Auto-generate message from changed files
    CHANGED_FILES=$(git diff --cached --name-only)

    # Detect what changed
    HAS_E2E=false
    HAS_SCRIPTS=false
    HAS_CONFIG=false
    HAS_AGENT=false
    HAS_OTHER=false

    while IFS= read -r file; do
        case "$file" in
            e2e/*)       HAS_E2E=true ;;
            scripts/*)   HAS_SCRIPTS=true ;;
            config/*)    HAS_CONFIG=true ;;
            AGENT.md)    HAS_AGENT=true ;;
            *)           HAS_OTHER=true ;;
        esac
    done <<< "$CHANGED_FILES"

    PARTS=""
    [ "$HAS_AGENT" = true ]   && PARTS="${PARTS}agent, "
    [ "$HAS_E2E" = true ]     && PARTS="${PARTS}e2e, "
    [ "$HAS_SCRIPTS" = true ] && PARTS="${PARTS}scripts, "
    [ "$HAS_CONFIG" = true ]  && PARTS="${PARTS}config, "
    [ "$HAS_OTHER" = true ]   && PARTS="${PARTS}other, "
    PARTS="${PARTS%, }"

    TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
    MSG="sync: update ${PARTS} (${TIMESTAMP})"
fi

git commit -m "$MSG"
echo "  Committed: $MSG"

# --- KROK 4: Push ---
if [ "$NO_PUSH" = true ]; then
    echo ""
    echo "[4/4] --no-push: pomijam push"
else
    echo ""
    echo "[4/4] Pushing to origin/main..."
    git push origin main 2>&1
    echo "  Pushed!"
fi

# --- KROK 5: GCS sync ---
if [ "$NO_GCS" = true ] || [ "$NO_PUSH" = true ]; then
    echo ""
    echo "[5/5] GCS sync pominieto (--no-gcs lub --no-push)"
else
    echo ""
    echo "[5/5] Syncing to GCS..."
    gcloud storage rsync -r \
        --exclude='.*\.git.*|.*node_modules.*|.*\/data\/.*' \
        "$AGENT_DIR" "$GCS_BUCKET" 2>&1 | tail -5
    echo "  GCS synced: $GCS_BUCKET"
fi

echo ""
echo "============================================"
echo "  DONE"
echo "============================================"
