import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";

const API = (process.env.SENTINEL_TRON_RPC_URL || "https://api.trongrid.io").replace(/\/$/, "");
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class TronRpcError extends Error {}

function base58Encode(bytes: Buffer) {
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let encoded = "";
  while (value > BigInt(0)) {
    encoded = ALPHABET[Number(value % BigInt(58))] + encoded;
    value /= BigInt(58);
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

function base58Decode(text: string) {
  let value = BigInt(0);
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new TronRpcError("Invalid Base58 address");
    value = value * BigInt(58) + BigInt(index);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = Buffer.from(hex, "hex");
  let leading = 0;
  for (const char of text) {
    if (char !== "1") break;
    leading++;
  }
  return Buffer.concat([Buffer.alloc(leading), bytes]);
}

function checksum(payload: Buffer) {
  return createHash("sha256")
    .update(createHash("sha256").update(payload).digest())
    .digest()
    .subarray(0, 4);
}

/** Convert a Tron hex address (`41...` or `0x41...`) to Base58 `T...`. */
export function hexToBase58(hex: string) {
  const clean = hex.replace(/^0x/, "");
  const payload = Buffer.from(clean, "hex");
  if (payload.length !== 21) throw new TronRpcError("Expected a 21-byte Tron address");
  return base58Encode(Buffer.concat([payload, checksum(payload)]));
}

/** Convert a Base58 `T...` address to its 21-byte hex form (`41...`). */
export function base58ToHex(address: string) {
  const decoded = base58Decode(address);
  if (decoded.length !== 25) throw new TronRpcError("Expected a 25-byte Base58Check address");
  const payload = decoded.subarray(0, 21);
  const expected = checksum(payload);
  if (!decoded.subarray(21).equals(expected)) throw new TronRpcError("Invalid address checksum");
  return payload.toString("hex");
}

function get(path: string, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(`${API}${path}`);
    const request = httpsRequest(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { accept: "application/json", "user-agent": "sentinel-detector/1.0" },
        timeout: timeoutMs,
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          if ((response.statusCode ?? 0) !== 200) {
            reject(new TronRpcError(`TronGrid returned ${response.statusCode}: ${text.slice(0, 160)}`));
            return;
          }
          resolve(text);
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("TronGrid timeout")));
    request.on("error", reject);
    request.end();
  });
}

function post(path: string, body: unknown, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(`${API}${path}`);
    const payload = JSON.stringify(body);
    const request = httpsRequest(
      {
        hostname: url.hostname,
        path: url.pathname,
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
        response.on("end", () => {
          if ((response.statusCode ?? 0) !== 200) {
            reject(new TronRpcError(`TronGrid returned ${response.statusCode}: ${text.slice(0, 160)}`));
            return;
          }
          resolve(text);
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("TronGrid timeout")));
    request.on("error", reject);
    request.end(payload);
  });
}

export type TronTransferContract = {
  owner_address: string;
  to_address: string;
  amount: number;
};

export type TronTransaction = {
  txID?: string;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: { value?: TronTransferContract & Record<string, unknown> };
    }>;
  };
  ret?: Array<{ contractRet?: string }>;
};

export type TronBlock = {
  block_header?: { raw_data?: { number?: number; timestamp?: number } };
  transactions?: TronTransaction[];
};

export async function getNowBlock(): Promise<TronBlock> {
  return JSON.parse(await post("/wallet/getnowblock", {}, 15000)) as TronBlock;
}

export type TronTrc20Transfer = {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  type: string;
  block_timestamp?: number;
  block_number?: number;
  token_info?: { symbol?: string; decimals?: number; address?: string };
};

export async function getTrc20Transfers(address: string, limit = 30): Promise<TronTrc20Transfer[]> {
  const encoded = encodeURIComponent(address);
  const json = JSON.parse(await get(`/v1/accounts/${encoded}/transactions/trc20?limit=${limit}`, 15000)) as {
    data?: TronTrc20Transfer[];
  };
  return json.data ?? [];
}

export type TronNativeTransaction = {
  txID?: string;
  blockNumber?: number;
  block_timestamp?: number;
  ret?: Array<{ contractRet?: string }>;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: { value?: { owner_address?: string; to_address?: string; amount?: number } };
    }>;
  };
};

export async function getAccountTransactions(address: string, limit = 200): Promise<TronNativeTransaction[]> {
  const encoded = encodeURIComponent(address);
  const json = JSON.parse(await get(`/v1/accounts/${encoded}/transactions?limit=${limit}`, 15000)) as {
    data?: TronNativeTransaction[];
  };
  return json.data ?? [];
}
