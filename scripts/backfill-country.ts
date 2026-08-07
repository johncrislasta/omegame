import { Pool } from "pg";
import { readFileSync } from "fs";
import geoip from "geoip-lite";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function backfill(table: string) {
  const junk = await pool.query(`UPDATE ${table} SET country = NULL WHERE country IN ('undefined', 'null', '')`);
  const { rows } = await pool.query(
    `SELECT id, ip FROM ${table} WHERE country IS NULL AND ip IS NOT NULL`
  );
  let updated = 0;
  for (const r of rows) {
    const c = r.ip ? geoip.lookup(r.ip)?.country : undefined;
    if (!c) continue;
    await pool.query(`UPDATE ${table} SET country = $2 WHERE id = $1`, [r.id, c]);
    updated++;
  }
  const remaining = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE country IS NULL`);
  console.log(`${table}: junk->NULL ${junk.rowCount ?? 0}, geo-resolved ${updated}/${rows.length} NULL rows, still NULL ${remaining.rows[0].c}`);
}

async function main() {
  await backfill("visits");
  await backfill("chat_sessions");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
