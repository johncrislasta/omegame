import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  ensureTable,
  insertEntry,
  listEntries,
  updateEntry,
  UNNAMED_NAME,
  SupporterEntry,
} from "@/lib/supporters";

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const token = req.nextUrl.searchParams.get("token");
    const isAdmin = token === process.env.ADMIN_TOKEN;
    const entries = await listEntries(!isAdmin);
    if (isAdmin) {
      return NextResponse.json(entries);
    }
    return NextResponse.json(
      entries.map(({ receipt, referenceNumber, ...rest }) => rest)
    );
  } catch (err) {
    console.error("Supporters GET error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, message, amount, provider, referenceNumber, receipt } = await req.json();
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const method: "paypal" | "gcash" = provider === "gcash" ? "gcash" : "paypal";
    const currency: "USD" | "PHP" = method === "gcash" ? "PHP" : "USD";

    let ref: string | undefined;
    if (method === "gcash") {
      const r = typeof referenceNumber === "string" ? referenceNumber.trim() : "";
      if (!/^\d{6,30}$/.test(r)) {
        return NextResponse.json({ error: "Reference number is required (6-30 digits)" }, { status: 400 });
      }
      ref = r;
    }

    let receiptData: string | undefined;
    if (typeof receipt === "string" && receipt.length > 0) {
      if (!receipt.startsWith("data:image/") || receipt.length > 2_000_000) {
        return NextResponse.json({ error: "Invalid receipt image" }, { status: 400 });
      }
      receiptData = receipt;
    }

    const entry: SupporterEntry = {
      id: randomUUID(),
      name:
        typeof name === "string" && name.trim().length > 0
          ? name.trim().slice(0, 100)
          : UNNAMED_NAME,
      message: (message || "").trim().slice(0, 500),
      amount: String(value),
      timestamp: Date.now(),
      approved: false,
      provider: method,
      currency,
      referenceNumber: ref,
      receipt: receiptData,
    };
    await ensureTable();
    await insertEntry(entry);
    return NextResponse.json({ success: true, entry });
  } catch (err) {
    console.error("Supporters POST error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, name, message } = await req.json();
    if (!id || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    await ensureTable();
    const entry = await updateEntry(id, name.trim().slice(0, 100), (message || "").trim().slice(0, 500));
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, entry });
  } catch (err) {
    console.error("Supporters PATCH error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
