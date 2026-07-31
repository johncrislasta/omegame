import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { countEntries, ensureTable, insertEntry } from "../src/lib/supporters";

async function main() {
  await ensureTable();

  const count = await countEntries();
  if (count > 0) {
    console.log(`Table already has ${count} entries — skipping import.`);
    return;
  }

  const dataPath = resolve(process.cwd(), "src/data/supporters.json");
  if (!existsSync(dataPath)) {
    console.log("No supporters.json to import.");
    return;
  }

  const entries = JSON.parse(readFileSync(dataPath, "utf-8"));
  for (const e of entries) {
    await insertEntry({
      id: e.id ?? randomUUID(),
      name: e.name,
      message: e.message ?? "",
      amount: String(e.amount ?? "0"),
      timestamp: e.timestamp,
      approved: e.approved ?? false,
      provider: "paypal",
      currency: "USD",
    });
  }
  console.log(`Imported ${entries.length} entries.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
