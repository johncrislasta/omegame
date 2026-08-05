import { Pool } from "pg";

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

export interface LiveCount {
  total: number;
  video: number;
  text: number;
  countries: Record<string, number>;
}

export async function ensureTables(): Promise<void> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT,
      page TEXT,
      country TEXT,
      ip TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      disconnected_at TIMESTAMPTZ
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT,
      mode TEXT,
      country TEXT,
      ip TEXT,
      chat_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      chat_ended_at TIMESTAMPTZ
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS live_snapshots (
      id BIGSERIAL PRIMARY KEY,
      total INT NOT NULL,
      video INT NOT NULL,
      text INT NOT NULL,
      countries JSONB NOT NULL DEFAULT '{}',
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await p.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS session_id TEXT`);
  await p.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS page TEXT`);
  await p.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS country TEXT`);
  await p.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS ip TEXT`);
  await p.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ`);
  await p.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS session_id TEXT`);
  await p.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS mode TEXT`);
  await p.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS country TEXT`);
  await p.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS ip TEXT`);
  await p.query(`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS chat_ended_at TIMESTAMPTZ`);
}

export async function cleanupOrphaned(): Promise<void> {
  try {
    const p = getPool();
    await p.query(`UPDATE visits SET disconnected_at = now() WHERE disconnected_at IS NULL`);
    await p.query(`UPDATE chat_sessions SET chat_ended_at = now() WHERE chat_ended_at IS NULL`);
  } catch (err) {
    console.error("analytics.cleanupOrphaned error:", err);
  }
}

export async function createVisit(sessionId: string, page: string, country?: string, ip?: string): Promise<string | null> {
  try {
    const { rows } = await getPool().query(
      `INSERT INTO visits (session_id, page, country, ip) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sessionId, page, country || null, ip || null]
    );
    return rows[0].id as string;
  } catch (err) {
    console.error("analytics.createVisit error:", err);
    return null;
  }
}

export async function closeVisit(id: string): Promise<void> {
  try {
    await getPool().query(`UPDATE visits SET disconnected_at = now() WHERE id = $1 AND disconnected_at IS NULL`, [id]);
  } catch (err) {
    console.error("analytics.closeVisit error:", err);
  }
}

export async function updateVisitCountry(id: string, country: string): Promise<void> {
  try {
    await getPool().query(`UPDATE visits SET country = $2 WHERE id = $1`, [id, country]);
  } catch (err) {
    console.error("analytics.updateVisitCountry error:", err);
  }
}

export async function createChatSession(sessionId: string, mode: string, country?: string, ip?: string): Promise<string | null> {
  try {
    const { rows } = await getPool().query(
      `INSERT INTO chat_sessions (session_id, mode, country, ip) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sessionId, mode, country || null, ip || null]
    );
    return rows[0].id as string;
  } catch (err) {
    console.error("analytics.createChatSession error:", err);
    return null;
  }
}

export async function closeChatSession(id: string): Promise<void> {
  try {
    await getPool().query(
      `UPDATE chat_sessions SET chat_ended_at = now() WHERE id = $1 AND chat_ended_at IS NULL`,
      [id]
    );
  } catch (err) {
    console.error("analytics.closeChatSession error:", err);
  }
}

export async function updateChatSession(id: string, mode: string, country?: string): Promise<void> {
  try {
    await getPool().query(`UPDATE chat_sessions SET mode = $2, country = $3 WHERE id = $1`, [id, mode, country || null]);
  } catch (err) {
    console.error("analytics.updateChatSession error:", err);
  }
}

let liveCount: LiveCount = { total: 0, video: 0, text: 0, countries: {} };

export function setLiveCount(count: LiveCount): void {
  liveCount = count;
}

export function getLiveCount(): LiveCount {
  return liveCount;
}

let lastSnapshotAt = 0;

export function maybeSaveLiveSnapshot(count: LiveCount): void {
  const now = Date.now();
  if (now - lastSnapshotAt < 5000) return;
  lastSnapshotAt = now;
  getPool()
    .query(
      `INSERT INTO live_snapshots (total, video, text, countries) VALUES ($1, $2, $3, $4::jsonb)`,
      [count.total, count.video, count.text, JSON.stringify(count.countries)]
    )
    .catch((err) => console.error("analytics.saveLiveSnapshot error:", err));
}

export async function getLatestLiveSnapshot(): Promise<{ total: number; video: number; text: number; countries: Record<string, number>; capturedAt: string } | null> {
  const { rows } = await getPool().query(
    `SELECT total, video, text, countries, captured_at FROM live_snapshots ORDER BY id DESC LIMIT 1`
  );
  if (!rows.length) return null;
  return {
    total: Number(rows[0].total),
    video: Number(rows[0].video),
    text: Number(rows[0].text),
    countries: rows[0].countries || {},
    capturedAt: rows[0].captured_at,
  };
}

async function scalar(query: string, params: unknown[] = []): Promise<number> {
  const { rows } = await getPool().query(query, params);
  return Number(rows[0].count ?? 0);
}

const PEAK_TABLES = {
  visits: { table: "visits", startCol: "connected_at", endCol: "disconnected_at" },
  chat: { table: "chat_sessions", startCol: "chat_started_at", endCol: "chat_ended_at" },
} as const;

type PeakTable = keyof typeof PEAK_TABLES;

async function peakConcurrent(table: PeakTable, start: Date, end: Date): Promise<number> {
  const cfg = PEAK_TABLES[table];
  const { rows } = await getPool().query(
    `WITH bounds AS (SELECT $1::timestamptz AS s, $2::timestamptz AS e),
     rows AS (
       SELECT ${cfg.startCol} AS st, COALESCE(${cfg.endCol}, now()) AS en
       FROM ${cfg.table}, bounds
       WHERE ${cfg.startCol} < e AND (${cfg.endCol} IS NULL OR ${cfg.endCol} > s)
     ),
     evts AS (
       SELECT GREATEST(st, (SELECT s FROM bounds)) AS t, 1 AS delta FROM rows
       UNION ALL
       SELECT LEAST(en, (SELECT e FROM bounds)) AS t, -1 AS delta FROM rows
     )
     SELECT COALESCE(MAX(running), 0)::int AS peak FROM (
       SELECT SUM(delta) OVER (ORDER BY t) AS running FROM evts
     ) x`,
    [start, end]
  );
  return Number(rows[0].peak ?? 0);
}

function rowsToCounts(rows: { [key: string]: unknown }[], key: string): { label: string; count: number }[] {
  return rows.map((r) => ({ label: String(r[key]), count: Number(r.count) }));
}

export interface VisitStats {
  today: number;
  allTime: number;
  peakToday: number;
  peakAllTime: number;
  byPage: { label: string; count: number }[];
  byCountry: { label: string; count: number }[];
}

export async function getVisitStats(): Promise<VisitStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const now = new Date();
  const epoch = new Date(0);
  const [today, allTime, peakToday, peakAllTime] = await Promise.all([
    scalar(`SELECT COUNT(*) AS count FROM visits WHERE connected_at >= $1`, [startOfToday]),
    scalar(`SELECT COUNT(*) AS count FROM visits`),
    peakConcurrent("visits", startOfToday, now),
    peakConcurrent("visits", epoch, now),
  ]);
  const { rows: byPage } = await getPool().query(
    `SELECT page, COUNT(*) AS count FROM visits GROUP BY page ORDER BY count DESC`
  );
  const { rows: byCountry } = await getPool().query(
    `SELECT country, COUNT(*) AS count FROM visits WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC`
  );
  return { today, allTime, peakToday, peakAllTime, byPage: rowsToCounts(byPage, "page"), byCountry: rowsToCounts(byCountry, "country") };
}

export interface ChatStats {
  today: number;
  allTime: number;
  peakToday: number;
  peakAllTime: number;
  byMode: { label: string; count: number }[];
  byCountry: { label: string; count: number }[];
}

export async function getChatStats(): Promise<ChatStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const now = new Date();
  const epoch = new Date(0);
  const [today, allTime, peakToday, peakAllTime] = await Promise.all([
    scalar(`SELECT COUNT(*) AS count FROM chat_sessions WHERE chat_started_at >= $1`, [startOfToday]),
    scalar(`SELECT COUNT(*) AS count FROM chat_sessions`),
    peakConcurrent("chat", startOfToday, now),
    peakConcurrent("chat", epoch, now),
  ]);
  const { rows: byMode } = await getPool().query(
    `SELECT mode, COUNT(*) AS count FROM chat_sessions WHERE mode IS NOT NULL GROUP BY mode ORDER BY count DESC`
  );
  const { rows: byCountry } = await getPool().query(
    `SELECT country, COUNT(*) AS count FROM chat_sessions WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC`
  );
  return { today, allTime, peakToday, peakAllTime, byMode: rowsToCounts(byMode, "mode"), byCountry: rowsToCounts(byCountry, "country") };
}

export async function getTrend(days: number): Promise<{ day: string; visits: number; chats: number }[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const { rows } = await getPool().query(
    `SELECT d.day,
       COUNT(DISTINCT v.id) AS visits,
       COUNT(DISTINCT c.id) AS chats
     FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
     LEFT JOIN visits v ON date_trunc('day', v.connected_at) = d.day
     LEFT JOIN chat_sessions c ON date_trunc('day', c.chat_started_at) = d.day
     GROUP BY d.day
     ORDER BY d.day ASC`,
    [start, end]
  );
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    visits: Number(r.visits ?? 0),
    chats: Number(r.chats ?? 0),
  }));
}

export interface RecentEvent {
  sessionId: string | null;
  label: string;
  page?: string | null;
  mode?: string | null;
  country?: string | null;
  ip?: string | null;
  startedAt: string;
  endedAt?: string | null;
  active: boolean;
}

export async function getRecent(limit = 10): Promise<{ visits: RecentEvent[]; chats: RecentEvent[] }> {
  const { rows: visits } = await getPool().query(
    `SELECT session_id, page, country, ip, connected_at, disconnected_at FROM visits ORDER BY connected_at DESC LIMIT $1`,
    [limit]
  );
  const { rows: chats } = await getPool().query(
    `SELECT session_id, mode, country, ip, chat_started_at, chat_ended_at FROM chat_sessions ORDER BY chat_started_at DESC LIMIT $1`,
    [limit]
  );
  return {
    visits: visits.map((r) => ({
      sessionId: r.session_id,
      label: r.page || "unknown",
      page: r.page,
      country: r.country,
      ip: r.ip,
      startedAt: r.connected_at,
      endedAt: r.disconnected_at,
      active: !r.disconnected_at,
    })),
    chats: chats.map((r) => ({
      sessionId: r.session_id,
      label: r.mode || "unknown",
      mode: r.mode,
      country: r.country,
      ip: r.ip,
      startedAt: r.chat_started_at,
      endedAt: r.chat_ended_at,
      active: !r.chat_ended_at,
    })),
  };
}
