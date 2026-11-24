import { NextResponse, connection } from "next/server";
import { buildEthereumDossier, buildTronDossier, type Dossier } from "@/lib/sentinel/dossier";
import type { Chain } from "@/lib/sentinel/database";

const ETH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") ?? "").trim();
  const chain: Chain = url.searchParams.get("chain") === "tron" ? "tron" : "ethereum";

  const valid = chain === "tron" ? TRON_ADDRESS.test(address) : ETH_ADDRESS.test(address);
  if (!valid) {
    return NextResponse.json({ error: `Invalid ${chain} address` }, { status: 400 });
  }

  try {
    const dossier: Dossier =
      chain === "tron" ? await buildTronDossier(address) : buildEthereumDossier(address);
    return NextResponse.json(dossier, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build dossier" },
      { status: 503 },
    );
  }
}
