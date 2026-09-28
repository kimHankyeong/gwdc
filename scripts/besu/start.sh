#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NET="$ROOT/packages/contracts/besu/networkFiles"
PIDS="$ROOT/packages/contracts/besu/run"
[[ -f "$NET/genesis.json" ]] || { echo "먼저 npm run besu:prepare 실행" >&2; exit 1; }
command -v besu >/dev/null || { echo "Besu가 PATH에 없습니다." >&2; exit 1; }
mkdir -p "$PIDS"
for i in 0 1 2 3; do
  [[ ! -f "$PIDS/validator-$i.pid" ]] || { echo "기존 프로세스 pid 파일이 있습니다: validator-$i" >&2; exit 1; }
done
bootnodes=()
for i in 0 1 2 3; do
  pub="$(tr -d '\r\n' < "$NET/validator-$i/key.pub" | sed 's/^0x//')"
  bootnodes+=("enode://$pub@127.0.0.1:$((30303+i))")
done
joined="$(IFS=,; echo "${bootnodes[*]}")"
for i in 0 1 2 3; do
  nohup besu \
    --data-path="$NET/validator-$i/data" \
    --genesis-file="$NET/genesis.json" \
    --node-private-key-file="$NET/validator-$i/key" \
    --network-id=20260928 \
    --p2p-host=127.0.0.1 --p2p-port="$((30303+i))" --p2p-enabled=true \
    --bootnodes="$joined" --discovery-enabled=false \
    --rpc-http-enabled=true --rpc-http-host=127.0.0.1 --rpc-http-port="$((8545+i))" \
    --rpc-http-api=ETH,NET,WEB3,QBFT,TXPOOL \
    --host-allowlist=127.0.0.1,localhost \
    --logging=INFO >"$PIDS/validator-$i.log" 2>&1 &
  echo $! > "$PIDS/validator-$i.pid"
done
echo "검증 노드 4개 시작 요청됨. 로그: $PIDS/validator-*.log"
