import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { TraceConsole } from "@/components/sentinel/trace-console";
import {
  countLeads,
  getHops,
  getKycEndpoints,
  getState,
  getTrackedWallets,
  readFlows,
} from "@/lib/sentinel/database";
import type { TraceSnapshot } from "@/lib/sentinel/types";
import { styles } from "@/components/sentinel/styles";
import "../sentinel.css";

export const metadata: Metadata = {
  title: "Sentinel Trace — Wallet Tracking & KYC Leads",
  description: "Track wallets, follow fund flows across hops, and flag arrivals at KYC-able endpoints.",
};

function snapshot(): TraceSnapshot {
  return {
    chain: "ethereum" as const,
    tronLastBlock: Number(getState("tronLastBlock") || "0"),
    wallets: getTrackedWallets(),
    endpoints: getKycEndpoints(),
    leads: readFlows(60, true),
    flows: readFlows(80),
    activeHops: getHops().length,
    leadCount: countLeads(),
    traceError: getState("traceError") ?? "",
  };
}

async function TraceData() {
  await connection();
  return <TraceConsole initial={snapshot()} />;
}

export default function SentinelTracePage() {
  return (
    <div className={`sentinel-shell ${styles.sentinelShell}`}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />
      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-6 md:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/sentinel" className="text-sm text-white/50 transition hover:text-white">
              ← Concept
            </Link>
            <span className="text-white/20">/</span>
            <Link href="/sentinel/live" className="text-sm text-white/50 transition hover:text-white">
              Live
            </Link>
            <span className="text-white/20">/</span>
            <span className="font-mono text-sm font-semibold tracking-tight text-cyan-200">TRACE</span>
          </div>
          <span className={styles.pillCut}>ALERTS + DRY RUNS ONLY</span>
        </header>

        <main className="mx-auto max-w-[1200px] px-5 pb-20 md:px-8">
          <div className="mb-8">
            <p className={styles.sectionLabel}>Wallet tracking</p>
            <h1 className={`mt-2 text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-tight tracking-[-0.05em] ${styles.glowText}`}>
              Follow the money.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
              Add an Ethereum or Tron wallet, watch ETH / TRX and stablecoin outflows across up to three
              hops, and get a lead when the funds land at an address you have labelled as KYC-able — an
              exchange deposit, a custody provider, or an OTC desk. Nothing is contacted or signed.
            </p>
          </div>

          <Suspense
            fallback={
              <div className={`${styles.card} p-10 text-center text-sm text-white/50`}>
                Loading tracer…
              </div>
            }
          >
            <TraceData />
          </Suspense>

          <p className="mt-6 text-xs leading-relaxed text-white/35">
            Hop addresses are retained for roughly 2.5 hours of blocks. Tracked wallets and endpoints can
            also be seeded on boot with SENTINEL_WATCHED_ADDRESSES and SENTINEL_KYC_ENDPOINTS.
          </p>
        </main>
      </div>
    </div>
  );
}
