#!/bin/bash
# Deploy E2E Tester na GKE
#
# Wymagania:
#   - gcloud auth login
#   - kubectl skonfigurowany na klaster GKE
#   - Docker
#
# Użycie:
#   ./deploy.sh          # build + push + deploy
#   ./deploy.sh --build  # tylko build + push
#   ./deploy.sh --apply  # tylko apply manifesty

set -e

PROJECT="universe-mapmaker"
IMAGE="gcr.io/${PROJECT}/e2e-tester"
TAG=$(date +%Y%m%d-%H%M%S)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TESTER_DIR="$(dirname "$SCRIPT_DIR")"

# Przygotuj kontekst budowania
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

echo "=== Przygotowuję kontekst budowania ==="

# Kopiuj MUIFrontend (tylko to co potrzebne)
mkdir -p "$BUILD_DIR/MUIFrontend/e2e"
cp "$HOME/MUIFrontend/package.json" "$BUILD_DIR/MUIFrontend/"
cp "$HOME/MUIFrontend/package-lock.json" "$BUILD_DIR/MUIFrontend/" 2>/dev/null || true
cp "$HOME/MUIFrontend/playwright.config.ts" "$BUILD_DIR/MUIFrontend/"
cp "$HOME/MUIFrontend/tsconfig.json" "$BUILD_DIR/MUIFrontend/" 2>/dev/null || true
cp -r "$HOME/MUIFrontend/e2e/" "$BUILD_DIR/MUIFrontend/e2e/"

# Kopiuj tester
mkdir -p "$BUILD_DIR/tester"
cp -r "$TESTER_DIR/scripts" "$BUILD_DIR/tester/"
cp -r "$TESTER_DIR/config" "$BUILD_DIR/tester/"
cp -r "$TESTER_DIR/monitor" "$BUILD_DIR/tester/"
cp -r "$TESTER_DIR/data" "$BUILD_DIR/tester/" 2>/dev/null || true
cp "$TESTER_DIR/package.json" "$BUILD_DIR/tester/"
cp "$TESTER_DIR/Dockerfile" "$BUILD_DIR/Dockerfile"

# Usuń wrażliwe pliki jeśli nie istnieją
touch "$BUILD_DIR/tester/config/sheets-service-account.json" 2>/dev/null || true
touch "$BUILD_DIR/tester/config/webhook-config.json" 2>/dev/null || true

if [[ "$1" != "--apply" ]]; then
    echo "=== Build Docker image ==="
    cd "$BUILD_DIR"
    docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .

    echo "=== Push to GCR ==="
    docker push "${IMAGE}:${TAG}"
    docker push "${IMAGE}:latest"
    echo "Image: ${IMAGE}:${TAG}"
fi

if [[ "$1" != "--build" ]]; then
    echo "=== Apply K8s manifests ==="
    kubectl apply -f "$SCRIPT_DIR/secret.yaml"
    kubectl apply -f "$SCRIPT_DIR/deployment.yaml"

    echo "=== Restart deployment ==="
    kubectl rollout restart deployment/e2e-tester
    kubectl rollout status deployment/e2e-tester --timeout=120s

    echo ""
    echo "=== DONE ==="
    echo "Dashboard: https://tests.universemapmaker.online"
    echo "API:       https://tests.universemapmaker.online/api/status"
fi
