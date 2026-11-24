import { NextResponse, connection } from "next/server";
import {
  addKycEndpoint,
  addTrackedWallet,
  countLeads,
  getHops,
  getKycEndpoints,
  getState,
  getTrackedWallets,
  insertAlerts,
  readFlows,
  reclassifyLeads,
  removeKycEndpoint,
  removeTrackedWallet,
  type Chain,
  type Flow,
  type SentinelAlert,
} from "@/lib/sentinel/database";
import { backtraceTron, describeBacktrace } from "@/lib/sentinel/backtrace";

const ETH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

function clean(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function chainOf(value: unknown): Chain {
  return value === "tron" ? "tron" : "ethereum";
}

function validAddress(address: string, chain: Chain) {
  return chain === "tron" ? TRON_ADDRESS.test(address) : ETH_ADDRESS.test(address);
}

function leadAlert(flow: Flow): SentinelAlert {
  const amount = flow.amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return {
    id: `lead:${flow.id}`.slice(0, 200),
    kind: "KYC_LEAD",
    severity: "high",
    from_addr: flow.from_addr,
    to_addr: flow.to_addr,
    value_eth: flow.asset === "ETH" ? flow.amount : 0,
    detail: `[${flow.chain.toUpperCase()}] ${amount} ${flow.asset} reached ${flow.to_label} (${flow.to_addr}) — a KYC-able endpoint.`,
    proposed_action: `DRY RUN → prepare KYC request package for ${flow.to_label} with tx hash ${flow.tx_hash}`,
    simulated_result:
      "Simulation: no request was sent and no contact was made. Evidence staged for operator review only.",
    block_number: flow.block_number,
    tx_hash: flow.tx_hash,
    detected_at: flow.detected_at,
  };
}

export async function GET(request: Request) {
  await connection();
  const chain = chainOf(new URL(request.url).searchParams.get("chain"));
  return NextResponse.json(
    {
      chain,
      wallets: getTrackedWallets(chain),
      endpoints: getKycEndpoints(chain),
      leads: readFlows(60, true, chain),
      flows: readFlows(80, false, chain),
      activeHops: getHops(chain).length,
      leadCount: countLeads(chain),
      traceError:
        chain === "tron" ? getState("tronError") ?? "" : getState("traceError") ?? "",
      tronLastBlock: Number(getState("tronLastBlock") || "0"),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = clean(body.action, 40);
  const chain = chainOf(body.chain);
  const address = clean(body.address, 44).trim();

  if (!validAddress(address, chain)) {
    return NextResponse.json({ error: `Invalid ${chain} address` }, { status: 400 });
  }

  if (action === "backtrace") {
    if (chain !== "tron") {
      return NextResponse.json({ error: "Backtrace currently supports Tron only" }, { status: 400 });
    }
    const limit = Math.min(Math.max(Number(body.limit) || 200, 20), 500);
    try {
      const result = await backtraceTron(address, limit);
      const newlyMatched = reclassifyLeads("tron");
      const backtraceLeads = readFlows(500, true, "tron").filter((flow) =>
        flow.id.startsWith("backtrace:"),
      );
      insertAlerts([...newlyMatched, ...backtraceLeads].map(leadAlert));
      return NextResponse.json({ ok: true, result, summary: describeBacktrace(result) });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Backtrace failed" },
        { status: 503 },
      );
    }
  }

  switch (action) {
    case "add-wallet":
      addTrackedWallet(address, clean(body.label) || "Unlabeled wallet", clean(body.note, 200), chain);
      break;
    case "remove-wallet":
      removeTrackedWallet(address, chain);
      break;
    case "add-endpoint": {
      addKycEndpoint(address, clean(body.label) || "Unlabeled endpoint", chain);
      const newlyMatched = reclassifyLeads(chain);
      insertAlerts(newlyMatched.map(leadAlert));
      break;
    }
    case "remove-endpoint":
      removeKycEndpoint(address, chain);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
