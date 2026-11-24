import type { RpcBlock, RpcLog } from "./rpc";
import { TRANSFER_TOPIC } from "./rpc";
import {
  getTrackedWallets,
  getKycEndpoints,
  getHops,
  upsertHops,
  pruneHops,
  insertFlows,
  type Flow,
  type Hop,
  type SentinelAlert,
} from "./database";

const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0x6b175474e89094c44da98b954edeac495271d0f": { symbol: "DAI", decimals: 18 },
};

const MAX_HOPS = 3;
const HOP_WINDOW_BLOCKS = 720; // roughly 2.5 hours on Ethereum

type Transfer = {
  from: string;
  to: string;
  asset: string;
  amount: number;
  txHash: string;
  token: string;
};

function short(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function padAddress(topic: string) {
  return `0x${topic.slice(-40).toLowerCase()}`;
}

function formatAmount(raw: string, decimals: number) {
  try {
    return Number(BigInt(raw)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

export function extractTransfers(block: RpcBlock, logs: RpcLog[]): Transfer[] {
  const transfers: Transfer[] = [];

  for (const tx of block.transactions) {
    if (!tx.to) continue;
    const wei = BigInt(tx.value || "0x0");
    if (wei === BigInt(0)) continue;
    transfers.push({
      from: tx.from.toLowerCase(),
      to: tx.to.toLowerCase(),
      asset: "ETH",
      amount: Number(wei) / 1e18,
      txHash: tx.hash,
      token: "native",
    });
  }

  for (const log of logs) {
    if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    if (!log.data || log.data === "0x") continue;
    const token = log.address.toLowerCase();
    const meta = TOKENS[token];
    transfers.push({
      from: padAddress(log.topics[1]),
      to: padAddress(log.topics[2]),
      asset: meta?.symbol ?? "ERC20",
      amount: formatAmount(log.data, meta?.decimals ?? 18),
      txHash: log.transactionHash,
      token,
    });
  }

  return transfers;
}

export function traceBlock(block: RpcBlock, logs: RpcLog[], blockNumber: number) {
  const tracked = new Map(getTrackedWallets().map((w) => [w.address.toLowerCase(), w.label]));
  const endpoints = new Map(getKycEndpoints().map((e) => [e.address.toLowerCase(), e.label]));
  const hops = new Map(getHops().map((h) => [h.address.toLowerCase(), h]));

  if (tracked.size === 0 && hops.size === 0) {
    return { flows: [] as Flow[], alerts: [] as SentinelAlert[] };
  }

  const transfers = extractTransfers(block, logs);
  const flows: Flow[] = [];
  const alerts: SentinelAlert[] = [];
  const newHops: Hop[] = [];
  const detectedAt = new Date().toISOString();

  for (const transfer of transfers) {
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();
    const trackedFrom = tracked.get(from);
    const hopFrom = hops.get(from);

    if (trackedFrom || hopFrom) {
      const root = trackedFrom ? from : hopFrom!.root_wallet;
      const rootLabel = trackedFrom ?? hopFrom!.root_label;
      const hop = trackedFrom ? 0 : hopFrom!.hop + 1;
      const endpointLabel = endpoints.get(to) ?? "";
      const isLead = endpointLabel.length > 0;

      flows.push({
        chain: "ethereum",
        id: `${blockNumber}:${transfer.txHash}:${from}:${to}:${transfer.token}`.slice(0, 200),
        root_wallet: root,
        root_label: rootLabel,
        from_addr: from,
        to_addr: to,
        to_label: endpointLabel,
        asset: transfer.asset,
        amount: transfer.amount,
        hop,
        block_number: blockNumber,
        tx_hash: transfer.txHash,
        is_kyc_lead: isLead ? 1 : 0,
        detected_at: detectedAt,
      });

      if (isLead) {
        alerts.push({
          id: `lead:${blockNumber}:${transfer.txHash}:${from}:${to}`.slice(0, 200),
          kind: "KYC_LEAD",
          severity: "high",
          from_addr: from,
          to_addr: to,
          value_eth: transfer.asset === "ETH" ? transfer.amount : 0,
          detail: `${transfer.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${transfer.asset} moved from ${short(rootLabel || root)} through hop ${hop} into ${endpointLabel} (${short(to)}) — a KYC-able endpoint.`,
          proposed_action: `DRY RUN → prepare KYC request package for ${endpointLabel} with tx hashes ${transfer.txHash}`,
          simulated_result:
            "Simulation: no request was sent and no contact was made. Evidence staged for operator review only.",
          block_number: blockNumber,
          tx_hash: transfer.txHash,
          detected_at: detectedAt,
        });
      } else if (hop < MAX_HOPS && !tracked.has(to)) {
        newHops.push({
          chain: "ethereum",
          address: to,
          root_wallet: root,
          root_label: rootLabel,
          hop,
          expires_block: blockNumber + HOP_WINDOW_BLOCKS,
        });
      }
    }

    // Inbound funds to a tracked wallet (e.g. stolen funds landing at an exchange).
    const trackedTo = tracked.get(to);
    if (trackedTo && !trackedFrom && !hopFrom) {
      flows.push({
        chain: "ethereum",
        id: `${blockNumber}:${transfer.txHash}:${from}:${to}:in:${transfer.token}`.slice(0, 200),
        root_wallet: to,
        root_label: trackedTo,
        from_addr: from,
        to_addr: to,
        to_label: "INBOUND",
        asset: transfer.asset,
        amount: transfer.amount,
        hop: -1,
        block_number: blockNumber,
        tx_hash: transfer.txHash,
        is_kyc_lead: 0,
        detected_at: detectedAt,
      });
    }
  }

  pruneHops(blockNumber);
  upsertHops(newHops);
  insertFlows(flows);
  return { flows, alerts };
}
