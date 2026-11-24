import { getState, setState, insertAlerts, seedWatchlistFromEnv } from "./database";
import { getBlockNumber, getBlock, getTransferLogs } from "./rpc";
import { detectBlock } from "./detect";
import { traceBlock } from "./trace";
import { traceTronBlock } from "./trace-tron";

type DetectorGlobal = typeof globalThis & {
  sentinelDetectorStarted?: boolean;
  sentinelDetectorTimer?: ReturnType<typeof setInterval>;
  sentinelTronTimer?: ReturnType<typeof setInterval>;
};

const detectorGlobal = globalThis as DetectorGlobal;

export function startDetector() {
  if (detectorGlobal.sentinelDetectorStarted) return;
  detectorGlobal.sentinelDetectorStarted = true;

  const pollMs = Math.max(4000, Number(process.env.SENTINEL_POLL_MS || 12000));
  const minEth = Number(process.env.SENTINEL_MIN_ETH || 10);
  const watched = (process.env.SENTINEL_WATCHED_ADDRESSES || "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  seedWatchlistFromEnv();
  const tracing = process.env.SENTINEL_TRACE !== "0";

  for (const [key, value] of [
    ["status", "running"],
    ["blocksScanned", "0"],
    ["txScanned", "0"],
    ["lastError", ""],
  ]) {
    if (getState(key) === undefined) setState(key, value);
  }

  let lastBlock = Number(getState("lastBlock") || "0");

  const tick = async () => {
    try {
      const head = parseInt(await getBlockNumber(), 16);

      // First run, or a long outage: jump close to the head instead of
      // replaying thousands of old blocks (public RPCs treat those as archive
      // requests and reject them).
      if (!lastBlock || head - lastBlock > 50) {
        lastBlock = Math.max(0, head - 2);
        setState("lastBlock", String(lastBlock));
      }

      if (head < lastBlock) {
        setState("lastError", "RPC head moved backwards — possible reorg");
        return;
      }

      let processed = 0;
      let transactions = 0;
      for (let number = lastBlock; number <= head && processed < 3; number++) {
        const block = await getBlock(`0x${number.toString(16)}`);
        transactions += block.transactions.length;

        const detections = detectBlock(block, { minEth, watched });
        const detectedAt = new Date().toISOString();

        let tracedAlerts: Awaited<ReturnType<typeof traceBlock>>["alerts"] = [];
        // eth_getLogs on older blocks is an archive request on most public
        // RPCs, so only trace blocks that are effectively at the tip.
        if (tracing && head - number <= 10) {
          try {
            const hex = `0x${number.toString(16)}`;
            tracedAlerts = traceBlock(block, await getTransferLogs(hex), number).alerts;
            setState("traceError", "");
          } catch (error) {
            setState("traceError", error instanceof Error ? error.message : String(error));
          }
        }

        insertAlerts(
          [...detections, ...tracedAlerts].map((detection) => ({
            ...detection,
            id: `${number}:${detection.tx_hash}:${detection.kind}`.slice(0, 200),
            block_number: number,
            tx_hash: detection.tx_hash,
            detected_at: detectedAt,
          })),
        );

        lastBlock = number + 1;
        processed++;
        setState("lastBlock", String(lastBlock));
      }

      setState("lastRunAt", new Date().toISOString());
      setState("lastError", "");
      setState("blocksScanned", String(Number(getState("blocksScanned") || "0") + processed));
      setState("txScanned", String(Number(getState("txScanned") || "0") + transactions));
    } catch (error) {
      setState("lastError", error instanceof Error ? error.message : String(error));
      setState("lastRunAt", new Date().toISOString());
    }
  };

  void tick();
  detectorGlobal.sentinelDetectorTimer = setInterval(tick, pollMs);
  detectorGlobal.sentinelDetectorTimer.unref?.();

  if (process.env.SENTINEL_TRON !== "0") {
    const tronPoll = Math.max(8000, Number(process.env.SENTINEL_TRON_POLL_MS || 15000));
    const tronTick = async () => {
      try {
        const result = await traceTronBlock();
        setState("tronLastBlock", String(result.blockNumber));
        setState("tronLastRunAt", new Date().toISOString());
        setState("tronError", "");
        const detectedAt = new Date().toISOString();
        insertAlerts(
          result.alerts.map((alert) => ({
            ...alert,
            id: `tron:${alert.id}`.slice(0, 200),
            detected_at: detectedAt,
          })),
        );
      } catch (error) {
        setState("tronError", error instanceof Error ? error.message : String(error));
        setState("tronLastRunAt", new Date().toISOString());
      }
    };
    void tronTick();
    detectorGlobal.sentinelTronTimer = setInterval(tronTick, tronPoll);
    detectorGlobal.sentinelTronTimer.unref?.();
  }

  console.log(
    `[sentinel] detector started · poll ${pollMs}ms · min ${minEth} ETH · ${watched.length} watched addresses · tracing ${tracing ? "on" : "off"} · tron ${process.env.SENTINEL_TRON === "0" ? "off" : "on"}`,
  );
}
