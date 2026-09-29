// 실제 CLI를 별도 임시 작업 폴더에서 실행해 실패 보고와 비밀정보 비노출을 검사합니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync,
  symlinkSync, rmSync, existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Wallet } from "ethers";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ethers의 네트워크 조회만 대체하며, 실제 송신 시도는 명시적으로 실패시킵니다.
function fixture(networkUnavailable = false) {
  const root = mkdtempSync(path.join(tmpdir(), "audit-cli-test-"));
  for (const directory of ["scripts", "state", "evidence", "artifacts/contracts/AuditRecord.sol"]) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  for (const file of ["test-sepolia-audit.mjs", "audit-safety.mjs", "audit-transaction.mjs"]) {
    copyFileSync(path.join(projectRoot, "scripts", file), path.join(root, "scripts", file));
  }
  const artifact = "artifacts/contracts/AuditRecord.sol/AuditRecord.json";
  // CLI가 파일을 읽을 수 있으면 충분하며 이 테스트는 계약을 배포하지 않습니다.
  writeFileSync(path.join(root, artifact), JSON.stringify({ abi: [], bytecode: "0x6000" }));
  symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "junction");
  const preload = path.join(root, "offline.mjs");
  writeFileSync(preload, `
    // 실제 외부 요청이 발생하면 테스트를 실패시킵니다.
    import { JsonRpcProvider } from 'ethers';
    JsonRpcProvider.prototype.getNetwork = async () => {
      if (${networkUnavailable}) throw Object.assign(new Error("secret-api-token"), {code: "NETWORK_ERROR"});
      return { chainId: 11155111n };
    };
    JsonRpcProvider.prototype._send = async () => { throw new Error('NETWORK_FORBIDDEN_IN_TEST'); };
  `);
  const wallet = Wallet.createRandom();
  return {
    root,
    privateKey: wallet.privateKey,
    run: () => spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, path.join(root, "scripts/test-sepolia-audit.mjs")], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        TRACK_CHAIN_PRIVATE_KEY: wallet.privateKey,
        TRACK_RPC_URL: "https://primary.invalid/secret-api-token",
        TRACK_VERIFY_RPC_URL: "https://witness.invalid/another-secret-token",
        TRACK_AUDIT_REQUEST_ID: "test-request",
      },
    }),
    // 삭제 경로는 mkdtemp가 반환한 테스트 전용 폴더로 고정합니다.
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("CLI replaces stale success with failure and never logs secret values", () => {
  const f = fixture();
  try {
    const reportFile = path.join(f.root, "evidence/test-request.json");
    writeFileSync(reportFile, JSON.stringify({ verification: "verified", txHash: "old-success" }));
    writeFileSync(path.join(f.root, "state/test-request.json"), JSON.stringify({
      format: "authenticated-checkpoint-v1", state: {}, mac: "00".repeat(32),
    }));
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /"status":"stopped"/, result.stderr);
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    assert.equal(report.verification, "failed-or-unavailable");
    const output = result.stdout + result.stderr;
    for (const secret of [f.privateKey, "secret-api-token", "another-secret-token"]) {
      assert.ok(!output.includes(secret));
    }
  } finally {
    f.cleanup();
  }
});

test("CLI does not regenerate a deleted checkpoint or sign an unfinished legacy checkpoint", () => {
  const f = fixture();
  try {
    const stateFile = path.join(f.root, "state/test-request.json");
    const reportFile = path.join(f.root, "evidence/test-request.json");
    writeFileSync(reportFile, JSON.stringify({ verification: "verified", txHash: "old-success" }));
    assert.equal(f.run().status, 1);
    assert.equal(existsSync(stateFile), false);
    // 거절을 반복해도 보고서를 지우거나 새 거래 상태를 만들면 안 됩니다.
    assert.equal(f.run().status, 1);
    assert.equal(existsSync(stateFile), false);
    writeFileSync(stateFile, JSON.stringify({ version: 2 }));
    assert.equal(f.run().status, 1);
    assert.deepEqual(JSON.parse(readFileSync(stateFile, "utf8")), { version: 2 });
  } finally {
    f.cleanup();
  }
});

// 네트워크 연결 자체가 실패해도 과거 성공 보고서가 최신 결과로 남지 않아야 합니다.
test("CLI clears stale verification on RPC failure before checkpoint loading", () => {
  const f = fixture(true);
  try {
    const reportFile = path.join(f.root, "evidence/test-request.json");
    writeFileSync(reportFile, JSON.stringify({ verification: "verified", txHash: "old-success" }));
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /NETWORK_ERROR/);
    assert.ok(!result.stderr.includes("secret-api-token"));
    assert.equal(JSON.parse(readFileSync(reportFile, "utf8")).verification, "failed-or-unavailable");
  } finally {
    f.cleanup();
  }
});
