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
import {
  getNowBlock,
  getTrc20Transfers,
  hexToBase58,
  type TronTrc20Transfer,
} from "./tron-rpc";

const CHAIN = "tron" as const;
const MAX_HOPS = 3;
const HOP_WINDOW_BLOCKS = 3600; // ~3 hours on Tron
// TronGrid's free tier allows ~3 requests/second. Keep the per-tick budget
// small so live polling doesn't crowd out interactive backtrace requests.
const MAX_ADDRESSES = 12;

type Transfer = { from: string; to: string; asset: string; amount: number; txHash: string };

function short(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export async function traceTronBlock() {
  const tracked = new Map(getTrackedWallets(CHAIN).map((w) => [w.address, w.label]));
  const endpoints = new Map(getKycEndpoints(CHAIN).map((e) => [e.address, e.label]));
  const hops = new Map(getHops(CHAIN).map((h) => [h.address, h]));

  if (tracked.size === 0 && hops.size === 0) {
    return { flows: [] as Flow[], alerts: [] as SentinelAlert[], blockNumber: 0, txCount: 0 };
  }

  const block = await getNowBlock();
  const blockNumber = block.block_header?.raw_data?.number ?? 0;
  const transfers: Transfer[] = [];

  // Native TRX transfers are included directly in the block.
  for (const tx of block.transactions ?? []) {
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
    transfers.push({ from, to, asset: "TRX", amount, txHash: tx.txID ?? "" });
  }

  // TRC-20 logs are not in the block response, so query per address.
  // Tracked wallets always win the budget; hops rotate as capacity allows.
  const trackedAddresses = [...tracked.keys()];
  const hopAddresses = [...hops.keys()].filter((address) => !tracked.has(address));
  const interesting = [
    ...trackedAddresses,
    ...hopAddresses,
  ].slice(0, MAX_ADDRESSES);
  const results = await Promise.allSettled(interesting.map((address) => getTrc20Transfers(address, 25)));
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value as TronTrc20Transfer[]) {
      if (item.type !== "Transfer") continue;
      if (item.block_timestamp && item.block_timestamp < cutoff) continue;
      const decimals = item.token_info?.decimals ?? 6;
      const amount = Number(item.value) / 10 ** decimals;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      transfers.push({
        from: item.from,
        to: item.to,
        asset: item.token_info?.symbol ?? "TRC20",
        amount,
        txHash: item.transaction_id,
      });
    }
  }

  const seen = new Set<string>();
  const flows: Flow[] = [];
  const alerts: SentinelAlert[] = [];
  const newHops: Hop[] = [];
  const detectedAt = new Date().toISOString();

  for (const transfer of transfers) {
    const from = transfer.from;
    const to = transfer.to;
    const dedupe = `${transfer.txHash}:${from}:${to}:${transfer.asset}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const trackedFrom = tracked.get(from);
    const hopFrom = hops.get(from);
    const trackedTo = tracked.get(to);

    if (trackedFrom || hopFrom) {
      const root = trackedFrom ? from : hopFrom!.root_wallet;
      const rootLabel = trackedFrom ?? hopFrom!.root_label;
      const hop = trackedFrom ? 0 : hopFrom!.hop + 1;
      const endpointLabel = endpoints.get(to) ?? "";
      const isLead = endpointLabel.length > 0;

      flows.push({
        id: `tron:${dedupe}`.slice(0, 200),
        chain: CHAIN,
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
          id: `tron:lead:${dedupe}`.slice(0, 200),
          kind: "KYC_LEAD",
          severity: "high",
          from_addr: from,
          to_addr: to,
          value_eth: 0,
          detail: `[TRON] ${transfer.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${transfer.asset} moved from ${short(rootLabel || root)} through hop ${hop} into ${endpointLabel} (${short(to)}) — a KYC-able endpoint.`,
          proposed_action: `DRY RUN → prepare KYC request package for ${endpointLabel} with tx hash ${transfer.txHash}`,
          simulated_result:
            "Simulation: no request was sent and no contact was made. Evidence staged for operator review only.",
          block_number: blockNumber,
          tx_hash: transfer.txHash,
          detected_at: detectedAt,
        });
      } else if (hop < MAX_HOPS && !tracked.has(to)) {
        newHops.push({
          address: to,
          chain: CHAIN,
          root_wallet: root,
          root_label: rootLabel,
          hop,
          expires_block: blockNumber + HOP_WINDOW_BLOCKS,
        });
      }
    }

    if (trackedTo && !trackedFrom && !hopFrom) {
      flows.push({
        id: `tron:in:${dedupe}`.slice(0, 200),
        chain: CHAIN,
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

  pruneHops(blockNumber, CHAIN);
  upsertHops(newHops);
  insertFlows(flows);
  return { flows, alerts, blockNumber, txCount: block.transactions?.length ?? 0 };
}
