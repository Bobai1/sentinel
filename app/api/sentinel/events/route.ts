import { NextResponse, connection } from "next/server";
import { countAlerts, getState, readAlerts } from "@/lib/sentinel/database";
import type { SentinelSnapshot } from "@/lib/sentinel/types";

export async function GET() {
  // Cache Components is enabled globally; connection() opts this read out of
  // prerendering so the client always receives the current detector state.
  await connection();

  const snapshot: SentinelSnapshot = {
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

  return NextResponse.json(snapshot, {
    headers: { "cache-control": "no-store" },
  });
}
