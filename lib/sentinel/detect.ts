import type { RpcBlock, RpcTransaction } from "./rpc";

const MAX_UINT256 = "f".repeat(64);
const APPROVE = "0x095ea7b3";
const SET_APPROVAL_FOR_ALL = "0xa22cb465";

export type Detection = {
  tx_hash: string;
  kind: string;
  severity: "high" | "medium" | "low";
  from_addr: string;
  to_addr: string;
  value_eth: number;
  detail: string;
  proposed_action: string;
  simulated_result: string;
};

export type DetectOptions = {
  minEth: number;
  watched: string[];
};

function short(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function ethValue(tx: RpcTransaction) {
  const wei = BigInt(tx.value || "0x0");
  return Number(wei) / 1e18;
}

export function detectBlock(block: RpcBlock, options: DetectOptions): Detection[] {
  const results: Detection[] = [];
  const watched = new Set(options.watched.map((a) => a.toLowerCase()));

  for (const tx of block.transactions) {
    const input = (tx.input || "").toLowerCase();
    const from = tx.from || "unknown";
    const to = tx.to || "(contract creation)";
    const valueEth = ethValue(tx);

    // ERC-20 approve(address,uint256) with an unlimited amount.
    if (input.startsWith(APPROVE)) {
      const amount = input.slice(10 + 64, 10 + 128);
      if (amount === MAX_UINT256) {
        results.push({
          tx_hash: tx.hash,
          kind: "UNLIMITED_APPROVAL",
          severity: "high",
          from_addr: from,
          to_addr: to,
          value_eth: valueEth,
          detail: `Unlimited ERC-20 approval granted to ${short(to)}. A compromised spender could drain the full balance.`,
          proposed_action: "DRY RUN → rate-limit + queue revoke advisory for the approving address",
          simulated_result:
            "Simulation: policy has no signing authority. Would notify the client and queue a revoke advisory. Nothing was broadcast.",
        });
      }
    }

    // ERC-721 / ERC-1155 setApprovalForAll(address,true).
    if (input.startsWith(SET_APPROVAL_FOR_ALL)) {
      const flag = input.slice(10 + 64, 10 + 128);
      if (flag.endsWith("1")) {
        results.push({
          tx_hash: tx.hash,
          kind: "SET_APPROVAL_FOR_ALL",
          severity: "medium",
          from_addr: from,
          to_addr: to,
          value_eth: valueEth,
          detail: `Blanket operator approval granted to ${short(to)} on an NFT collection.`,
          proposed_action: "DRY RUN → watch operator + notify client",
          simulated_result:
            "Simulation: would add the operator to the watchlist and open an advisory. Nothing was broadcast.",
        });
      }
    }

    // Large native ETH movement.
    if (valueEth >= options.minEth) {
      results.push({
        tx_hash: tx.hash,
        kind:"LARGE_TRANSFER",
        severity: valueEth >= options.minEth * 10 ? "high" : "medium",
        from_addr: from,
        to_addr: to,
        value_eth: valueEth,
        detail: `${valueEth.toFixed(2)} ETH moved from ${short(from)} to ${short(to)}.`,
        proposed_action: "DRY RUN → open monitoring on recipient + notify client",
        simulated_result:
          "Simulation: would add the recipient to the watchlist and emit an alert. No keys were used and nothing was broadcast.",
      });
    }

    // Contract creation carrying value.
    if (!tx.to && valueEth >= options.minEth) {
      results.push({
        tx_hash: tx.hash,
        kind:"FUNDED_CONTRACT_CREATION",
        severity: "medium",
        from_addr: from,
        to_addr: to,
        value_eth: valueEth,
        detail: `New contract deployed with ${valueEth.toFixed(2)} ETH attached from ${short(from)}.`,
        proposed_action: "DRY RUN → queue deployed bytecode for audit",
        simulated_result:
          "Simulation: would fetch and queue the bytecode for the audit agent. Nothing was broadcast.",
      });
    }

    // Addresses the operator explicitly wants watched.
    if (watched.has(to.toLowerCase()) || watched.has(from.toLowerCase())) {
      results.push({
        tx_hash: tx.hash,
        kind:"WATCHED_ADDRESS",
        severity: "high",
        from_addr: from,
        to_addr: to,
        value_eth: valueEth,
        detail: `Transaction involving a watched address (${short(watched.has(to.toLowerCase()) ? to : from)}).`,
        proposed_action: "DRY RUN → check client policy for pause authority",
        simulated_result:
          "Simulation: would check for a signed pause policy before any action. No matching authority in v1 — alert only. Nothing was broadcast.",
      });
    }
  }

  return results;
}
