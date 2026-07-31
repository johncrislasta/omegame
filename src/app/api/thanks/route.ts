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
    return NextResponse.json(entries);
  } catch (err) {
    console.error("Supporters GET error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, message, amount } = await req.json();
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
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
