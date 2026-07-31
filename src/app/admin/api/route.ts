import { NextRequest, NextResponse } from "next/server";
import {
  ensureTable,
  deleteEntry,
  findEntryByTimestamp,
  setApproved,
} from "@/lib/supporters";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.ADMIN_TOKEN) return unauthorized();

  const { action, timestamp } = await req.json();

  if (!timestamp || !action) {
    return NextResponse.json({ error: "Missing action or timestamp" }, { status: 400 });
  }

  try {
    await ensureTable();
    const existing = await findEntryByTimestamp(timestamp);
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (action === "approve") {
      await setApproved(timestamp, true);
    } else if (action === "delete") {
      await deleteEntry(timestamp);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin action error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
