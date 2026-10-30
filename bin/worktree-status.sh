#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir)")"
source "$SCRIPT_DIR/worktree-env.sh"

slots() {
  echo "0 $(odb_main_root)"
  [[ -f "$(odb_registry)" ]] && jq -r 'to_entries[] | "\(.value) \(.key)"' "$(odb_registry)"
  return 0
}

branch_of() {
  local path=$1
  if [[ -d "$path" ]]; then git -C "$path" rev-parse --abbrev-ref HEAD; else echo missing; fi
}

{
  echo "SLOT PROJECT BRANCH CONTAINERS $(odb_ports_for 0 | awk '{ sub(/_PORT$/, "", $1); printf "%s ", $1 }')PATH"
  slots | sort -n | while read -r slot path; do
    project=$(odb_project "$slot")
    running_count=$(docker ps -q --filter "label=com.docker.compose.project=$project" | wc -l | tr -d ' ')
    echo "$slot $project $(branch_of "$path") $running_count $(odb_ports_for "$slot" | awk '{ printf "%s ", $2 }')$path"
  done
} | column -t
