import type { Metadata } from "next";
import { SwarmConsole } from "@/components/sentinel/swarm-console";
import { styles } from "@/components/sentinel/styles";
import "./sentinel.css";

export const metadata: Metadata = {
  title: "Sentinel — Autonomous On-Chain Defense",
  description:
    "A concept draft: an always-on, permissioned swarm of agents that detects exploits, traces funds, and continuously audits smart contracts.",
};

const PILLARS = [
  {
    tag: "01 / DETECT",
    title: "Catch it before the block lands.",
    body: "Agents watch the mempool and chain state for a narrow set of high-signal exploit patterns. Every alert is replayed on a fork, so what reaches you is evidence — not a hunch.",
    color: "#60a5fa",
  },
  {
    tag: "02 / DEFEND",
    title: "Act — but only how you allow.",
    body: "When a threat is confirmed, a response is simulated first, then executed only if it sits inside the policy you set. Pause, rate-limit, notify. The keys stay yours.",
    color: "#34d399",
  },
  {
    tag: "03 / ASSURE",
    title: "Audit on every deploy.",
    body: "The audit agent re-checks code as it ships and diffs new findings against known exploit classes. It makes human auditors faster, not obsolete — and it's the product that pays for the rest.",
    color: "#f472b6",
  },
];

const IN_SCOPE = [
  "One deployment you control, audit, and can shut down",
  "Replay-backed detections you can actually verify",
  "Auto-response bounded by a client-signed policy",
  "Continuous auditing as the paid product",
  "Fund-flow intelligence and evidence reports",
];

const OUT_OF_SCOPE = [
  ["\"Decentralized AI brain\"", "Coordination is decentralized; inference stays off-chain and boring."],
  ["Preemptive freezing", "You can't seize funds on-chain. This produces intelligence and evidence."],
  ["Hack back", "Offensive action is illegal almost everywhere. Defensive only."],
  ["Unilateral autonomy", "A bad autonomous action is itself an exploit."],
  ["Token-first, every chain", "One chain, a few exploit classes, then expand."],
];

const CONTROL = [
  {
    title: "One operator, for now",
    body: "v1 runs as a single deployment you control. Fast fixes, clear accountability, no coordination overhead. Multi-operator comes later — only if it earns its place.",
  },
  {
    title: "Your keys, your policy",
    body: "The signer lives in your infrastructure, not ours. Every automated action is bounded by a policy you sign, and you can revoke it at any time.",
  },
  {
    title: "On Render, today",
    body: "Web service, background worker, Postgres and Redis — all in one account you own. No new infrastructure to learn before the idea is proven.",
  },
];

const TIERS = [
  { name: "Monitor", detail: "Verified alerts + evidence stream", note: "Alerts only, no action rights" },
  { name: "Guardian", detail: "Bounded auto-response on fork-simulated actions", note: "Client signs the policy" },
  { name: "Enterprise", detail: "Continuous audit + incident response retainer", note: "Human sign-off included" },
];

function ShieldMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <path
        d="M16 2 27 6.5v8.2c0 7-4.4 12.4-11 15.3C9.4 27.1 5 21.7 5 14.7V6.5L16 2Z"
        fill="rgba(34,211,238,0.1)"
        stroke="#22d3ee"
        strokeWidth="1.5"
      />
      <path d="M10.5 16.2 14 19.7l7.5-8" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SentinelPage() {
  return (
    <div className={`sentinel-shell ${styles.sentinelShell}`}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-6 md:px-8">
          <div className="flex items-center gap-2.5">
            <ShieldMark />
            <span className="text-lg font-bold tracking-[-0.04em] text-[#eafcff]">SENTINEL</span>
            <span className={`ml-2 hidden sm:inline ${styles.pill}`}>
              <span className={styles.liveDot} /> NETWORK LIVE
            </span>
          </div>
          <nav className="flex items-center gap-4 md:gap-7" aria-label="Sentinel navigation">
            <a className="hidden text-sm text-white/60 transition hover:text-white md:inline" href="/sentinel/live">Live</a>
            <a className="hidden text-sm text-white/60 transition hover:text-white md:inline" href="/sentinel/trace">Trace</a>
            <a className="hidden text-sm text-white/60 transition hover:text-white sm:inline" href="#swarm">Swarm</a>
            <a className="hidden text-sm text-white/60 transition hover:text-white md:inline" href="#approach">Approach</a>
            <a className="hidden text-sm text-white/60 transition hover:text-white md:inline" href="#guardrails">Guardrails</a>
            <a
              className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
              href="#access"
            >
              Request access
            </a>
          </nav>
        </header>

        <main>
          <section className="mx-auto max-w-[1000px] px-5 pb-16 pt-10 text-center md:pb-24 md:pt-20">
            <span className={styles.pill}>CONCEPT DRAFT · v0</span>
            <h1 className={`mt-7 text-[clamp(2.6rem,7vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.06em] ${styles.glowText}`}>
              Security that
              <br />
              never blinks.
            </h1>
            <p className="mx-auto mt-7 max-w-[720px] text-[clamp(1rem,2vw,1.25rem)] leading-relaxed text-[#b9d1d7]">
              An always-on network of agents that catches the exploit while it&apos;s still in the mempool,
              follows where the money went, and finds the bugs before someone else does — for the protocols
              that pay it to watch.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href="/sentinel/live" className={`${styles.btn} ${styles.btnPrimary}`}>
                Open live detector →
              </a>
              <a href="#swarm" className={`${styles.btn} ${styles.btnGhost}`}>
                Run the live incident
              </a>
            </div>
            <p className="mt-5 text-xs text-white/40">
              Permissioned by design. Every action simulated. The client keeps the keys.
            </p>
          </section>

          <section id="swarm" className="mx-auto max-w-[1200px] scroll-mt-8 px-5 pb-20 md:px-8">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className={styles.sectionLabel}>The swarm, in motion</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
                  Watch one incident, end to end.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-white/50">
                Hit &ldquo;Run live incident&rdquo; and follow the signal as it moves from detection to a
                signed, simulated response. Click any node to inspect its role.
              </p>
            </div>
            <SwarmConsole />
          </section>

          <section id="approach" className="mx-auto max-w-[1200px] scroll-mt-8 px-5 pb-20 md:px-8">
            <p className={styles.sectionLabel}>The approach</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
              Three jobs. One loop.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {PILLARS.map((pillar) => (
                <div key={pillar.tag} className={`${styles.card} p-6`}>
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: pillar.color, boxShadow: `0 0 14px ${pillar.color}` }}
                  />
                  <p className="mt-5 font-mono text-xs font-semibold tracking-[0.16em]" style={{ color: pillar.color }}>
                    {pillar.tag}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#eafcff]">{pillar.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/55">{pillar.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs text-white/50">
              {["DETECT", "VERIFY", "SIMULATE", "ACT", "REPORT"].map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="rounded-md border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-cyan-200/80">{step}</span>
                  {i < 4 && <span className="text-white/25">→</span>}
                </span>
              ))}
            </div>
          </section>

          <section id="guardrails" className="mx-auto max-w-[1200px] scroll-mt-8 px-5 pb-20 md:px-8">
            <p className={styles.sectionLabel}>What we cut</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
              The discipline is in the exclusions.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className={`${styles.card} p-6`}>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">In scope</h3>
                <ul className="mt-5 space-y-3">
                  {IN_SCOPE.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/70">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`${styles.card} p-6`}>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-red-300">Deliberately out</h3>
                <ul className="mt-5 space-y-4">
                  {OUT_OF_SCOPE.map(([title, why]) => (
                    <li key={title} className="text-sm leading-relaxed">
                      <span className={styles.pillCut}>{title}</span>
                      <span className="mt-1 block text-white/55">{why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-[1200px] px-5 pb-20 md:px-8">
            <p className={styles.sectionLabel}>Control</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
              Centralized on purpose. Open to decentralize later.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {CONTROL.map((item) => (
                <div key={item.title} className={`${styles.card} p-6`}>
                  <h3 className="text-lg font-semibold text-[#eafcff]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="access" className="mx-auto max-w-[1200px] scroll-mt-8 px-5 pb-24 md:px-8">
            <div className={`${styles.card} overflow-hidden`}>
              <div className="border-b border-white/5 p-7 md:p-10">
                <p className={styles.sectionLabel}>Early access</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
                  Built for protocols that can&apos;t afford to blink.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55">
                  Start with monitoring on one chain. Turn on bounded response only when the numbers
                  convince you. This page is a concept draft — no signup is wired up yet.
                </p>
              </div>
              <div className="grid md:grid-cols-3">
                {TIERS.map((tier, i) => (
                  <div key={tier.name} className={`p-7 ${i < 2 ? "border-b border-white/5 md:border-b-0 md:border-r" : ""}`}>
                    <h3 className="text-lg font-semibold text-[#eafcff]">{tier.name}</h3>
                    <p className="mt-2 text-sm text-white/65">{tier.detail}</p>
                    <p className="mt-4 font-mono text-xs text-cyan-300/70">{tier.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/5 px-5 py-8 md:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 text-xs text-white/35">
            <span>SENTINEL · concept draft</span>
            <span>Illustrative only — nothing here is connected to a live chain.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
