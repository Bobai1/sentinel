import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { LiveConsole } from "@/components/sentinel/live-console";
import { countAlerts, getState, readAlerts } from "@/lib/sentinel/database";
import type { SentinelSnapshot } from "@/lib/sentinel/types";
import { styles } from "@/components/sentinel/styles";
import "../sentinel.css";

export const metadata: Metadata = {
  title: "Sentinel Live — Detector Console",
  description: "Live Ethereum threat detection with dry-run response proposals.",
};

function snapshot(): SentinelSnapshot {
  return {
    alerts: readAlerts(120),
    total: countAlerts(),
    state: {
      status: getState("status") ?? "stopped",
      lastBlock: Number(getState("lastBlock") || "0"),
      lastRunAt: getState("lastRunAt") ?? "",
      lastError: getState("lastError") ?? "",
      blocksScanned: Number(getState("blocksScanned") || "0"),
      txScanned: Number(getState("txScanned") || "0"),
    },
  };
}

async function LiveData() {
  await connection();
  return <LiveConsole initial={snapshot()} />;
}

export default function SentinelLivePage() {
  return (
    <div className={`sentinel-shell ${styles.sentinelShell}`}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />
      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-6 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/sentinel" className="text-sm text-white/50 transition hover:text-white">
              ← Concept
            </Link>
            <span className="text-white/20">/</span>
            <Link href="/sentinel/trace" className="text-sm text-white/50 transition hover:text-white">
              Trace
            </Link>
            <span className="text-white/20">/</span>
            <span className="font-mono text-sm font-semibold tracking-tight text-cyan-200">SENTINEL LIVE</span>
          </div>
          <span className={styles.pillCut}>ALERTS + DRY RUNS ONLY</span>
        </header>

        <main className="mx-auto max-w-[1200px] px-5 pb-20 md:px-8">
          <div className="mb-8">
            <p className={styles.sectionLabel}>Live system</p>
            <h1 className={`mt-2 text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-tight tracking-[-0.05em] ${styles.glowText}`}>
              It&apos;s watching the chain.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
              Real blocks, real transactions, real detections. Proposed responses are printed as
              simulations only — no keys are loaded and nothing is ever broadcast.
            </p>
          </div>

          <Suspense
            fallback={
              <div className={`${styles.card} p-10 text-center text-sm text-white/50`}>
                Connecting to detector…
              </div>
            }
          >
            <LiveData />
          </Suspense>

          <p className="mt-6 text-xs leading-relaxed text-white/35">
            Detection rules: unlimited ERC-20 approvals, blanket NFT operator approvals, large ETH
            transfers, funded contract deployments, and operator-watched addresses. Thresholds are
            configurable with SENTINEL_MIN_ETH and SENTINEL_WATCHED_ADDRESSES.
          </p>
        </main>
      </div>
    </div>
  );
}
