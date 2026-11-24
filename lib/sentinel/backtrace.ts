import { getKycEndpoints, insertFlows, upsertHops, type Flow, type Hop } from "./database";
import {
  getNowBlock,
  getTrc20Transfers,
  getAccountTransactions,
  hexToBase58,
} from "./tron-rpc";

type Destination = { address: string; asset: string; amount: number; count: number };

export type BacktraceResult = {
  records: number;
  outflows: number;
  leads: number;
  destinations: Destination[];
  latestActivity: string;
};

function short(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

/** Load historical outflows for a Tron wallet and seed the live hop watch. */
export async function backtraceTron(address: string, limit = 200): Promise<BacktraceResult> {
  const endpoints = new Map(getKycEndpoints("tron").map((endpoint) => [endpoint.address, endpoint.label]));
  const flows: Flow[] = [];
  const hops: Hop[] = [];
  const seen = new Set<string>();
  const destinations = new Map<string, Destination>();
  let latest = 0;

  const addDestination = (to: string, asset: string, amount: number) => {
    const current = destinations.get(to) ?? { address: to, asset, amount: 0, count: 0 };
    current.amount += amount;
    current.count += 1;
    destinations.set(to, current);
  };

  const addFlow = (txHash: string, to: string, asset: string, amount: number, timestamp: number) => {
    if (!txHash || seen.has(txHash)) return;
    seen.add(txHash);
    if (timestamp > latest) latest = timestamp;
    const endpointLabel = endpoints.get(to) ?? "";
    flows.push({
      id: `backtrace:${txHash}`.slice(0, 200),
      chain: "tron",
      root_wallet: address,
      root_label: "Backtraced wallet",
      from_addr: address,
      to_addr: to,
      to_label: endpointLabel,
      asset,
      amount,
      hop: 0,
      block_number: 0,
      tx_hash: txHash,
      is_kyc_lead: endpointLabel ? 1 : 0,
      detected_at: new Date(timestamp || Date.now()).toISOString(),
    });
    addDestination(to, asset, amount);
    hops.push({
      address: to,
      chain: "tron",
      root_wallet: address,
      root_label: "Backtraced wallet",
      hop: 1,
      expires_block: 0,
    });
  };

  const addInboundLead = (
    txHash: string,
    from: string,
    asset: string,
    amount: number,
    timestamp: number,
  ) => {
    const label = endpoints.get(from);
    if (!label || !txHash || seen.has(`in:${txHash}`)) return;
    seen.add(`in:${txHash}`);
    flows.push({
      id: `backtrace:in:${txHash}`.slice(0, 200),
      chain: "tron",
      root_wallet: address,
      root_label: "Backtraced wallet",
      from_addr: from,
      to_addr: address,
      to_label: `FROM ${label}`,
      asset,
      amount,
      hop: -1,
      block_number: 0,
      tx_hash: txHash,
      is_kyc_lead: 1,
      detected_at: new Date(timestamp || Date.now()).toISOString(),
    });
  };

  // TRC-20 transfers: from/to are already Base58.
  const trc20 = await getTrc20Transfers(address, limit);
  for (const transfer of trc20) {
    if (transfer.type !== "Transfer") continue;
    const decimals = transfer.token_info?.decimals ?? 6;
    const amount = Number(transfer.value) / 10 ** decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const timestamp = transfer.block_timestamp ?? 0;
    const asset = transfer.token_info?.symbol ?? "TRC20";
    if (transfer.from === address) {
      addFlow(transfer.transaction_id, transfer.to, asset, amount, timestamp);
    }
    if (transfer.to === address) {
      addInboundLead(transfer.transaction_id, transfer.from, asset, amount, timestamp);
    }
  }

  // Native TRX: convert hex addresses from the raw contract.
  const native = await getAccountTransactions(address, limit);
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
    if (from === address) addFlow(tx.txID ?? "", to, "TRX", amount, timestamp);
    if (to === address) addInboundLead(tx.txID ?? "", from, "TRX", amount, timestamp);
  }

  if (flows.length > 0) {
    const block = await getNowBlock().catch(() => null);
    const head = block?.block_header?.raw_data?.number ?? 0;
    for (const hop of hops) hop.expires_block = head + 3600;
    insertFlows(flows);
    upsertHops(hops);
  }

  return {
    records: trc20.length + native.length,
    outflows: flows.length,
    leads: flows.filter((flow) => flow.is_kyc_lead === 1).length,
    destinations: [...destinations.values()].sort((a, b) => b.amount - a.amount).slice(0, 12),
    latestActivity: latest ? new Date(latest).toISOString() : "unknown",
  };
}

export function describeBacktrace(result: BacktraceResult) {
  if (result.outflows === 0) return "No historical outflows found for this wallet.";
  const top = result.destinations[0];
  return `${result.outflows} historical outflows loaded. Largest destination: ${short(top.address)} (${top.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${top.asset}, ${top.count} transfer${top.count === 1 ? "" : "s"}).`;
}
