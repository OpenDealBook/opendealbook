#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
source "$(dirname "${BASH_SOURCE[0]}")/worktree-env.sh"

docker compose -p "$COMPOSE_PROJECT_NAME" --profile '*' up -d

for _ in $(seq 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$SUPABASE_DB_CONTAINER")" == healthy ]] && exit 0
  sleep 2
done
echo "worktree-start: $SUPABASE_DB_CONTAINER not healthy after 120s" >&2
exit 1
