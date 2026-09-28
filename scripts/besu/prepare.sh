#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/packages/contracts/besu/networkFiles"
COUNT=4

command -v besu >/dev/null || { echo "Besu 실행 파일이 없습니다. Ubuntu WSL에 Besu를 설치한 뒤 다시 실행하세요." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl이 필요합니다." >&2; exit 1; }
mkdir -p "$OUT"
if [[ -e "$OUT/genesis.json" ]]; then
  echo "기존 네트워크 파일이 있습니다: $OUT" >&2
  echo "키 재생성을 막기 위해 중단합니다. 백업 후 직접 정리하세요." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat >"$TMP/qbft-config.json" <<JSON
{
  "genesis": {
    "config": {
      "chainId": 20260928,
      "berlinBlock": 0,
      "londonBlock": 0,
      "qbft": { "blockperiodseconds": 2, "epochlength": 30000, "requesttimeoutseconds": 10 }
    },
    "nonce": "0x0",
    "timestamp": "0x0",
    "gasLimit": "0x1c9c380",
    "difficulty": "0x1",
    "mixHash": "0x63746963616c2d62797465732d686173682d666f722d67656e657369732d3031",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "alloc": {},
    "number": "0x0",
    "gasUsed": "0x0",
    "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "baseFeePerGas": "0x7"
  },
  "blockchain": { "nodes": { "generate": true, "count": $COUNT } }
}
JSON
besu operator generate-blockchain-config --config-file="$TMP/qbft-config.json" --to="$TMP/generated" --private-key-file-name=key

GENESIS="$(find "$TMP/generated" -name genesis.json -print -quit)"
[[ -n "$GENESIS" ]] || { echo "Besu가 genesis.json을 만들지 않았습니다." >&2; exit 1; }
cp "$GENESIS" "$OUT/genesis.json"
for i in 0 1 2 3; do
  src="$(find "$TMP/generated/keys" -mindepth 1 -maxdepth 1 -type d | sort | sed -n "$((i + 1))p")"
  [[ -n "$src" ]] || { echo "validator $i 키를 찾을 수 없습니다." >&2; exit 1; }
  mkdir -p "$OUT/validator-$i/data"
  cp "$src/key" "$OUT/validator-$i/key"
  cp "$src/key.pub" "$OUT/validator-$i/key.pub"
done
chmod 600 "$OUT"/validator-*/key
echo "생성 완료: $OUT"
echo "주의: validator 키는 로컬 개발용입니다. 저장소에 커밋하지 마세요."
