#!/bin/sh
set -eu

# APP_TARGET (or the first argument) selects the process this container runs.
TARGET="${1:-${APP_TARGET:-web}}"

case "$TARGET" in
  web)
    exec node /app/web/apps/web/server.js
    ;;
  worker)
    cd /app/worker/apps/workers
    exec node --import tsx src/worker.ts
    ;;
  *)
    echo "Unknown APP_TARGET: $TARGET (expected 'web' or 'worker')" >&2
    exit 1
    ;;
esac
