# shellcheck shell=bash
ODB_PORTS="APP_PORT 0 3000
SUPABASE_API_PORT 1 54321
SUPABASE_DB_PORT 2 54322
SUPABASE_STUDIO_PORT 3 54323
MAILPIT_UI_PORT 4 54324
MAILPIT_SMTP_PORT 5 54325
TEMPORAL_PORT 6 7233
TEMPORAL_UI_PORT 7 8233
NANGO_PORT 8 3003
DOCUMENSO_PORT 9 3005
GOTENBERG_PORT 10 3009
E2E_STAND_IN_PORT 11 4510
NOVU_API_PORT 15 3006
NOVU_WS_PORT 16 3007
NOVU_DASHBOARD_PORT 17 3008
DOCLING_PORT 18 5001
PROMETHEUS_PORT 19 19090
GRAFANA_PORT 20 3001
LOKI_PORT 21 13100
TEMPO_PORT 22 3200
PYROSCOPE_PORT 23 4040
OTEL_COLLECTOR_GRPC_PORT 24 14317
OTEL_COLLECTOR_HTTP_PORT 25 14318
OTEL_COLLECTOR_HEALTH_PORT 26 13133"

odb_ports_for() {
  local slot=$1 name offset default
  while read -r name offset default; do
    if (( slot == 0 )); then
      echo "$name $default"
    else
      echo "$name $(( 56000 + 40 * slot + offset ))"
    fi
  done <<< "$ODB_PORTS"
}

odb_port() {
  local slot=$1 port_name=$2
  odb_ports_for "$slot" | awk -v n="$port_name" '$1 == n { print $2 }'
}

odb_project() {
  local slot=$1
  if (( slot == 0 )); then echo opendealbook; else echo "opendealbook-wt$slot"; fi
}

odb_rewrite_env_file() {
  local source_file=$1 sedscript="" default port
  while read -r _ default _ port; do
    sedscript+="s#(localhost|127\.0\.0\.1|host\.docker\.internal):$default([^0-9]|\$)#\1:$port\2#g"$'\n'
    sedscript+="s#^([A-Z0-9_]*PORT)=$default\$#\1=$port#"$'\n'
  done < <(paste -d ' ' <(odb_ports_for 0) <(odb_ports_for "$ODB_SLOT"))
  sed -E "$sedscript" "$source_file"
}

odb_git_common_dir() {
  git rev-parse --path-format=absolute --git-common-dir
}

odb_main_root() {
  dirname "$(odb_git_common_dir)"
}

odb_registry() {
  echo "$(odb_main_root)/.worktrees.json"
}

odb_slot_of() {
  local path=$1
  if [[ "$path" == "$(odb_main_root)" ]]; then
    echo 0
  elif [[ -f "$(odb_registry)" ]]; then
    jq -r --arg p "$path" '.[$p] // empty' "$(odb_registry)"
  fi
}

odb_write_registry() {
  local registry tmp
  registry=$(odb_registry)
  tmp="$(odb_git_common_dir)/odb-worktrees.json.tmp"
  jq "$@" "$registry" > "$tmp" && mv "$tmp" "$registry"
}

odb_with_registry_lock() (
  lock="$(odb_git_common_dir)/odb-slots.lock"
  until mkdir "$lock" 2>/dev/null; do
    holder=$(cat "$lock/pid" 2>/dev/null)
    if [[ -n "$holder" ]] && ! kill -0 "$holder" 2>/dev/null; then
      rm -f "$lock/pid"
      rmdir "$lock" 2>/dev/null
    else
      sleep 0.1
    fi
  done
  echo "$BASHPID" > "$lock/pid"
  trap 'rm -f "$lock/pid"; rmdir "$lock"' EXIT
  "$@"
)

odb_slot_allocate() {
  local path=$1
  odb_with_registry_lock odb_slot_allocate_unlocked "$path"
}

odb_slot_allocate_unlocked() {
  local path=$1 slot
  [[ -f "$(odb_registry)" ]] || echo '{}' > "$(odb_registry)"
  slot=$(odb_slot_of "$path")
  if [[ -z "$slot" ]]; then
    slot=$(jq -r '[.[]] as $taken | first(range(1; 50) | select(. as $n | $taken | any(. == $n) | not)) // empty' "$(odb_registry)")
    if [[ -z "$slot" ]]; then
      echo "worktree-env: all slots 1..49 are taken in $(odb_registry)" >&2
      return 1
    fi
    odb_write_registry --arg p "$path" --argjson n "$slot" '.[$p] = $n'
  fi
  echo "$slot"
}

odb_slot_free() {
  local path=$1
  odb_with_registry_lock odb_write_registry --arg p "$path" 'del(.[$p])'
}

_odb_slot=$(odb_slot_of "$(git rev-parse --show-toplevel)")
if [[ -z "$_odb_slot" ]]; then
  echo "worktree-env: $(git rev-parse --show-toplevel) has no slot; run bin/worktree-up.sh first" >&2
  return 1
fi

export ODB_SLOT=$_odb_slot
COMPOSE_PROJECT_NAME=$(odb_project "$ODB_SLOT")
export COMPOSE_PROJECT_NAME
while read -r _odb_name _odb_port; do
  export "$_odb_name=$_odb_port"
done < <(odb_ports_for "$ODB_SLOT")
export SUPABASE_URL=http://127.0.0.1:$SUPABASE_API_PORT
export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:$SUPABASE_DB_PORT/postgres
export SUPABASE_DB_CONTAINER=$COMPOSE_PROJECT_NAME-db-1
export NEXT_PUBLIC_SITE_URL=http://localhost:$APP_PORT
export NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
export TEMPORAL_ADDRESS=127.0.0.1:$TEMPORAL_PORT
export DOCUMENSO_URL=http://localhost:$DOCUMENSO_PORT
export NANGO_HOST=http://localhost:$NANGO_PORT
export GOTENBERG_URL=http://localhost:$GOTENBERG_PORT
export EMAIL_HOST=127.0.0.1
export EMAIL_PORT=$MAILPIT_SMTP_PORT
export NOVU_API_URL=http://localhost:$NOVU_API_PORT
export NOVU_API_ROOT_URL=$NOVU_API_URL
export NOVU_WS_URL=http://localhost:$NOVU_WS_PORT
export DOCLING_URL=http://localhost:$DOCLING_PORT
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:$OTEL_COLLECTOR_HTTP_PORT
export PYROSCOPE_SERVER_ADDRESS=http://localhost:$PYROSCOPE_PORT
