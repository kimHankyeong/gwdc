import { Contract, JsonRpcProvider, Wallet, id, getAddress } from "ethers";
import type { Policy, PurchasePlan } from "@franchise/shared";

const vaultAbi = [
  "function policies(bytes32) view returns (address operator, uint128 budget, uint128 spent, uint64 expiresAt, uint32 version, bool active)",
  "function allowedSuppliers(bytes32,address) view returns (bool)",
  "function setPolicy(bytes32,address,uint128,uint64,address[])",
  "function revokePolicy(bytes32)",
  "function settledOrders(bytes32) view returns (bool)",
  "function pay(bytes32,bytes32,address,uint128,uint128,bytes32)",
  "event PolicyUpdated(bytes32 indexed policyId,address indexed operator,uint128 budget,uint64 expiresAt,uint32 version,address[] suppliers)",
  "event PolicyRevoked(bytes32 indexed policyId,uint32 version)",
  "event PaymentExecuted(bytes32 indexed policyId,bytes32 indexed orderId,address indexed supplier,uint256 subtotal,uint256 deliveryFee,uint256 total,uint32 policyVersion,bytes32 detailsHash)",
];

export type Settlement = { txHash: string; gasUsed: string; gasCostWei: string };
export type ChainPort = {
  mode: "simulated" | "rpc";
  ready(): Promise<void>;
  approvePolicy(policy: Policy): Promise<string | null>;
  stopPolicy(branchId: string): Promise<string | null>;
  settle(purchaseId: string, branchId: string, plan: PurchasePlan, quote: { subtotal: number; deliveryFee: number; total: number }, detailsHash: string, onBroadcast: (hash: string) => void, knownTxHash?: string): Promise<Settlement | null>;
};

export function simulatedChain(): ChainPort {
  return {
    mode: "simulated",
    async ready() {},
    async approvePolicy() { return null; },
    async stopPolicy() { return null; },
    async settle() { return null; },
  };
}

function parseAddressMap(raw: string | undefined, label: string): Record<string, string> {
  if (!raw) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(`${label}은 유효한 JSON 객체여야 합니다.`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}은 유효한 JSON 객체여야 합니다.`);
  const result: Record<string, string> = {};
  for (const [key, address] of Object.entries(value)) {
    if (typeof address !== "string") throw new Error(`${label}의 주소 값은 문자열이어야 합니다.`);
    result[key] = getAddress(address);
  }
  return result;
}

export function rpcChain(env: NodeJS.ProcessEnv): ChainPort {
  const rpcUrl = env.JSON_RPC_URL ?? "";
  let parsedRpc: URL;
  try { parsedRpc = new URL(rpcUrl); } catch { throw new Error("JSON_RPC_URL은 loopback HTTP RPC 주소여야 합니다."); }
  if (!/^https?:$/.test(parsedRpc.protocol) || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsedRpc.hostname.toLowerCase())) throw new Error("JSON_RPC_URL은 loopback 주소만 허용합니다.");
  if (!env.VAULT_ADDRESS || !env.TOKEN_ADDRESS) throw new Error("VAULT_ADDRESS와 TOKEN_ADDRESS를 배포 후 설정하세요.");
  const vaultAddress = getAddress(env.VAULT_ADDRESS ?? "");
  const tokenAddress = getAddress(env.TOKEN_ADDRESS ?? "");
  const treasuryKey = env.TREASURY_PRIVATE_KEY ?? "";
  if (!/^https?:\/\//.test(rpcUrl)) throw new Error("JSON_RPC_URL은 로컬 HTTP RPC 주소여야 합니다.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(treasuryKey)) throw new Error("TREASURY_PRIVATE_KEY가 없거나 형식이 잘못되었습니다.");
  const branchKeysRaw = env.BRANCH_SIGNERS_JSON ?? "{}";
  let branchKeys: Record<string, string>;
  try { branchKeys = JSON.parse(branchKeysRaw) as Record<string, string>; } catch { throw new Error("BRANCH_SIGNERS_JSON이 유효한 JSON이 아닙니다."); }
  const suppliers = parseAddressMap(env.SUPPLIER_WALLETS_JSON, "SUPPLIER_WALLETS_JSON");
  const provider = new JsonRpcProvider(rpcUrl);
  const hq = new Wallet(treasuryKey, provider);
  const vault = new Contract(vaultAddress, vaultAbi, hq) as any;

  function branchWallet(branchId: string): Wallet {
    const key = branchKeys[branchId];
    if (typeof key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${branchId}의 서명 키가 설정되지 않았습니다.`);
    return new Wallet(key, provider);
  }

  const chain: ChainPort = {
    mode: "rpc",
    async ready() {
      const [network, vaultCode, tokenCode] = await Promise.all([provider.getNetwork(), provider.getCode(vaultAddress), provider.getCode(tokenAddress)]);
      if (network.chainId === 1n || network.chainId === 5n || network.chainId === 11155111n) throw new Error("메인넷 또는 공개 테스트넷에는 연결하지 않습니다.");
      if (vaultCode === "0x" || tokenCode === "0x") throw new Error("RPC 주소에서 설정한 토큰·금고 계약을 찾지 못했습니다.");
    },
    async approvePolicy(policy) {
      const branch = branchWallet(policy.branchId);
      const addresses = policy.supplierIds.map((supplierId) => suppliers[supplierId]);
      if (addresses.some((address) => !address)) throw new Error("허용 공급업체의 온체인 주소가 설정되지 않았습니다.");
      const expiresAt = BigInt(Math.floor(Date.parse(policy.expiresAt) / 1000));
      const tx = await vault.setPolicy(id(policy.branchId), await branch.getAddress(), BigInt(policy.budget), expiresAt, addresses);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("온체인 정책 승인 트랜잭션이 실패했습니다.");
      return tx.hash as string;
    },
    async stopPolicy(branchId) {
      const tx = await vault.revokePolicy(id(branchId));
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("온체인 중단 트랜잭션이 실패했습니다.");
      return tx.hash as string;
    },
    async settle(purchaseId, branchId, plan, quote, detailsHash, onBroadcast, knownTxHash) {
      const policyId = id(branchId);
      const orderId = id(purchaseId);
      if (knownTxHash) {
        const receipt = await provider.waitForTransaction(knownTxHash, 1, 30_000);
        if (!receipt) throw new Error("기존 결제 트랜잭션 확인을 기다리는 중입니다. 중복 결제를 막기 위해 재전송하지 않았습니다.");
        if (receipt.status !== 1) throw new Error("기존 온체인 결제 트랜잭션이 실패했습니다.");
        return { txHash: knownTxHash, gasUsed: receipt.gasUsed.toString(), gasCostWei: receipt.fee.toString() };
      }
      const previous = await vault.settledOrders(orderId) as boolean;
      if (previous) {
        const filter = vault.filters.PaymentExecuted(policyId, orderId);
        const events = await vault.queryFilter(filter, 0, "latest");
        const prior = events.find((event: { transactionHash?: string }) => event.transactionHash);
        if (prior) {
          const tx = await provider.getTransactionReceipt(prior.transactionHash);
          if (tx?.status === 1) return { txHash: prior.transactionHash, gasUsed: tx.gasUsed.toString(), gasCostWei: tx.fee.toString() };
        }
        throw new Error("이미 결제된 주문의 체인 영수증을 복구하지 못했습니다. 중복 결제를 막기 위해 실행을 중단했습니다.");
      }
      const policy = await vault.policies(policyId) as { operator: string; budget: bigint; spent: bigint; expiresAt: bigint; version: bigint; active: boolean };
      if (!policy.active || policy.version === 0n) throw new Error("온체인 정책이 없거나 중단되었습니다.");
      const supplier = suppliers[plan.supplierId];
      if (!supplier) throw new Error("공급업체의 온체인 수취 주소가 설정되지 않았습니다.");
      if (!await vault.allowedSuppliers(policyId, supplier)) throw new Error("온체인에서 공급업체가 허용되지 않았습니다.");
      const branch = branchWallet(branchId);
      if ((await branch.getAddress()).toLowerCase() !== policy.operator.toLowerCase()) throw new Error("가맹점 서명 지갑이 현재 온체인 정책과 다릅니다.");
      if (!/^0x[0-9a-fA-F]{64}$/.test(detailsHash)) throw new Error("거래 상세 해시의 형식이 잘못되었습니다.");
      const tx = await vault.connect(branch).pay(policyId, orderId, supplier, BigInt(quote.subtotal), BigInt(quote.deliveryFee), detailsHash);
      onBroadcast(tx.hash as string);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("온체인 결제 트랜잭션이 실패했습니다.");
      return { txHash: tx.hash as string, gasUsed: receipt.gasUsed.toString(), gasCostWei: receipt.fee.toString() };
    },
  };
  return chain;
}
