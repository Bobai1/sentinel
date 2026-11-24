import { getKycEndpoints, readFlows, type Chain } from "./database";
import {
  getTrc20Transfers,
  getAccountTransactions,
  hexToBase58,
  type TronTrc20Transfer,
} from "./tron-rpc";

export type DossierRow = {
  address: string;
  label: string;
  asset: string;
  amount: number;
  count: number;
  last: string;
  txHash: string;
};

export type Dossier = {
  address: string;
  chain: Chain;
  inflow: DossierRow[];
  outflow: DossierRow[];
  totals: Record<string, { in: number; out: number }>;
  firstActivity: string;
  lastActivity: string;
  transfers: number;
  note: string;
};

type Movement = {
  counterparty: string;
  asset: string;
  amount: number;
  timestamp: number;
  txHash: string;
  direction: "in" | "out";
};

function aggregate(
  movements: Movement[],
  direction: "in" | "out",
  labels: Map<string, string>,
): DossierRow[] {
  const grouped = new Map<string, DossierRow>();
  for (const movement of movements) {
    if (movement.direction !== direction) continue;
    const key = `${movement.counterparty}:${movement.asset}`;
    const row = grouped.get(key) ?? {
      address: movement.counterparty,
      label: labels.get(movement.counterparty.toLowerCase()) ?? "",
      asset: movement.asset,
      amount: 0,
      count: 0,
      last: "",
      txHash: movement.txHash,
    };
    row.amount += movement.amount;
    row.count += 1;
    if (movement.timestamp >= (row.last ? Date.parse(row.last) : 0)) {
      row.last = new Date(movement.timestamp).toISOString();
      row.txHash = movement.txHash;
    }
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((a, b) => b.amount - a.amount).slice(0, 15);
}

function build(movements: Movement[], address: string, chain: Chain, note: string): Dossier {
  const labels = new Map(getKycEndpoints(chain).map((e) => [e.address.toLowerCase(), e.label]));
  const timestamps = movements.map((m) => m.timestamp).filter((t) => t > 0);
  const totals: Record<string, { in: number; out: number }> = {};
  for (const movement of movements) {
    const entry = (totals[movement.asset] ??= { in: 0, out: 0 });
    entry[movement.direction] += movement.amount;
  }
  return {
    address,
    chain,
    inflow: aggregate(movements, "in", labels),
    outflow: aggregate(movements, "out", labels),
    totals,
    firstActivity: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : "unknown",
    lastActivity: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : "unknown",
    transfers: movements.length,
    note,
  };
}

export async function buildTronDossier(address: string): Promise<Dossier> {
  const target = address.toLowerCase();
  const movements: Movement[] = [];

  const trc20 = await getTrc20Transfers(address, 200);
  for (const transfer of trc20 as TronTrc20Transfer[]) {
    if (transfer.type !== "Transfer") continue;
    const decimals = transfer.token_info?.decimals ?? 6;
    const amount = Number(transfer.value) / 10 ** decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();
    const timestamp = transfer.block_timestamp ?? 0;
    const txHash = transfer.transaction_id;
    if (to === target) {
      movements.push({ counterparty: transfer.from, asset: transfer.token_info?.symbol ?? "TRC20", amount, timestamp, txHash, direction: "in" });
    }
    if (from === target) {
      movements.push({ counterparty: transfer.to, asset: transfer.token_info?.symbol ?? "TRC20", amount, timestamp, txHash, direction: "out" });
    }
  }

  const native = await getAccountTransactions(address, 200);
  for (const tx of native) {
    const contract = tx.raw_data?.contract?.[0];
    if (contract?.type !== "TransferContract") continue;
    if (tx.ret?.[0]?.contractRet !== "SUCCESS") continue;
    const value = contract.parameter?.value;
    if (!value?.owner_address || !value?.to_address) continue;
    let from: string;
    let to: string;
    try {
      from = hexToBase58(value.owner_address);
      to = hexToBase58(value.to_address);
    } catch {
      continue;
    }
    const amount = Number(value.amount ?? 0) / 1e6;
    if (amount <= 0) continue;
    const timestamp = tx.block_timestamp ?? 0;
    const txHash = tx.txID ?? "";
    if (to.toLowerCase() === target) {
      movements.push({ counterparty: from, asset: "TRX", amount, timestamp, txHash, direction: "in" });
    }
    if (from.toLowerCase() === target) {
      movements.push({ counterparty: from, asset: "TRX", amount, timestamp, txHash, direction: "out" });
    }
  }

  return build(
    movements,
    address,
    "tron",
    "Based on the most recent 200 TRC-20 transfers and 200 native TRX transactions from TronGrid.",
  );
}

export function buildEthereumDossier(address: string): Dossier {
  const target = address.toLowerCase();
  const flows = readFlows(500).filter(
    (flow) =>
      flow.chain === "ethereum" &&
      (flow.from_addr.toLowerCase() === target ||
        flow.to_addr.toLowerCase() === target ||
        flow.root_wallet.toLowerCase() === target),
  );
  const movements: Movement[] = flows.map((flow) => ({
    counterparty:
      flow.from_addr.toLowerCase() === target ? flow.to_addr : flow.from_addr,
    asset: flow.asset,
    amount: flow.amount,
    timestamp: Date.parse(flow.detected_at),
    txHash: flow.tx_hash,
    direction: flow.from_addr.toLowerCase() === target ? "out" : "in",
  }));
  return build(
    movements,
    address,
    "ethereum",
    "Based on flows already observed by Sentinel. Full Ethereum history requires an Etherscan API key.",
  );
}
