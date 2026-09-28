#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIDS="$ROOT/packages/contracts/besu/run"
for i in 0 1 2 3; do
  file="$PIDS/validator-$i.pid"
  [[ -f "$file" ]] || continue
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid"; fi
  rm -f "$file"
done
echo "로컬 Besu 노드 종료 요청 완료"
