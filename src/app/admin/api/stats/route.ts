import { NextRequest, NextResponse } from "next/server";
import {
  ensureTables,
  getLiveCount,
  getLatestLiveSnapshot,
  getVisitStats,
  getChatStats,
  getTrend,
  getRecent,
} from "@/lib/analytics";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureTables();
    const [liveInProcess, snapshot, visits, chatSessions, trend, recent] = await Promise.all([
      Promise.resolve(getLiveCount()),
      getLatestLiveSnapshot(),
      getVisitStats(),
      getChatStats(),
      getTrend(7),
      getRecent(10),
    ]);

    const total = liveInProcess.total || snapshot?.total || 0;
    const video = liveInProcess.video || snapshot?.video || 0;
    const text = liveInProcess.text || snapshot?.text || 0;
    const countries =
      Object.keys(liveInProcess.countries).length > 0 ? liveInProcess.countries : snapshot?.countries || {};

    return NextResponse.json({
      live: { total, video, text, countries },
      visits,
      chatSessions,
      trend,
      recent,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("Stats error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
