"use client";

import { useEffect, useState } from "react";
import type { SentinelSnapshot } from "@/lib/sentinel/types";
import { styles } from "@/components/sentinel/styles";

function short(address: string) {
  if (!address || address === "(contract creation)") return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function clock(iso: string) {
  return iso.length >= 19 ? iso.slice(11, 19) : "—";
}

const SEVERITY: Record<string, string> = {
  high: "border-red-400/40 bg-red-400/10 text-red-300",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  low: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
};

export function LiveConsole({ initial }: { initial: SentinelSnapshot }) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.alerts[0]?.id ?? null);
  const [lastPoll, setLastPoll] = useState("");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/sentinel/events", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as SentinelSnapshot;
        if (!active) return;
        setData(next);
        setLastPoll(new Date().toISOString().slice(11, 19));
      } catch {
        // Keep the last good snapshot on a transient network error.
      }
    };
    const id = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [paused]);

  const selected = data.alerts.find((alert) => alert.id === selectedId) ?? data.alerts[0];

  return (
    <div className={styles.console}>
      <div className={`${styles.card} ${styles.consoleTop}`}>
        <div>
          <h2 className={styles.consoleTitle}>Live detector · Ethereum mainnet</h2>
          <p className={styles.consoleSub}>
            Polling public RPC for new blocks. Alerts are real; responses are dry runs only.
          </p>
        </div>
        <div className={styles.btnRow}>
          <span className={styles.pill}>
            <span className={styles.liveDot} />
            {data.state.status === "running" ? "DETECTOR RUNNING" : data.state.status.toUpperCase()}
          </span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "Resume feed" : "Pause feed"}
          </button>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>#{data.state.lastBlock.toLocaleString("en-US")}</div>
          <div className={styles.statLabel}>Latest block</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.state.blocksScanned.toLocaleString("en-US")}</div>
          <div className={styles.statLabel}>Blocks scanned</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.state.txScanned.toLocaleString("en-US")}</div>
          <div className={styles.statLabel}>Transactions read</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.total.toLocaleString("en-US")}</div>
          <div className={styles.statLabel}>Alerts stored</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.alerts.filter((a) => a.severity === "high").length}</div>
          <div className={styles.statLabel}>High severity (visible)</div>
        </div>
      </div>

      {data.state.lastError && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-xs text-red-300">
          Last RPC error: {data.state.lastError}
        </div>
      )}

      <div className={styles.swarmGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>Alert stream</p>
            <span className={styles.pill}>
              {lastPoll ? `Updated ${lastPoll}` : `Last scan ${clock(data.state.lastRunAt)}`}
            </span>
          </div>

          {data.alerts.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-white/45">
              Waiting for the next block… the detector is watching.
            </div>
          ) : (
            <div className="max-h-[620px] overflow-y-auto">
              {data.alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setSelectedId(alert.id)}
                  className={`grid w-full grid-cols-[58px_1fr] gap-3 border-b border-white/5 px-4 py-3 text-left transition sm:grid-cols-[62px_110px_1fr_80px] ${
                    selected?.id === alert.id ? "bg-cyan-400/8" : "hover:bg-white/3"
                  }`}
                >
                  <span className="font-mono text-[11px] text-white/40">{clock(alert.detected_at)}</span>
                  <span className={`hidden justify-self-start rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold sm:inline ${SEVERITY[alert.severity]}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs font-semibold text-cyan-200">{alert.kind}</span>
                    <span className="block truncate text-[11px] text-white/45">
                      {short(alert.from_addr)} → {short(alert.to_addr)}
                    </span>
                  </span>
                  <span className="hidden text-right font-mono text-[11px] text-white/55 sm:block">
                    {alert.value_eth > 0 ? `${alert.value_eth.toFixed(2)} ETH` : `block ${alert.block_number}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.sideStack}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <p className={styles.panelTitle}>Selected alert</p>
              <span className={styles.pillCut}>DRY RUN · NO SIGNING</span>
            </div>
            {selected ? (
              <div className={styles.detailBody}>
                <h3 className={styles.detailName}>{selected.kind.replace(/_/g, " ")}</h3>
                <p className={styles.detailKind}>
                  Block {selected.block_number} · {clock(selected.detected_at)} · {selected.severity} severity
                </p>
                <p className={styles.detailRole}>{selected.detail}</p>

                <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
                  <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-amber-300">PROPOSED RESPONSE</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-100/85">{selected.proposed_action}</p>
                </div>
                <div className="mt-3 rounded-lg border border-white/8 bg-white/3 p-3">
                  <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-white/45">SIMULATION</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/65">{selected.simulated_result}</p>
                </div>

                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailKey}>From</div>
                    <div className={styles.detailVal}>{short(selected.from_addr)}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailKey}>To</div>
                    <div className={styles.detailVal}>{short(selected.to_addr)}</div>
                  </div>
                </div>

                <a
                  href={`https://etherscan.io/tx/${selected.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 block break-all font-mono text-[11px] text-cyan-300/70 hover:text-cyan-200"
                >
                  {selected.tx_hash} ↗
                </a>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-white/45">No alert selected.</div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <p className={styles.panelTitle}>How this stays safe</p>
            </div>
            <div className="space-y-3 p-5 text-xs leading-relaxed text-white/55">
              <p>• Detection reads public chain data only.</p>
              <p>• Responses are proposed and simulated in text — never signed or broadcast.</p>
              <p>• No private keys are loaded anywhere in this process.</p>
              <p>• Set SENTINEL_DETECTOR=0 to stop the loop without redeploying.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
