import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

type DbGlobal = typeof globalThis & { sentinelDatabase?: Database.Database };
const dbGlobal = globalThis as DbGlobal;

export type SentinelAlert = {
  id: string;
  block_number: number;
  tx_hash: string;
  kind: string;
  severity: "high" | "medium" | "low";
  from_addr: string;
  to_addr: string;
  value_eth: number;
  detail: string;
  proposed_action: string;
  simulated_result: string;
  detected_at: string;
};

function createDatabase() {
  // Build workers must not contend for the file lock.
  if (process.env.HELLOPANDA_BUILD === "1") {
    return new Database(":memory:");
  }
  const databasePath = path.join(process.cwd(), "data", "sentinel.sqlite");
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const instance = new Database(databasePath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("busy_timeout = 5000");
  return instance;
}

function initialize() {
  const instance = createDatabase();
  instance.exec(`
    CREATE TABLE IF NOT EXISTS sentinel_alerts (
      id TEXT PRIMARY KEY,
      block_number INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      from_addr TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      value_eth REAL NOT NULL,
      detail TEXT NOT NULL,
      proposed_action TEXT NOT NULL,
      simulated_result TEXT NOT NULL,
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_time
      ON sentinel_alerts(detected_at DESC);

    CREATE TABLE IF NOT EXISTS sentinel_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sentinel_tracked_wallets (
      address TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sentinel_kyc_endpoints (
      address TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sentinel_flows (
      id TEXT PRIMARY KEY,
      root_wallet TEXT NOT NULL,
      root_label TEXT NOT NULL,
      from_addr TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      to_label TEXT NOT NULL DEFAULT '',
      asset TEXT NOT NULL,
      amount REAL NOT NULL,
      hop INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      is_kyc_lead INTEGER NOT NULL DEFAULT 0,
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sentinel_flows_time
      ON sentinel_flows(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sentinel_flows_lead
      ON sentinel_flows(is_kyc_lead);

    CREATE TABLE IF NOT EXISTS sentinel_hops (
      address TEXT PRIMARY KEY,
      root_wallet TEXT NOT NULL,
      root_label TEXT NOT NULL,
      hop INTEGER NOT NULL,
      expires_block INTEGER NOT NULL
    );
  `);

  // Gradual migration: existing databases predate the chain column.
  for (const table of [
    "sentinel_tracked_wallets",
    "sentinel_kyc_endpoints",
    "sentinel_flows",
    "sentinel_hops",
  ]) {
    const columns = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "chain")) {
      instance.exec(`ALTER TABLE ${table} ADD COLUMN chain TEXT NOT NULL DEFAULT 'ethereum'`);
    }
  }
  return instance;
}

export function getSentinelDb() {
  if (!dbGlobal.sentinelDatabase) dbGlobal.sentinelDatabase = initialize();
  return dbGlobal.sentinelDatabase;
}

export function getState(key: string): string | undefined {
  const row = getSentinelDb()
    .prepare("SELECT value FROM sentinel_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setState(key: string, value: string) {
  getSentinelDb()
    .prepare(
      "INSERT INTO sentinel_state (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function insertAlerts(alerts: SentinelAlert[]) {
  if (alerts.length === 0) return;
  const db = getSentinelDb();
  const statement = db.prepare(`
    INSERT OR IGNORE INTO sentinel_alerts
      (id, block_number, tx_hash, kind, severity, from_addr, to_addr,
       value_eth, detail, proposed_action, simulated_result, detected_at)
    VALUES
      (@id, @block_number, @tx_hash, @kind, @severity, @from_addr, @to_addr,
       @value_eth, @detail, @proposed_action, @simulated_result, @detected_at)
  `);
  db.transaction((rows: SentinelAlert[]) => rows.forEach((row) => statement.run(row)))(alerts);

  // Keep each class bounded separately so high-value leads survive a busy
  // general alert stream.
  db.prepare(`
    DELETE FROM sentinel_alerts WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN kind = 'KYC_LEAD' THEN 'lead' ELSE 'other' END
          ORDER BY detected_at DESC
        ) AS rank
        FROM sentinel_alerts
      ) WHERE rank <= 500
    )
  `).run();
}

export function readAlerts(limit = 100): SentinelAlert[] {
  return getSentinelDb()
    .prepare(
      "SELECT * FROM sentinel_alerts ORDER BY " +
        "CASE WHEN kind = 'KYC_LEAD' THEN 1 ELSE 0 END DESC, detected_at DESC, block_number DESC LIMIT ?",
    )
    .all(Math.min(Math.max(limit, 1), 500)) as SentinelAlert[];
}

export function countAlerts(): number {
  const row = getSentinelDb()
    .prepare("SELECT COUNT(*) AS count FROM sentinel_alerts")
    .get() as { count: number };
  return row.count;
}

/* ---------- Wallet tracing ---------- */

export type Chain = "ethereum" | "tron";

export type TrackedWallet = {
  address: string;
  label: string;
  note: string;
  chain: Chain;
  created_at: string;
};

export type KycEndpoint = {
  address: string;
  label: string;
  chain: Chain;
  created_at: string;
};

export type Flow = {
  id: string;
  chain: Chain;
  root_wallet: string;
  root_label: string;
  from_addr: string;
  to_addr: string;
  to_label: string;
  asset: string;
  amount: number;
  hop: number;
  block_number: number;
  tx_hash: string;
  is_kyc_lead: number;
  detected_at: string;
};

export type Hop = {
  address: string;
  chain: Chain;
  root_wallet: string;
  root_label: string;
  hop: number;
  expires_block: number;
};

function normalize(address: string, chain: Chain) {
  return chain === "tron" ? address.trim() : address.trim().toLowerCase();
}

export function getTrackedWallets(chain: Chain = "ethereum"): TrackedWallet[] {
  return getSentinelDb()
    .prepare("SELECT * FROM sentinel_tracked_wallets WHERE chain = ? ORDER BY created_at DESC")
    .all(chain) as TrackedWallet[];
}

export function addTrackedWallet(address: string, label: string, note: string, chain: Chain = "ethereum") {
  getSentinelDb()
    .prepare(
      "INSERT INTO sentinel_tracked_wallets (address, label, note, chain, created_at) " +
        "VALUES (?, ?, ?, ?, ?) ON CONFLICT(address) DO UPDATE SET label = excluded.label, note = excluded.note",
    )
    .run(normalize(address, chain), label, note, chain, new Date().toISOString());
}

export function removeTrackedWallet(address: string, chain: Chain = "ethereum") {
  getSentinelDb()
    .prepare("DELETE FROM sentinel_tracked_wallets WHERE address = ? AND chain = ?")
    .run(normalize(address, chain), chain);
}

export function getKycEndpoints(chain: Chain = "ethereum"): KycEndpoint[] {
  return getSentinelDb()
    .prepare("SELECT * FROM sentinel_kyc_endpoints WHERE chain = ? ORDER BY label ASC")
    .all(chain) as KycEndpoint[];
}

export function addKycEndpoint(address: string, label: string, chain: Chain = "ethereum") {
  getSentinelDb()
    .prepare(
      "INSERT INTO sentinel_kyc_endpoints (address, label, chain, created_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(address) DO UPDATE SET label = excluded.label",
    )
    .run(normalize(address, chain), label, chain, new Date().toISOString());
}

export function removeKycEndpoint(address: string, chain: Chain = "ethereum") {
  getSentinelDb()
    .prepare("DELETE FROM sentinel_kyc_endpoints WHERE address = ? AND chain = ?")
    .run(normalize(address, chain), chain);
}

export function getHops(chain: Chain = "ethereum"): Hop[] {
  return getSentinelDb()
    .prepare("SELECT * FROM sentinel_hops WHERE chain = ?")
    .all(chain) as Hop[];
}

export function upsertHops(hops: Hop[]) {
  if (hops.length === 0) return;
  const db = getSentinelDb();
  const statement = db.prepare(
    "INSERT INTO sentinel_hops (address, chain, root_wallet, root_label, hop, expires_block) " +
      "VALUES (@address, @chain, @root_wallet, @root_label, @hop, @expires_block) " +
      "ON CONFLICT(address) DO UPDATE SET hop = excluded.hop, root_wallet = excluded.root_wallet, " +
      "root_label = excluded.root_label, expires_block = excluded.expires_block",
  );
  db.transaction((rows: Hop[]) => rows.forEach((row) => statement.run(row)))(hops);
}

export function pruneHops(blockNumber: number, chain: Chain = "ethereum") {
  getSentinelDb()
    .prepare("DELETE FROM sentinel_hops WHERE expires_block < ? AND chain = ?")
    .run(blockNumber, chain);
}

export function insertFlows(flows: Flow[]) {
  if (flows.length === 0) return;
  const db = getSentinelDb();
  const statement = db.prepare(`
    INSERT OR IGNORE INTO sentinel_flows
      (id, chain, root_wallet, root_label, from_addr, to_addr, to_label, asset,
       amount, hop, block_number, tx_hash, is_kyc_lead, detected_at)
    VALUES
      (@id, @chain, @root_wallet, @root_label, @from_addr, @to_addr, @to_label, @asset,
       @amount, @hop, @block_number, @tx_hash, @is_kyc_lead, @detected_at)
  `);
  db.transaction((rows: Flow[]) => rows.forEach((row) => statement.run(row)))(flows);

  // Cap per chain so backtraced history isn't evicted by the busier chain.
  db.prepare(`
    DELETE FROM sentinel_flows WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY chain ORDER BY detected_at DESC) AS rank
        FROM sentinel_flows
      ) WHERE rank <= 1000
    )
  `).run();
}

export function readFlows(limit = 100, leadsOnly = false, chain: Chain = "ethereum"): Flow[] {
  const leadFilter = leadsOnly ? "is_kyc_lead = 1 AND " : "";
  return getSentinelDb()
    .prepare(
      `SELECT * FROM sentinel_flows WHERE ${leadFilter}chain = ? ORDER BY detected_at DESC LIMIT ?`,
    )
    .all(chain, Math.min(Math.max(limit, 1), 1000)) as Flow[];
}

// Recheck stored flows against the current endpoint list. Returns flows that
// newly became leads so the caller can emit alerts for them.
export function reclassifyLeads(chain: Chain = "ethereum"): Flow[] {
  const db = getSentinelDb();
  const endpoints = new Map(getKycEndpoints(chain).map((e) => [e.address, e.label]));
  const flows = db
    .prepare("SELECT * FROM sentinel_flows WHERE chain = ? AND is_kyc_lead = 0")
    .all(chain) as Flow[];
  const newlyMatched: Flow[] = [];
  const update = db.prepare(
    "UPDATE sentinel_flows SET is_kyc_lead = 1, to_label = ? WHERE id = ?",
  );
  db.transaction((rows: Flow[]) => {
    for (const flow of rows) {
      const label = endpoints.get(flow.to_addr);
      if (label) {
        update.run(label, flow.id);
        newlyMatched.push({ ...flow, to_label: label, is_kyc_lead: 1 });
      }
    }
  })(flows);
  return newlyMatched;
}

export function countLeads(chain: Chain = "ethereum"): number {
  const row = getSentinelDb()
    .prepare("SELECT COUNT(*) AS count FROM sentinel_flows WHERE is_kyc_lead = 1 AND chain = ?")
    .get(chain) as { count: number };
  return row.count;
}

// Populate from env on first boot so deployments can preconfigure addresses.
export function seedWatchlistFromEnv() {
  const db = getSentinelDb();
  const now = new Date().toISOString();
  const insertWallet = db.prepare(
    "INSERT OR IGNORE INTO sentinel_tracked_wallets (address, label, note, chain, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertEndpoint = db.prepare(
    "INSERT OR IGNORE INTO sentinel_kyc_endpoints (address, label, chain, created_at) VALUES (?, ?, ?, ?)",
  );

  const ethWallets = (process.env.SENTINEL_WATCHED_ADDRESSES || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  db.transaction((addresses: string[]) =>
    addresses.forEach((address) =>
      insertWallet.run(address, "Env watch", "Seeded from SENTINEL_WATCHED_ADDRESSES", "ethereum", now),
    ),
  )(ethWallets);

  const tronWallets = (process.env.SENTINEL_TRON_WATCHED_ADDRESSES || "")
    .split(",").map((s) => s.trim()).filter((s) => s.startsWith("T"));
  db.transaction((addresses: string[]) =>
    addresses.forEach((address) =>
      insertWallet.run(address, "Env Tron watch", "Seeded from SENTINEL_TRON_WATCHED_ADDRESSES", "tron", now),
    ),
  )(tronWallets);

  const parseEndpoints = (raw: string, chain: Chain) =>
    raw.split(",")
      .map((entry) => {
        const [address, ...label] = entry.split(":");
        return { address: address.trim(), label: label.join(":").trim(), chain };
      })
      .filter((entry) => entry.label && (chain === "tron" ? entry.address.startsWith("T") : entry.address.startsWith("0x")));

  const endpoints = [
    ...parseEndpoints(process.env.SENTINEL_KYC_ENDPOINTS || "", "ethereum"),
    ...parseEndpoints(process.env.SENTINEL_TRON_KYC_ENDPOINTS || "", "tron"),
  ];
  db.transaction((rows: typeof endpoints) =>
    rows.forEach((row) => insertEndpoint.run(row.address, row.label, row.chain, now)),
  )(endpoints);
}
