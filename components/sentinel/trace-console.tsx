"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FlowView, TraceSnapshot } from "@/lib/sentinel/types";
import type { Dossier } from "@/lib/sentinel/dossier";
import { styles } from "@/components/sentinel/styles";

function short(address: string) {
  if (!address) return "—";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function clock(iso: string) {
  return iso.length >= 19 ? iso.slice(11, 19) : "—";
}

function amount(flow: FlowView) {
  return `${flow.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${flow.asset}`;
}

export function TraceConsole({ initial }: { initial: TraceSnapshot }) {
  const [chain, setChain] = useState<"ethereum" | "tron">("ethereum");
  const [data, setData] = useState(initial);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [endpointAddress, setEndpointAddress] = useState("");
  const [endpointLabel, setEndpointLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initial.leads[0]?.id ?? null);
  const [backtraceSummary, setBacktraceSummary] = useState("");
  const [selectedWallet, setSelectedWallet] = useState("");
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);

  const load = async (activeChain: "ethereum" | "tron" = chain) => {
    try {
      const response = await fetch(`/api/sentinel/trace?chain=${activeChain}`, { cache: "no-store" });
      if (response.ok) setData((await response.json()) as TraceSnapshot);
    } catch {
      // keep the last good snapshot
    }
  };

  useEffect(() => {
    void load(chain);
    const id = setInterval(() => void load(chain), 5000);
    return () => clearInterval(id);
  }, [chain]);

  async function submit(event: FormEvent | null, action: string, payload: Record<string, string>, reset: () => void) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sentinel/trace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, chain, ...payload }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not save that address.");
        return;
      }
      reset();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runBacktrace(address: string) {
    setBusy(true);
    setError("");
    setBacktraceSummary("Loading history from TronGrid…");
    try {
      const response = await fetch("/api/sentinel/trace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "backtrace", chain: "tron", address }),
      });
      const body = (await response.json()) as { error?: string; summary?: string };
      if (!response.ok || !body.summary) {
        setError(body.error ?? "Backtrace failed.");
        setBacktraceSummary("");
        return;
      }
      setBacktraceSummary(body.summary);
      await load("tron");
    } finally {
      setBusy(false);
    }
  }

  async function openWallet(address: string) {
    setSelectedWallet(address);
    setDossier(null);
    setDossierLoading(true);
    try {
      const response = await fetch(
        `/api/sentinel/wallet?chain=${chain}&address=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );
      if (response.ok) setDossier((await response.json()) as Dossier);
      else setError("Could not load that wallet's history.");
    } finally {
      setDossierLoading(false);
    }
  }

  const selected = data.leads.find((lead) => lead.id === selectedId) ?? data.leads[0];
  const path = selected
    ? [
        { address: selected.root_wallet, label: selected.root_label, hop: 0 },
        ...data.flows
          .filter((flow) => flow.root_wallet === selected.root_wallet && flow.hop > 0 && flow.hop < selected.hop)
          .sort((a, b) => a.hop - b.hop)
          .map((flow) => ({ address: flow.to_addr, label: flow.to_label, hop: flow.hop })),
        { address: selected.from_addr, label: "", hop: selected.hop },
        { address: selected.to_addr, label: selected.to_label, hop: selected.hop + 1 },
      ]
    : [];

  return (
    <div className={styles.console}>
      <div className={`${styles.card} ${styles.consoleTop}`}>
        <div>
          <h2 className={styles.consoleTitle}>Wallet tracing · KYC lead detection</h2>
          <p className={styles.consoleSub}>
            Follow ETH / TRX and stablecoin outflows up to 3 hops. When funds reach a labelled endpoint, it becomes a lead.
          </p>
        </div>
        <span className={styles.pillCut}>DRY RUN · NO CONTACT MADE</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1">
        {(["ethereum", "tron"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setChain(option);
              setSelectedId(null);
              setWalletAddress("");
              setEndpointAddress("");
              setError("");
              setBacktraceSummary("");
              setDossier(null);
              setSelectedWallet("");
            }}
            className={`${styles.btn} ${chain === option ? styles.btnPrimary : styles.btnGhost}`}
          >
            {option === "ethereum" ? "Ethereum · ETH / ERC-20" : "Tron · TRX / TRC-20"}
          </button>
        ))}
        <span className="font-mono text-[11px] text-white/40">
          {chain === "tron" ? `TRON block #${data.tronLastBlock.toLocaleString("en-US")}` : "Ethereum mainnet"}
        </span>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.wallets.length}</div>
          <div className={styles.statLabel}>Tracked wallets</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.endpoints.length}</div>
          <div className={styles.statLabel}>KYC endpoints</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.leadCount}</div>
          <div className={styles.statLabel}>KYC leads</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.activeHops}</div>
          <div className={styles.statLabel}>Active hop addresses</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.flows.length}</div>
          <div className={styles.statLabel}>Recent flows</div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-xs text-red-300">{error}</div>
      )}
      {data.traceError && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
          Tracing error: {data.traceError}
        </div>
      )}
      {backtraceSummary && (
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-4 py-3 text-xs text-cyan-200">
          {backtraceSummary}
        </div>
      )}

      <div className={styles.swarmGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>Tracked wallets</p>
            <span className={styles.pill}>Add an address to watch</span>
          </div>
          <form
            className="grid gap-2 border-b border-white/5 p-4 sm:grid-cols-[1fr_1fr]"
            onSubmit={(event) =>
              submit(event, "add-wallet", { address: walletAddress, label: walletLabel, note: walletNote }, () => {
                setWalletAddress("");
                setWalletLabel("");
                setWalletNote("");
              })
            }
          >
            <input
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              placeholder={chain === "tron" ? "T… Tron wallet address" : "0x… wallet address"}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[#eafcff] outline-none placeholder:text-white/25 focus:border-cyan-400/50"
            />
            <input
              value={walletLabel}
              onChange={(event) => setWalletLabel(event.target.value)}
              placeholder="Label (e.g. VALR hot wallet)"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#eafcff] outline-none placeholder:text-white/25 focus:border-cyan-400/50"
            />
            <input
              value={walletNote}
              onChange={(event) => setWalletNote(event.target.value)}
              placeholder="Note (optional)"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#eafcff] outline-none placeholder:text-white/25 focus:border-cyan-400/50 sm:col-span-2"
            />
            <button
              type="submit"
              disabled={busy}
              className={`${styles.btn} ${styles.btnPrimary} sm:col-span-2`}
            >
              Track wallet
            </button>
          </form>
          <div className="max-h-[320px] overflow-y-auto">
            {data.wallets.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-white/40">No wallets tracked yet.</p>
            ) : (
              data.wallets.map((wallet) => (
                <div key={wallet.address} className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void openWallet(wallet.address)}
                    title="Inspect funding sources and destinations"
                    className="min-w-0 text-left"
                  >
                    <p className="truncate text-xs font-semibold text-cyan-200 hover:text-cyan-100">
                      {wallet.label} <span className="text-white/30">· inspect ↗</span>
                    </p>
                    <p className="truncate font-mono text-[11px] text-white/45">{short(wallet.address)}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {wallet.chain === "tron" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runBacktrace(wallet.address)}
                        className="shrink-0 rounded-full border border-cyan-400/30 px-2.5 py-1 text-[10px] text-cyan-300 hover:bg-cyan-400/10"
                      >
                        Backtrace
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        submit(
                          null,
                          "remove-wallet",
                          { address: wallet.address },
                          () => {},
                        )
                      }
                      className="shrink-0 rounded-full border border-red-400/25 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-400/10"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>KYC endpoints</p>
            <span className={styles.pill}>Watch for arrivals here</span>
          </div>
          <form
            className="grid gap-2 border-b border-white/5 p-4"
            onSubmit={(event) =>
              submit(event, "add-endpoint", { address: endpointAddress, label: endpointLabel }, () => {
                setEndpointAddress("");
                setEndpointLabel("");
              })
            }
          >
            <input
              value={endpointAddress}
              onChange={(event) => setEndpointAddress(event.target.value)}
              placeholder={chain === "tron" ? "T… deposit / hot wallet" : "0x… deposit / hot wallet"}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[#eafcff] outline-none placeholder:text-white/25 focus:border-cyan-400/50"
            />
            <input
              value={endpointLabel}
              onChange={(event) => setEndpointLabel(event.target.value)}
              placeholder="Label (e.g. VALR deposit)"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#eafcff] outline-none placeholder:text-white/25 focus:border-cyan-400/50"
            />
            <button type="submit" disabled={busy} className={`${styles.btn} ${styles.btnPrimary}`}>
              Add endpoint
            </button>
          </form>
          <div className="max-h-[320px] overflow-y-auto">
            {data.endpoints.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-white/40">
                No endpoints yet. Add an exchange deposit address to generate leads.
              </p>
            ) : (
              data.endpoints.map((endpoint) => (
                <div key={endpoint.address} className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-emerald-300">{endpoint.label}</p>
                    <p className="truncate font-mono text-[11px] text-white/45">{short(endpoint.address)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      submit(
                        null,
                        "remove-endpoint",
                        { address: endpoint.address },
                        () => {},
                      )
                    }
                    className="shrink-0 rounded-full border border-red-400/25 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-400/10"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedWallet && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>Wallet dossier</p>
            <span className={styles.pill}>{short(selectedWallet)}</span>
          </div>
          {dossierLoading ? (
            <p className="px-5 py-10 text-center text-xs text-white/40">Loading wallet history…</p>
          ) : dossier ? (
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                  <p className="font-mono text-[10px] text-white/40">TRANSFERS</p>
                  <p className="mt-1 text-lg font-semibold text-[#eafcff]">{dossier.transfers}</p>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                  <p className="font-mono text-[10px] text-white/40">FIRST ACTIVITY</p>
                  <p className="mt-1 font-mono text-xs text-[#eafcff]">{clock(dossier.firstActivity)}</p>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                  <p className="font-mono text-[10px] text-white/40">LAST ACTIVITY</p>
                  <p className="mt-1 font-mono text-xs text-[#eafcff]">{clock(dossier.lastActivity)}</p>
                </div>
              </div>

              {Object.keys(dossier.totals).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(dossier.totals).map(([asset, total]) => (
                    <span key={asset} className={styles.pill}>
                      {asset} · in {total.in.toLocaleString("en-US", { maximumFractionDigits: 2 })} · out{" "}
                      {total.out.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-emerald-300">
                    FUNDING SOURCES
                  </p>
                  {dossier.inflow.length === 0 ? (
                    <p className="text-xs text-white/40">No inbound transfers found.</p>
                  ) : (
                    dossier.inflow.map((row) => (
                      <a
                        key={`${row.address}-${row.asset}`}
                        href={
                          dossier.chain === "tron"
                            ? `https://tronscan.org/#/address/${row.address}`
                            : `https://etherscan.io/address/${row.address}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-xs hover:bg-white/3"
                      >
                        <span className="min-w-0 truncate font-mono text-cyan-200">
                          {row.label || short(row.address)}
                        </span>
                        <span className="shrink-0 text-white/70">
                          {row.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {row.asset}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-white/35">{row.count}x · {clock(row.last)}</span>
                      </a>
                    ))
                  )}
                </div>
                <div>
                  <p className="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-amber-300">
                    DESTINATIONS
                  </p>
                  {dossier.outflow.length === 0 ? (
                    <p className="text-xs text-white/40">No outbound transfers found.</p>
                  ) : (
                    dossier.outflow.map((row) => (
                      <a
                        key={`${row.address}-${row.asset}`}
                        href={
                          dossier.chain === "tron"
                            ? `https://tronscan.org/#/address/${row.address}`
                            : `https://etherscan.io/address/${row.address}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-xs hover:bg-white/3"
                      >
                        <span className="min-w-0 truncate font-mono text-amber-200">
                          {row.label || short(row.address)}
                        </span>
                        <span className="shrink-0 text-white/70">
                          {row.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {row.asset}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-white/35">{row.count}x · {clock(row.last)}</span>
                      </a>
                    ))
                  )}
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-white/35">{dossier.note}</p>
            </div>
          ) : null}
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <p className={styles.panelTitle}>KYC leads</p>
          <span className={styles.pillCut}>{data.leadCount} total</span>
        </div>
        {data.leads.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-white/40">
            No leads yet. Track a wallet and add an exchange endpoint, then wait for a matching flow.
          </p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {data.leads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => setSelectedId(lead.id)}
                className={`grid w-full grid-cols-[58px_1fr_100px] gap-3 border-b border-white/5 px-4 py-3 text-left transition sm:grid-cols-[58px_120px_1fr_110px] ${
                  selected?.id === lead.id ? "bg-cyan-400/8" : "hover:bg-white/3"
                }`}
              >
                <span className="font-mono text-[11px] text-white/40">{clock(lead.detected_at)}</span>
                <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-center font-mono text-[10px] font-bold text-emerald-300 sm:inline">
                  HOP {lead.hop}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-cyan-200">
                    {short(lead.root_wallet)} → {lead.to_label || short(lead.to_addr)}
                  </span>
                  <span className="block truncate text-[11px] text-white/45">{short(lead.from_addr)} → {short(lead.to_addr)}</span>
                </span>
                <span className="text-right font-mono text-[11px] text-white/65">{amount(lead)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>Selected lead · evidence path</p>
            <span className={styles.pillCut}>DRY RUN · NO CONTACT MADE</span>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              {path.map((node, index) => (
                <span key={`${node.address}-${index}`} className="flex items-center gap-2">
                  <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <span className="block font-mono text-[10px] text-white/40">HOP {node.hop}</span>
                    <span className="block text-xs font-semibold text-cyan-200">{node.label || short(node.address)}</span>
                    <span className="block font-mono text-[10px] text-white/40">{short(node.address)}</span>
                  </span>
                  {index < path.length - 1 && <span className="text-white/30">→</span>}
                </span>
              ))}
            </div>
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
              <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-amber-300">PROPOSED NEXT STEP</p>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-100/85">
                DRY RUN → prepare a KYC request package for {selected.to_label || short(selected.to_addr)} with
                transaction hash {selected.tx_hash}. No request is sent.
              </p>
            </div>
            <a
              href={
                selected.chain === "tron"
                  ? `https://tronscan.org/#/transaction/${selected.tx_hash}`
                  : `https://etherscan.io/tx/${selected.tx_hash}`
              }
              target="_blank"
              rel="noreferrer"
              className="block break-all font-mono text-[11px] text-cyan-300/70 hover:text-cyan-200"
            >
              {selected.tx_hash} ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
