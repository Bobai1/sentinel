import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const DEFAULT_RPC = "https://ethereum-rpc.publicnode.com";

export class RpcError extends Error {}

function post(url: string, payload: string, timeoutMs: number) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          accept: "application/json",
          "user-agent": "sentinel-detector/1.0",
        },
        timeout: timeoutMs,
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, text }));
      },
    );
    request.on("timeout", () => request.destroy(new Error("RPC timeout")));
    request.on("error", reject);
    request.end(payload);
  });
}

async function rpc<T>(method: string, params: unknown[], timeoutMs = 15000): Promise<T> {
  const url = process.env.SENTINEL_RPC_URL || DEFAULT_RPC;
  const response = await post(
    url,
    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeoutMs,
  );
  if (response.status !== 200) {
    throw new RpcError(`RPC returned ${response.status}${response.text ? `: ${response.text.slice(0, 200)}` : ""}`);
  }

  let json: { result?: T; error?: { message?: string } };
  try {
    json = JSON.parse(response.text) as { result?: T; error?: { message?: string } };
  } catch {
    throw new RpcError("RPC returned invalid JSON");
  }
  if (json.error) throw new RpcError(json.error.message ?? "RPC error");
  if (json.result === undefined) throw new RpcError("RPC returned no result");
  return json.result;
}

export type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
};

export type RpcBlock = {
  number: string;
  timestamp: string;
  transactions: RpcTransaction[];
};

export function getBlockNumber() {
  return rpc<string>("eth_blockNumber", []);
}

export function getBlock(hexNumber: string) {
  return rpc<RpcBlock>("eth_getBlockByNumber", [hexNumber, true], 25000);
}

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
  logIndex: string;
};

export function getTransferLogs(hexNumber: string) {
  return rpc<RpcLog[]>(
    "eth_getLogs",
    [{ fromBlock: hexNumber, toBlock: hexNumber, topics: [TRANSFER_TOPIC] }],
    25000,
  );
}
