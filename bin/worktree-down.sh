#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MAIN_ROOT=$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir)")
TARGET=${1:-$PWD}
if [[ -d "$TARGET" ]]; then
  TARGET=$(git -C "$TARGET" rev-parse --show-toplevel)
else
  TARGET="$(cd "$(dirname "$TARGET")" && pwd -P)/$(basename "$TARGET")"
fi

if [[ "$TARGET" == "$MAIN_ROOT" ]]; then
  echo "worktree-down: refusing to tear down the main repo" >&2
  exit 1
fi

if [[ -d "$TARGET" && -n "$(git -C "$TARGET" status --porcelain)" ]]; then
  echo "worktree-down: $TARGET has uncommitted changes; commit or discard them first" >&2
  exit 1
fi

cd "$MAIN_ROOT"
source "$SCRIPT_DIR/worktree-env.sh"
slot=$(odb_slot_of "$TARGET")

if [[ -n "$slot" ]]; then
  docker compose -p "$(odb_project "$slot")" --profile '*' down -v --remove-orphans
fi

if [[ -d "$TARGET" ]]; then
  git worktree remove "$TARGET"
else
  git worktree prune
fi

odb_slot_free "$TARGET"
echo "worktree-down: removed $TARGET and freed its slot"
