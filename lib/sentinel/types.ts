export type SentinelAlertView = {
  id: string;
  block_number: number;
  tx_hash: string;
  kind: string;
  severity: "high" | "medium" | "low";
  from_addr: string;
  to_addr: string;
  value_eth: number;
  detail: string;
  proposed_action: string;
  simulated_result: string;
  detected_at: string;
};

export type SentinelSnapshot = {
  alerts: SentinelAlertView[];
  total: number;
  state: {
    status: string;
    lastBlock: number;
    lastRunAt: string;
    lastError: string;
    blocksScanned: number;
    txScanned: number;
  };
};

export type ChainView = "ethereum" | "tron";

export type TrackedWalletView = {
  address: string;
  label: string;
  note: string;
  chain: ChainView;
  created_at: string;
};

export type KycEndpointView = {
  address: string;
  label: string;
  chain: ChainView;
  created_at: string;
};

export type FlowView = {
  id: string;
  chain: ChainView;
  root_wallet: string;
  root_label: string;
  from_addr: string;
  to_addr: string;
  to_label: string;
  asset: string;
  amount: number;
  hop: number;
  block_number: number;
  tx_hash: string;
  is_kyc_lead: number;
  detected_at: string;
};

export type TraceSnapshot = {
  chain: ChainView;
  tronLastBlock: number;
  wallets: TrackedWalletView[];
  endpoints: KycEndpointView[];
  leads: FlowView[];
  flows: FlowView[];
  activeHops: number;
  leadCount: number;
  traceError: string;
};
