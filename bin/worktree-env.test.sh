#!/usr/bin/env bash
set -uo pipefail

ENV_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/worktree-env.sh"
FAILURES=0

assert_eq() {
  if [[ "$2" == "$3" ]]; then
    echo "ok   $1"
  else
    echo "FAIL $1: expected '$2', got '$3'"
    FAILURES=$((FAILURES + 1))
  fi
}

SANDBOX="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$SANDBOX"' EXIT

git init -q -b main "$SANDBOX/repo"
git -C "$SANDBOX/repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$SANDBOX/repo" branch feature
git -C "$SANDBOX/repo" branch stray
git -C "$SANDBOX/repo" worktree add -q "$SANDBOX/repo-feature" feature
git -C "$SANDBOX/repo" worktree add -q "$SANDBOX/repo-stray" stray
MAIN="$SANDBOX/repo"
WT="$SANDBOX/repo-feature"
STRAY="$SANDBOX/repo-stray"

exported_after_source() {
  (cd "$1" && env -i HOME="$HOME" PATH="$PATH" bash -c 'before=$(compgen -e | sort); source "$0" >/dev/null 2>&1; comm -13 <(echo "$before") <(compgen -e | sort) | tr "\n" " "' "$ENV_SH")
}

value_after_source() {
  (cd "$1" && source "$ENV_SH" >/dev/null 2>&1 && eval "echo \"\$$2\"")
}

EXPECTED_NAMES="$(printf '%s\n' \
  ODB_SLOT COMPOSE_PROJECT_NAME \
  APP_PORT SUPABASE_API_PORT SUPABASE_DB_PORT SUPABASE_STUDIO_PORT MAILPIT_UI_PORT MAILPIT_SMTP_PORT \
  TEMPORAL_PORT TEMPORAL_UI_PORT NANGO_PORT DOCUMENSO_PORT GOTENBERG_PORT E2E_STAND_IN_PORT \
  NOVU_API_PORT NOVU_WS_PORT NOVU_DASHBOARD_PORT DOCLING_PORT PROMETHEUS_PORT GRAFANA_PORT LOKI_PORT \
  TEMPO_PORT PYROSCOPE_PORT OTEL_COLLECTOR_GRPC_PORT OTEL_COLLECTOR_HTTP_PORT OTEL_COLLECTOR_HEALTH_PORT BLACKBOX_EXPORTER_PORT \
  SUPABASE_URL SUPABASE_DB_URL SUPABASE_DB_CONTAINER NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL \
  TEMPORAL_ADDRESS DOCUMENSO_URL NANGO_HOST GOTENBERG_URL EMAIL_HOST EMAIL_PORT \
  NOVU_API_URL NOVU_API_ROOT_URL NOVU_WS_URL DOCLING_URL OTEL_EXPORTER_OTLP_ENDPOINT PYROSCOPE_SERVER_ADDRESS \
  | sort | tr '\n' ' ')"

assert_eq "main exports exactly the contract" "$EXPECTED_NAMES" "$(exported_after_source "$MAIN")"

while read -r name want; do
  assert_eq "slot 0 $name" "$want" "$(value_after_source "$MAIN" "$name")"
done <<'EOF'
ODB_SLOT 0
COMPOSE_PROJECT_NAME opendealbook
APP_PORT 3000
SUPABASE_API_PORT 54321
SUPABASE_DB_PORT 54322
SUPABASE_STUDIO_PORT 54323
MAILPIT_UI_PORT 54324
MAILPIT_SMTP_PORT 54325
TEMPORAL_PORT 7233
TEMPORAL_UI_PORT 8233
NANGO_PORT 3003
DOCUMENSO_PORT 3005
GOTENBERG_PORT 3009
E2E_STAND_IN_PORT 4510
NOVU_API_PORT 3006
NOVU_WS_PORT 3007
NOVU_DASHBOARD_PORT 3008
DOCLING_PORT 5001
PROMETHEUS_PORT 19090
GRAFANA_PORT 3001
LOKI_PORT 13100
TEMPO_PORT 3200
PYROSCOPE_PORT 4040
OTEL_COLLECTOR_GRPC_PORT 14317
OTEL_COLLECTOR_HTTP_PORT 14318
OTEL_COLLECTOR_HEALTH_PORT 13133
BLACKBOX_EXPORTER_PORT 9115
SUPABASE_URL http://127.0.0.1:54321
SUPABASE_DB_URL postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_DB_CONTAINER opendealbook-db-1
NEXT_PUBLIC_SITE_URL http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL http://127.0.0.1:54321
TEMPORAL_ADDRESS 127.0.0.1:7233
DOCUMENSO_URL http://localhost:3005
NANGO_HOST http://localhost:3003
GOTENBERG_URL http://localhost:3009
EMAIL_HOST 127.0.0.1
EMAIL_PORT 54325
NOVU_API_URL http://localhost:3006
NOVU_API_ROOT_URL http://localhost:3006
NOVU_WS_URL http://localhost:3007
DOCLING_URL http://localhost:5001
OTEL_EXPORTER_OTLP_ENDPOINT http://localhost:14318
PYROSCOPE_SERVER_ADDRESS http://localhost:4040
EOF

printf '{"%s": 2}\n' "$WT" > "$MAIN/.worktrees.json"

assert_eq "worktree exports exactly the contract" "$EXPECTED_NAMES" "$(exported_after_source "$WT")"

while read -r name want; do
  assert_eq "slot 2 $name" "$want" "$(value_after_source "$WT" "$name")"
done <<'EOF'
ODB_SLOT 2
COMPOSE_PROJECT_NAME opendealbook-wt2
APP_PORT 56080
SUPABASE_API_PORT 56081
SUPABASE_DB_PORT 56082
SUPABASE_STUDIO_PORT 56083
MAILPIT_UI_PORT 56084
MAILPIT_SMTP_PORT 56085
TEMPORAL_PORT 56086
TEMPORAL_UI_PORT 56087
NANGO_PORT 56088
DOCUMENSO_PORT 56089
GOTENBERG_PORT 56090
E2E_STAND_IN_PORT 56091
NOVU_API_PORT 56095
NOVU_WS_PORT 56096
NOVU_DASHBOARD_PORT 56097
DOCLING_PORT 56098
PROMETHEUS_PORT 56099
GRAFANA_PORT 56100
LOKI_PORT 56101
TEMPO_PORT 56102
PYROSCOPE_PORT 56103
OTEL_COLLECTOR_GRPC_PORT 56104
OTEL_COLLECTOR_HTTP_PORT 56105
OTEL_COLLECTOR_HEALTH_PORT 56106
BLACKBOX_EXPORTER_PORT 56107
SUPABASE_URL http://127.0.0.1:56081
SUPABASE_DB_URL postgresql://postgres:postgres@127.0.0.1:56082/postgres
SUPABASE_DB_CONTAINER opendealbook-wt2-db-1
NEXT_PUBLIC_SITE_URL http://localhost:56080
NEXT_PUBLIC_SUPABASE_URL http://127.0.0.1:56081
TEMPORAL_ADDRESS 127.0.0.1:56086
DOCUMENSO_URL http://localhost:56089
NANGO_HOST http://localhost:56088
GOTENBERG_URL http://localhost:56090
EMAIL_HOST 127.0.0.1
EMAIL_PORT 56085
NOVU_API_URL http://localhost:56095
NOVU_API_ROOT_URL http://localhost:56095
NOVU_WS_URL http://localhost:56096
DOCLING_URL http://localhost:56098
OTEL_EXPORTER_OTLP_ENDPOINT http://localhost:56105
PYROSCOPE_SERVER_ADDRESS http://localhost:56103
EOF

assert_eq "slot 49 ends the block range at 57999" 57999 "$( (cd "$WT" && source "$ENV_SH" && echo $(( $(odb_port 49 APP_PORT) + 39 ))) )"

cat > "$SANDBOX/main.env" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SITE_URL=http://localhost:3000
TEMPORAL_ADDRESS=localhost:7233
DOCUMENSO_URL=http://localhost:3005
NANGO_HOST=http://localhost:3003
GOTENBERG_URL=http://localhost:3009
DOCUMENSO_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/documenso
EMAIL_PORT=54325
PORT=3000
E2E_STAND_IN_PORT=4510
NOVU_API_URL=http://localhost:3006
NOVU_API_ROOT_URL=http://localhost:3006
NOVU_WS_URL=http://localhost:3007
DOCLING_URL=http://localhost:5001
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:14318
PYROSCOPE_SERVER_ADDRESS=http://localhost:4040
REMOTE_API_URL=https://api.example.com:4443
TIMEOUT_MS=3000
SUPABASE_SERVICE_ROLE_KEY=abc
EOF
assert_eq "env.local rewrite moves every slot port and leaves the rest" "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56081
NEXT_PUBLIC_SITE_URL=http://localhost:56080
TEMPORAL_ADDRESS=localhost:56086
DOCUMENSO_URL=http://localhost:56089
NANGO_HOST=http://localhost:56088
GOTENBERG_URL=http://localhost:56090
DOCUMENSO_WEBHOOK_URL=http://host.docker.internal:56080/api/webhooks/documenso
EMAIL_PORT=56085
PORT=56080
E2E_STAND_IN_PORT=56091
NOVU_API_URL=http://localhost:56095
NOVU_API_ROOT_URL=http://localhost:56095
NOVU_WS_URL=http://localhost:56096
DOCLING_URL=http://localhost:56098
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:56105
PYROSCOPE_SERVER_ADDRESS=http://localhost:56103
REMOTE_API_URL=https://api.example.com:4443
TIMEOUT_MS=3000
SUPABASE_SERVICE_ROLE_KEY=abc" "$(cd "$WT" && source "$ENV_SH" && odb_rewrite_env_file "$SANDBOX/main.env")"

assert_eq "unregistered worktree exports nothing" "" "$(exported_after_source "$STRAY")"
assert_eq "unregistered worktree says to run worktree-up first" 1 \
  "$( (cd "$STRAY" && source "$ENV_SH" 2>&1 >/dev/null) | grep -c 'run bin/worktree-up.sh first')"

allocate() { (cd "$WT" && source "$ENV_SH" >/dev/null 2>&1 && odb_slot_allocate "$1"); }
free_slot() { (cd "$WT" && source "$ENV_SH" >/dev/null 2>&1 && odb_slot_free "$1"); }

assert_eq "allocate takes lowest free slot" 1 "$(allocate /x/a)"
assert_eq "allocate skips registered slot 2" 3 "$(allocate /x/b)"
assert_eq "allocate skips taken slots" 4 "$(allocate /x/c)"
assert_eq "allocate is idempotent for a registered path" 1 "$(allocate /x/a)"
free_slot /x/b
assert_eq "free removes the path" "" "$(jq -r '.["/x/b"] // empty' "$MAIN/.worktrees.json")"
assert_eq "free keeps other paths" 2 "$(jq -r --arg p "$WT" '.[$p]' "$MAIN/.worktrees.json")"
assert_eq "freed slot is reused" 3 "$(allocate /x/d)"
free_slot /x/b
assert_eq "free of an unregistered path leaves the registry intact" 4 "$(jq 'length' "$MAIN/.worktrees.json")"

for i in 1 2 3 4 5 6 7 8; do allocate "/race/$i" > "$SANDBOX/race.$i" & done
wait
assert_eq "concurrent allocations get distinct slots" 8 "$(cat "$SANDBOX"/race.* | sort -u | wc -l | tr -d ' ')"
assert_eq "concurrent allocations are all recorded" 8 "$(jq '[keys[] | select(startswith("/race/"))] | length' "$MAIN/.worktrees.json")"

DEAD_PID=$(bash -c 'echo $$')
mkdir "$MAIN/.git/odb-slots.lock"
echo "$DEAD_PID" > "$MAIN/.git/odb-slots.lock/pid"
set -m
allocate /stale/a > "$SANDBOX/stale.out" &
STALE_WAITER=$!
set +m
for _ in $(seq 50); do kill -0 "$STALE_WAITER" 2>/dev/null || break; sleep 0.1; done
kill -- "-$STALE_WAITER" 2>/dev/null
wait "$STALE_WAITER" 2>/dev/null
assert_eq "a lock held by a dead PID is taken over" 13 "$(cat "$SANDBOX/stale.out")"
assert_eq "the taken-over lock is released" no "$([[ -e "$MAIN/.git/odb-slots.lock" ]] && echo yes || echo no)"
rm -f "$MAIN/.git/odb-slots.lock/pid"
rmdir "$MAIN/.git/odb-slots.lock" 2>/dev/null

echo 'not json' > "$MAIN/.worktrees.json"
(cd "$MAIN" && source "$ENV_SH" && odb_slot_free /x/a) 2>/dev/null
assert_eq "a failed registry write leaves nothing visible to git" "?? .worktrees.json" "$(git -C "$MAIN" status --porcelain)"

ODB_PORTS_TABLE=$(cd "$MAIN" && source "$ENV_SH" >/dev/null 2>&1 && echo "$ODB_PORTS")
COMPOSE_PORT_ENTRIES=$(awk '/^[[:space:]]*ports:/ { in_ports = 1; next } in_ports && /^[[:space:]]*- / { print; next } { in_ports = 0 }' "$(dirname "$ENV_SH")/../docker-compose.yml")
unslotted=""
while read -r entry; do
  if [[ "$entry" =~ \$\{([A-Z0-9_]+):-([0-9]+)\} ]]; then
    compose_name=${BASH_REMATCH[1]}
    compose_default=${BASH_REMATCH[2]}
    slot_default=$(awk -v n="$compose_name" '$1 == n { print $3 }' <<< "$ODB_PORTS_TABLE")
    [[ "$slot_default" == "$compose_default" ]] || unslotted+="$compose_name:$compose_default "
  else
    unslotted+="hardcoded:$entry "
  fi
done <<< "$COMPOSE_PORT_ENTRIES"
assert_eq "compose has port entries to check" yes "$([[ -n "$COMPOSE_PORT_ENTRIES" ]] && echo yes || echo no)"
assert_eq "every compose host port has an ODB_PORTS row with the same default" "" "$unslotted"

echo
if [[ $FAILURES -gt 0 ]]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "all passed"
