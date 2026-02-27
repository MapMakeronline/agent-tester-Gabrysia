#!/bin/bash
# Deploy E2E Tester na GKE
#
# Repo: github.com/gabriela-j/tester-agent (self-contained)
# Build: Cloud Build (gcloud builds submit) - nie wymaga lokalnego Dockera
#
# Wymagania:
#   - gcloud auth login
#   - gcloud config set project universe-mapmaker
#   - kubectl skonfigurowany na klaster GKE
#
# Użycie:
#   ./deploy.sh                    # build (Cloud Build) + deploy
#   ./deploy.sh --build            # tylko build + push do GCR
#   ./deploy.sh --apply            # tylko apply manifesty K8s
#   ./deploy.sh --local            # build lokalnym Dockerem (wymaga Docker Desktop)
#   ./deploy.sh --secrets          # kopiuj secrets do kontekstu przed buildem

set -e

PROJECT="universe-mapmaker"
IMAGE="gcr.io/${PROJECT}/e2e-tester"
TAG=$(date +%Y%m%d-%H%M%S)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== E2E Tester Deploy ==="
echo "Image: ${IMAGE}:${TAG}"
echo "Repo:  ${REPO_DIR}"
echo ""

# ========== SECRETS ==========
# Kopiuj prawdziwe secrets do config/ (gitignored) przed buildem
if [[ "$1" == "--secrets" || "$2" == "--secrets" ]]; then
    echo "=== Kopiuj secrets ==="
    SECRETS_SRC="${HOME}/.claude/agents/tester/config"
    for f in sheets-service-account.json sheet-config.json webhook-config.json credentials.js; do
        if [[ -f "$SECRETS_SRC/$f" ]]; then
            cp "$SECRETS_SRC/$f" "$REPO_DIR/config/$f"
            echo "  Skopiowano: $f"
        fi
    done
    echo ""
fi

# ========== BUILD ==========
if [[ "$1" != "--apply" ]]; then

    if [[ "$1" == "--local" ]]; then
        # Build lokalnym Dockerem
        echo "=== Build Docker (local) ==="
        cd "$REPO_DIR"
        docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .

        echo "=== Push to GCR ==="
        docker push "${IMAGE}:${TAG}"
        docker push "${IMAGE}:latest"
    else
        # Build przez Cloud Build (nie wymaga lokalnego Dockera)
        echo "=== Build Docker (Cloud Build) ==="
        cd "$REPO_DIR"
        gcloud builds submit \
            --tag "${IMAGE}:${TAG}" \
            --project "${PROJECT}" \
            --timeout=600s \
            --machine-type=e2-highcpu-8

        # Tag as latest
        echo "=== Tag as latest ==="
        gcloud container images add-tag \
            "${IMAGE}:${TAG}" \
            "${IMAGE}:latest" \
            --quiet
    fi

    echo "Image: ${IMAGE}:${TAG}"
fi

# ========== DEPLOY ==========
if [[ "$1" != "--build" ]]; then
    echo "=== Apply K8s manifests ==="
    kubectl apply -f "$SCRIPT_DIR/secret.yaml"
    kubectl apply -f "$SCRIPT_DIR/deployment.yaml"

    # Ustaw nowy image tag (nie tylko latest)
    kubectl set image deployment/e2e-tester tester="${IMAGE}:${TAG}" 2>/dev/null || true

    echo "=== Restart deployment ==="
    kubectl rollout restart deployment/e2e-tester
    kubectl rollout status deployment/e2e-tester --timeout=120s

    echo ""
    echo "=== DONE ==="
    echo "Dashboard: https://tests.universemapmaker.online"
    echo "API:       https://tests.universemapmaker.online/api/status"
fi
