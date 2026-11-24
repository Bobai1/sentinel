"use client";

import { useEffect, useState } from "react";
import { styles } from "@/components/sentinel/styles";

type AgentId =
  | "coordinator"
  | "detector"
  | "verifier"
  | "tracer"
  | "guardian"
  | "auditor";

type Agent = {
  id: AgentId;
  name: string;
  kind: string;
  role: string;
  x: number;
  y: number;
  color: string;
  model: string;
  tasks: string;
  rep: string;
};

const AGENTS: Agent[] = [
  {
    id: "coordinator",
    name: "COORDINATOR",
    kind: "Orchestrator",
    role: "Routes tasks between agents, resolves disagreement, and assembles the signed evidence bundle.",
    x: 400, y: 250, color: "#22d3ee",
    model: "router-v3", tasks: "18,204", rep: "99.98%",
  },
  {
    id: "detector",
    name: "DETECTOR-04",
    kind: "Detection agent",
    role: "Watches the mempool and chain state for high-signal exploit patterns before they land in a block.",
    x: 155, y: 110, color: "#60a5fa",
    model: "pattern-v7", tasks: "4,912", rep: "99.91%",
  },
  {
    id: "verifier",
    name: "VERIFIER-11",
    kind: "Verification agent",
    role: "Replays every candidate against a forked state. Its job is to kill false positives before anyone acts.",
    x: 645, y: 110, color: "#a78bfa",
    model: "replay-v4", tasks: "4,308", rep: "99.96%",
  },
  {
    id: "tracer",
    name: "TRACER-02",
    kind: "Forensics agent",
    role: "Expands fund-flow graphs across hops and bridges, linking addresses to known entities.",
    x: 400, y: 440, color: "#f59e0b",
    model: "graph-v5", tasks: "1,106", rep: "99.87%",
  },
  {
    id: "guardian",
    name: "GUARDIAN-01",
    kind: "Action agent",
    role: "Simulates a response on a fork, then executes only the actions a client explicitly authorized.",
    x: 665, y: 385, color: "#34d399",
    model: "policy-v2", tasks: "842", rep: "100.00%",
  },
  {
    id: "auditor",
    name: "AUDITOR-07",
    kind: "Audit agent",
    role: "Continuously reviews code on every deploy and diffs new findings against known exploit classes.",
    x: 135, y: 385, color: "#f472b6",
    model: "audit-v6", tasks: "2,771", rep: "99.94%",
  },
];

const CENTER = { x: 400, y: 250 };
const EDGES = AGENTS.filter((a) => a.id !== "coordinator").map((a) => ({
  target: a.id,
  color: a.color,
  d: `M ${CENTER.x} ${CENTER.y} L ${a.x} ${a.y}`,
}));

const OPERATORS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  // Round so Node and browser produce identical attribute strings (hydration).
  return {
    x: Number((400 + Math.cos(angle) * 352).toFixed(2)),
    y: Number((250 + Math.sin(angle) * 228).toFixed(2)),
  };
});

type Tone = "info" | "warn" | "good" | "neutral" | "ambient";
type Step = {
  t: string;
  kind: string;
  text: string;
  agents: AgentId[];
  tone: Tone;
  delay: number;
};

const INCIDENT: Step[] = [
  { t: "00:00.000", kind: "DETECT", text: "Mempool watcher flagged approve() + transferFrom pattern on 0x7aE…9c2 · chain ETH", agents: ["detector"], tone: "warn", delay: 300 },
  { t: "00:00.412", kind: "SIGNAL", text: "Detector emitted high-confidence signal · entropy 0.91", agents: ["detector"], tone: "warn", delay: 520 },
  { t: "00:00.880", kind: "VERIFY", text: "Replaying candidate against forked state @ block 19,482,113", agents: ["verifier"], tone: "info", delay: 560 },
  { t: "00:01.240", kind: "VERIFY", text: "Reproduction confirmed — drain path valid · $2.4M exposed", agents: ["verifier"], tone: "warn", delay: 540 },
  { t: "00:01.610", kind: "TRACE", text: "Fund-flow graph expanded · 3 hops · 2 known mixers linked", agents: ["tracer"], tone: "info", delay: 520 },
  { t: "00:01.980", kind: "POLICY", text: "Client policy evaluated · allowed: pause() · denied: key rotation, transfers", agents: ["guardian"], tone: "info", delay: 540 },
  { t: "00:02.310", kind: "SIMULATE", text: "Guardian dry-run on fork · pause() → drain reverted · gas within limit", agents: ["guardian", "verifier"], tone: "info", delay: 560 },
  { t: "00:02.740", kind: "ACT", text: "Signed pause() broadcast by guardian multisig · tx 0xf3a…91d", agents: ["guardian"], tone: "good", delay: 520 },
  { t: "00:03.050", kind: "CONFIRM", text: "Block 19,482,114 · vault paused · funds secured", agents: ["guardian", "detector"], tone: "good", delay: 520 },
  { t: "00:03.420", kind: "REPORT", text: "Evidence bundle + signed replay delivered to client dashboard", agents: ["coordinator"], tone: "good", delay: 520 },
  { t: "00:03.700", kind: "LEARN", text: "Verifier indexed new reproduction signature · false-positive rate holds at 0.03%", agents: ["verifier", "auditor"], tone: "neutral", delay: 520 },
];

const AMBIENT = [
  "DETECT  ERC-20 approval anomaly scanned · no action required",
  "VERIFY  14 candidates replayed · 0 confirmed",
  "AUDIT   Deploy diff checked · 2 low-severity findings queued",
  "TRACE   Address cluster linked to known mixer · evidence filed",
  "NETWORK 38 operator nodes attested · consensus nominal",
];

const PIPELINE = ["DETECT", "VERIFY", "SIMULATE", "ACT", "REPORT"];

function pipelineIndex(kind: string) {
  if (kind === "DETECT" || kind === "SIGNAL") return 0;
  if (kind === "VERIFY" || kind === "TRACE") return 1;
  if (kind === "SIMULATE" || kind === "POLICY") return 2;
  if (kind === "ACT" || kind === "CONFIRM") return 3;
  return 4;
}

function formatNumber(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [target, duration]);
  return value;
}

export function SwarmConsole() {
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const [logs, setLogs] = useState<Step[]>([]);
  const [ambientIndex, setAmbientIndex] = useState(0);
  const [activeAgents, setActiveAgents] = useState<AgentId[]>([]);
  const [selected, setSelected] = useState<AgentId>("coordinator");
  const [spark, setSpark] = useState<number[]>(() =>
    Array.from({ length: 24 }, (_, i) =>
      Number((48 + Math.sin(i / 2.6) * 14 + Math.cos(i / 1.7) * 5).toFixed(2)),
    ),
  );

  const threats = useCountUp(12_847_291);
  const verified = useCountUp(4_219);
  const protectedValue = useCountUp(1846);
  const operators = useCountUp(1_284);
  const latency = useCountUp(19);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(setTimeout(resolve, ms));
      });

    (async () => {
      setPhase("running");
      setLogs([]);
      setActiveAgents([]);
      for (const step of INCIDENT) {
        if (cancelled) return;
        await wait(step.delay);
        if (cancelled) return;
        setLogs((prev) => [...prev, step]);
        setActiveAgents(step.agents);
      }
      if (!cancelled) {
        setPhase("complete");
        setActiveAgents([]);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [runId]);

  useEffect(() => {
    if (phase !== "idle") return;
    const id = setInterval(() => setAmbientIndex((i) => (i + 1) % AMBIENT.length), 2400);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => {
      setSpark((prev) => {
        const last = prev[prev.length - 1] ?? 50;
        const next = Math.max(16, Math.min(94, last + (Math.random() - 0.5) * 24));
        return [...prev.slice(1), next];
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const current = logs[logs.length - 1];
  const activeStep = current ? pipelineIndex(current.kind) : -1;
  const selectedAgent = AGENTS.find((a) => a.id === selected) ?? AGENTS[0];

  const sparkPoints = spark
    .map((v, i) => `${((i / (spark.length - 1)) * 300).toFixed(1)},${(46 - v * 0.42).toFixed(1)}`)
    .join(" ");

  return (
    <div className={styles.console}>
      <div className={`${styles.card} ${styles.consoleTop}`}>
        <div>
          <h3 className={styles.consoleTitle}>Swarm console · live simulation</h3>
          <p className={styles.consoleSub}>
            Illustrative — every action below is simulated, nothing touches a real chain.
          </p>
        </div>
        <div className={styles.btnRow}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setRunId((n) => n + 1)}
          >
            {phase === "running" ? "Replay incident" : phase === "complete" ? "Run again" : "Run live incident"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => {
              setRunId(0);
              setLogs([]);
              setPhase("idle");
              setActiveAgents([]);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{formatNumber(threats)}</div>
          <div className={styles.statLabel}>Signals scanned</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{formatNumber(verified)}</div>
          <div className={styles.statLabel}>Verified detections</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>0.03%</div>
          <div className={styles.statLabel}>False positive rate</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>${(protectedValue / 10).toFixed(1)}M</div>
          <div className={styles.statLabel}>Value protected</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{(latency / 10).toFixed(1)}s</div>
          <div className={styles.statLabel}>Mean response</div>
        </div>
      </div>

      <div className={styles.swarmGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <p className={styles.panelTitle}>Agent topology</p>
            <span className={styles.pill}>
              <span className={styles.liveDot} />
              {formatNumber(operators)} nodes monitored
            </span>
          </div>

          <div className={styles.swarmStage}>
            <svg className={styles.svg} viewBox="0 0 800 520" role="img" aria-label="Diagram of the Sentinel agent swarm">
              {OPERATORS.map((o, i) => (
                <circle key={i} cx={o.x} cy={o.y} r={i % 4 === 0 ? 2.6 : 1.6} className={styles.operatorDot} />
              ))}

              <path d="M 155 110 L 645 110" className={styles.meshEdge} />
              <path d="M 135 385 L 665 385" className={styles.meshEdge} />

              {EDGES.map((e) => {
                const active = activeAgents.includes(e.target);
                return (
                  <g key={e.target}>
                    <path
                      d={e.d}
                      stroke={e.color}
                      className={`${styles.edge} ${active ? styles.edgeActive : ""}`}
                    />
                    {active && (
                      <circle r="4" fill={e.color} className={styles.packet}>
                        <animateMotion dur="1.05s" repeatCount="indefinite" path={e.d} />
                      </circle>
                    )}
                  </g>
                );
              })}

              {AGENTS.map((a) => {
                const isActive = a.id === "coordinator" || activeAgents.includes(a.id);
                return (
                  <g
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect ${a.name}`}
                    onClick={() => setSelected(a.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelected(a.id);
                    }}
                    className={`${styles.node} ${isActive ? styles.nodeActive : ""} ${selected === a.id ? styles.nodeSelected : ""}`}
                  >
                    <circle cx={a.x} cy={a.y} r="34" fill={a.color} className={styles.nodeHalo} />
                    <circle cx={a.x} cy={a.y} r="22" stroke={a.color} className={styles.nodeRing} />
                    <circle cx={a.x} cy={a.y} r="7" fill={a.color} className={styles.nodeCore} />
                    <text x={a.x} y={a.y + 46} textAnchor="middle" className={styles.nodeLabel}>
                      {a.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className={styles.pipeline}>
            {PIPELINE.map((label, i) => (
              <div
                key={label}
                className={`${styles.pipelineStep} ${activeStep === i ? styles.pipelineStepActive : ""}`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sideStack}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <p className={styles.panelTitle}>Selected agent</p>
              <span className={styles.pill}>Click a node</span>
            </div>
            <div className={styles.detailBody}>
              <h4 className={styles.detailName} style={{ color: selectedAgent.color }}>
                {selectedAgent.name}
              </h4>
              <p className={styles.detailKind}>{selectedAgent.kind}</p>
              <p className={styles.detailRole}>{selectedAgent.role}</p>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <div className={styles.detailKey}>Model</div>
                  <div className={styles.detailVal}>{selectedAgent.model}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailKey}>Tasks run</div>
                  <div className={styles.detailVal}>{selectedAgent.tasks}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailKey}>Reputation</div>
                  <div className={styles.detailVal}>{selectedAgent.rep}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailKey}>Authority</div>
                  <div className={styles.detailVal}>Client-bounded</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <p className={styles.panelTitle}>Event stream</p>
              <span className={styles.pill}>
                {phase === "running" ? "Incident in progress" : phase === "complete" ? "Incident resolved" : "Ambient monitoring"}
              </span>
            </div>
            <div className={styles.feed}>
              {logs.length > 0
                ? [...logs].reverse().map((step, i) => (
                    <div key={`${step.t}-${i}`} className={`${styles.logRow} ${styles[`tone${step.tone[0].toUpperCase()}${step.tone.slice(1)}`]}`}>
                      <span className={styles.logTime}>{step.t}</span>
                      <span className={styles.logKind}>{step.kind}</span>
                      <span className={styles.logText}>{step.text}</span>
                    </div>
                  ))
                : AMBIENT.map((line, i) => {
                    const kind = line.split(" ")[0];
                    const visible = AMBIENT[(ambientIndex + i) % AMBIENT.length];
                    const visibleKind = visible.split(" ")[0];
                    return (
                      <div key={kind} className={`${styles.logRow} ${styles.toneAmbient}`}>
                        <span className={styles.logTime}>now</span>
                        <span className={styles.logKind}>{visibleKind}</span>
                        <span className={styles.logText}>{visible.slice(visibleKind.length + 1)}</span>
                      </div>
                    );
                  })}
            </div>
            <div className={styles.sparkWrap}>
              <span className={styles.sparkLabel}>THROUGHPUT</span>
              <svg className={styles.spark} viewBox="0 0 300 50" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={sparkPoints} className={styles.sparkLine} />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
