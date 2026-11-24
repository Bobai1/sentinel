# Sentinel

Sentinel is an always-on on-chain monitor. It watches Ethereum and Tron for fund flows involving tracked wallets, follows those flows across hops, and flags arrivals at labelled exchange endpoints as KYC leads.

This is a standalone project. It is completely separate from HelloPanda: its own repo, its own deploy configuration, its own database, and its own detector process.

## What it does today

- Reads new Ethereum blocks via a configurable JSON-RPC endpoint.
- Reads Tron blocks and TRC-20 transfers via TronGrid.
- Detects large native transfers, unlimited approvals, watched addresses, and funded contract deployments on Ethereum.
- Follows ETH / TRX / stablecoin outflows up to three hops.
- Flags flows that land on labelled exchange endpoints as `KYC_LEAD` alerts.
- Exposes a live dashboard at `/sentinel/live` and a wallet tracing console at `/sentinel/trace`.
- Includes a historical Tron backtrace and wallet dossiers with funding sources and destinations.

Everything is read-only. No keys are loaded and no transactions are broadcast.

## Running locally

```bash
npm install
cp .env.example .env
npm run dev
```

Set `SENTINEL_RPC_URL` and `SENTINEL_TRON_RPC_URL` to your providers. The defaults are public endpoints and are rate-limited.

## Deploying

`render.yaml` defines a single always-on Docker web service with a persistent disk for SQLite. Deploy it as a Blueprint in Render. It does not depend on any other service.

## Environment

See `.env.example`. No variable is required to view the demo console; all detectors degrade gracefully if endpoints are unavailable.
