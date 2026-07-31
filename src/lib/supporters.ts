import { Pool } from "pg";

export const UNNAMED_NAME = "Unnamed Supporter";

export interface SupporterEntry {
  id: string;
  name: string;
  message: string;
  amount: string;
  timestamp: number;
  approved: boolean;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function toEntry(row: any): SupporterEntry {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    amount: row.amount,
    timestamp: Number(row.timestamp),
    approved: Boolean(row.approved),
  };
}

export async function ensureTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS supporters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL,
      timestamp BIGINT NOT NULL,
      approved BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
}

export async function listEntries(approvedOnly: boolean): Promise<SupporterEntry[]> {
  const { rows } = await getPool().query(
    approvedOnly
      ? `SELECT * FROM supporters WHERE approved = TRUE ORDER BY timestamp DESC`
      : `SELECT * FROM supporters ORDER BY timestamp DESC`
  );
  return rows.map(toEntry);
}

export async function insertEntry(entry: SupporterEntry): Promise<SupporterEntry> {
  await getPool().query(
    `INSERT INTO supporters (id, name, message, amount, timestamp, approved)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.id, entry.name, entry.message, entry.amount, entry.timestamp, entry.approved]
  );
  return entry;
}

export async function updateEntry(id: string, name: string, message: string): Promise<SupporterEntry | null> {
  const { rows } = await getPool().query(
    `UPDATE supporters SET name = $2, message = $3 WHERE id = $1 RETURNING *`,
    [id, name, message]
  );
  return rows.length ? toEntry(rows[0]) : null;
}

export async function findEntryByTimestamp(timestamp: number): Promise<SupporterEntry | null> {
  const { rows } = await getPool().query(`SELECT * FROM supporters WHERE timestamp = $1 LIMIT 1`, [timestamp]);
  return rows.length ? toEntry(rows[0]) : null;
}

export async function setApproved(timestamp: number, approved: boolean): Promise<void> {
  await getPool().query(`UPDATE supporters SET approved = $2 WHERE timestamp = $1`, [timestamp, approved]);
}

export async function deleteEntry(timestamp: number): Promise<void> {
  await getPool().query(`DELETE FROM supporters WHERE timestamp = $1`, [timestamp]);
}

export async function countEntries(): Promise<number> {
  const { rows } = await getPool().query(`SELECT COUNT(*) AS count FROM supporters`);
  return Number(rows[0].count);
}
