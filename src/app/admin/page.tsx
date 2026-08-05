"use client";

import { useState, useEffect } from "react";
import { formatSupportDate } from "@/lib/relativeTime";
import { countryToFlag } from "@/lib/countryFlag";
import ThemeToggle from "@/components/ThemeToggle";

interface Entry {
  name: string;
  message: string;
  amount: string;
  timestamp: number;
  approved: boolean;
  provider: "paypal" | "gcash";
  currency: "USD" | "PHP";
  referenceNumber?: string;
  receipt?: string;
}

interface Stats {
  live: { total: number; video: number; text: number; countries: Record<string, number> };
  visits: {
    today: number;
    allTime: number;
    peakToday: number;
    peakAllTime: number;
    byPage: { label: string; count: number }[];
    byCountry: { label: string; count: number }[];
    byDevice: { label: string; count: number }[];
    byOs: { label: string; count: number }[];
    byBrowser: { label: string; count: number }[];
    bySource: { label: string; count: number }[];
    byMedium: { label: string; count: number }[];
    byCampaign: { label: string; count: number }[];
  };
  chatSessions: {
    today: number;
    allTime: number;
    peakToday: number;
    peakAllTime: number;
    byMode: { label: string; count: number }[];
    byCountry: { label: string; count: number }[];
    byDevice: { label: string; count: number }[];
    byOs: { label: string; count: number }[];
    byBrowser: { label: string; count: number }[];
    bySource: { label: string; count: number }[];
    byMedium: { label: string; count: number }[];
    byCampaign: { label: string; count: number }[];
  };
  trend: { day: string; visits: number; chats: number }[];
  recent: {
    visits: { sessionId: string | null; label: string; country: string | null; ip: string | null; device: string | null; os: string | null; browser: string | null; source: string | null; medium: string | null; campaign: string | null; startedAt: string; endedAt: string | null; active: boolean }[];
    chats: { sessionId: string | null; label: string; country: string | null; ip: string | null; device: string | null; os: string | null; browser: string | null; source: string | null; medium: string | null; campaign: string | null; startedAt: string; endedAt: string | null; active: boolean }[];
  };
  updatedAt: number;
}

function formatAmount(e: Entry) {
  return `${e.currency === "PHP" ? "₱" : "$"}${parseFloat(e.amount).toFixed(2)}`;
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-lg font-bold text-zinc-900 dark:text-white">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 dark:text-zinc-600">{sub}</div>}
    </div>
  );
}

function CountryBadges({ list, max }: { list: { label: string; count: number }[]; max?: number }) {
  const rows = max ? list.slice(0, max) : list;
  if (rows.length === 0) return <span className="text-zinc-500 dark:text-zinc-600 text-xs">No data</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((r) => (
        <span key={r.label} className="inline-flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
          <span>{countryToFlag(r.label)}</span>
          <span className="font-semibold">{r.label}</span>
          <span className="text-zinc-500">{r.count}</span>
        </span>
      ))}
    </div>
  );
}

function BreakdownBadges({ list }: { list: { label: string; count: number }[] }) {
  if (list.length === 0) return <span className="text-zinc-500 dark:text-zinc-600 text-xs">No data</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((r) => (
        <span key={r.label} className="inline-flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
          <span className="px-1.5 py-0.5 rounded bg-zinc-300/60 dark:bg-zinc-700/60 font-semibold capitalize">{r.label || "unknown"}</span>
          <span className="text-zinc-500">{r.count}</span>
        </span>
      ))}
    </div>
  );
}

function DayBars({ days }: { days: Stats["trend"] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.visits, d.chats)));
  return (
    <div className="space-y-1">
      {days.map((d) => {
        const date = new Date(`${d.day}T00:00:00`);
        const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <div key={d.day} className="flex items-center gap-2 text-xs">
            <span className="w-10 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
            <div className="flex-1 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 rounded bg-mint/60 dark:bg-mint/40" style={{ width: `${Math.max(2, (d.visits / max) * 100)}%` }} />
                <span className="text-zinc-500 dark:text-zinc-400 w-8 shrink-0">{d.visits}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 rounded bg-zinc-300 dark:bg-zinc-700" style={{ width: `${Math.max(2, (d.chats / max) * 100)}%` }} />
                <span className="text-zinc-500 dark:text-zinc-400 w-8 shrink-0">{d.chats}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityList({ items, type }: { items: Stats["recent"]["visits"]; type: "visit" | "chat" }) {
  if (items.length === 0) return <span className="text-zinc-500 dark:text-zinc-600 text-xs">No data</span>;
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.sessionId} className="group flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          <span className="px-1.5 py-0.5 rounded bg-zinc-300/60 dark:bg-zinc-700/60 text-[10px] font-semibold uppercase">
            {it.label || type}
          </span>
          {it.country && <span title={it.country}>{countryToFlag(it.country)}</span>}
          <span className="text-zinc-500">{formatSupportDate(new Date(it.startedAt).getTime())}</span>
          <span className={it.active ? "text-green-600 dark:text-green-400" : "text-zinc-500 dark:text-zinc-600"}>
            {it.active ? "online" : it.endedAt ? formatSupportDate(new Date(it.endedAt).getTime()) : ""}
          </span>
          <span className="ml-auto font-mono text-[10px] text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[220px]"
            title={[it.source, it.medium, it.campaign, it.device, it.os, it.browser, it.ip].filter(Boolean).join(" · ") || undefined}>
            {[it.source, it.medium, it.campaign, it.device, it.os, it.browser, it.ip].filter(Boolean).join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function tryLogin(candidate: string) {
    const t = candidate.trim();
    try {
      const r = await fetch(`/admin/api/stats?token=${encodeURIComponent(t)}`);
      if (r.status === 401) {
        sessionStorage.removeItem("admin_token");
        setAuthed(false);
        setLoginError("Invalid admin token");
        return;
      }
      setToken(t);
      setAuthed(true);
      setLoginError(null);
      sessionStorage.setItem("admin_token", t);
    } catch {
      setLoginError("Could not reach the server");
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_token");
    if (!saved) return;
    fetch(`/admin/api/stats?token=${encodeURIComponent(saved.trim())}`)
      .then((r) => {
        if (r.status === 401) {
          sessionStorage.removeItem("admin_token");
          return;
        }
        setToken(saved.trim());
        setAuthed(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authed) {
      fetch(`/api/thanks?token=${encodeURIComponent(token)}`).then((r) => r.json()).then(setEntries).catch(() => {});
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, token]);

  async function loadStats() {
    setStatsError(null);
    try {
      const r = await fetch(`/admin/api/stats?token=${encodeURIComponent(token)}`);
      const data = await r.json();
      if (r.ok) setStats(data);
      else setStatsError(data?.error || `Request failed (${r.status})`);
    } catch {
      setStatsError("Could not reach the server");
    }
  }

  async function doAction(timestamp: number, action: string) {
    await fetch(`/admin/api?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, timestamp }),
    });
    setEntries((prev) =>
      action === "delete"
        ? prev.filter((e) => e.timestamp !== timestamp)
        : prev.map((e) => (e.timestamp === timestamp ? { ...e, approved: true } : e))
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            tryLogin(token);
          }}
          className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-300 dark:border-zinc-700 w-full max-w-sm"
        >
          <h1 className="text-zinc-900 dark:text-white text-lg font-bold mb-4">Admin Login</h1>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500 mb-3"
          />
          {loginError && <p className="text-red-500 text-xs mb-3">{loginError}</p>}
          <button
            type="submit"
            className="w-full py-2 bg-mint hover:bg-[#8fd696] text-zinc-900 font-semibold rounded-lg text-sm"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  const pending = entries.filter((e) => !e.approved);
  const approved = entries.filter((e) => e.approved);

  return (
    <div className="min-h-screen bg-white dark:bg-black p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-zinc-900 dark:text-white text-lg font-bold">Admin</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => {
                sessionStorage.removeItem("admin_token");
                setAuthed(false);
                setToken("");
              }}
              className="text-zinc-500 text-xs hover:text-zinc-900 dark:hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Analytics</h2>
          <button
            onClick={loadStats}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white text-xs"
          >
            Refresh
          </button>
        </div>

        {statsError && (
          <p className="text-red-500 text-xs mb-3">Could not load analytics: {statsError}</p>
        )}

        {stats && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="Online now" value={stats.live.total} sub={`${stats.live.video} video · ${stats.live.text} text`} />
              <StatCard label="Visits today" value={stats.visits.today} sub={`${stats.visits.allTime} all-time`} />
              <StatCard label="Chats today" value={stats.chatSessions.today} sub={`${stats.chatSessions.allTime} all-time`} />
              <StatCard label="Updated" value={formatSupportDate(stats.updatedAt)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Peak concurrent users today" value={stats.visits.peakToday} />
              <StatCard label="Peak concurrent users all-time" value={stats.visits.peakAllTime} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by page</div>
                <div className="flex flex-wrap gap-2">
                  {stats.visits.byPage.length === 0 ? (
                    <span className="text-zinc-500 dark:text-zinc-600 text-xs">No data</span>
                  ) : (
                    stats.visits.byPage.map((p) => (
                      <span key={p.label} className="inline-flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-300/60 dark:bg-zinc-700/60 font-semibold uppercase">{p.label || "unknown"}</span>
                        <span className="text-zinc-500">{p.count}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by mode</div>
                <div className="flex flex-wrap gap-2">
                  {stats.chatSessions.byMode.length === 0 ? (
                    <span className="text-zinc-500 dark:text-zinc-600 text-xs">No data</span>
                  ) : (
                    stats.chatSessions.byMode.map((m) => (
                      <span key={m.label} className="inline-flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-300/60 dark:bg-zinc-700/60 font-semibold uppercase">{m.label || "unknown"}</span>
                        <span className="text-zinc-500">{m.count}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by country</div>
                <CountryBadges list={stats.visits.byCountry} max={8} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by country</div>
                <CountryBadges list={stats.chatSessions.byCountry} max={8} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by device</div>
                <BreakdownBadges list={stats.visits.byDevice} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by device</div>
                <BreakdownBadges list={stats.chatSessions.byDevice} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by OS</div>
                <BreakdownBadges list={stats.visits.byOs} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by OS</div>
                <BreakdownBadges list={stats.chatSessions.byOs} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by browser</div>
                <BreakdownBadges list={stats.visits.byBrowser} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by browser</div>
                <BreakdownBadges list={stats.chatSessions.byBrowser} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by source</div>
                <BreakdownBadges list={stats.visits.bySource} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by source</div>
                <BreakdownBadges list={stats.chatSessions.bySource} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by medium</div>
                <BreakdownBadges list={stats.visits.byMedium} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by medium</div>
                <BreakdownBadges list={stats.chatSessions.byMedium} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Visits by campaign</div>
                <BreakdownBadges list={stats.visits.byCampaign} />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Chats by campaign</div>
                <BreakdownBadges list={stats.chatSessions.byCampaign} />
              </div>
            </div>

            <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-3">
                <span>Last 7 days</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-mint/60 dark:bg-mint/40" />
                  visits
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-300 dark:bg-zinc-700" />
                  chats
                </span>
              </div>
              <DayBars days={stats.trend} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Recent visits</div>
                <ActivityList items={stats.recent.visits} type="visit" />
              </div>
              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Recent chats</div>
                <ActivityList items={stats.recent.chats} type="chat" />
              </div>
            </div>
          </div>
        )}

        <h2 className="text-zinc-600 dark:text-zinc-400 text-sm font-medium mb-3">Pending supporters ({pending.length})</h2>
        {pending.length === 0 && <p className="text-zinc-500 dark:text-zinc-600 text-sm mb-4">No pending entries</p>}
        <div className="space-y-2 mb-6">
          {pending.map((e) => (
            <div key={e.timestamp} className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-mint-ink dark:text-mint text-sm font-medium">{e.name}</span>
                  {e.provider === "gcash" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-semibold">GCash</span>
                  )}
                  <span className="text-zinc-500 text-xs">{formatAmount(e)}</span>
                  <span className="text-zinc-500 dark:text-zinc-600 text-[10px]">{formatSupportDate(e.timestamp)}</span>
                </div>
                {e.provider === "gcash" && e.referenceNumber && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-zinc-600 dark:text-zinc-400 text-xs font-mono">Ref: {e.referenceNumber}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(e.referenceNumber ?? "")}
                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white text-[10px] underline"
                    >
                      copy
                    </button>
                  </div>
                )}
                {e.message && <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-0.5">{e.message}</p>}
                {e.receipt && (
                  <a href={e.receipt} target="_blank" rel="noreferrer" className="inline-block mt-2">
                    <img src={e.receipt} alt="Receipt" className="h-20 w-20 object-cover rounded border border-zinc-400 dark:border-zinc-600" />
                  </a>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => doAction(e.timestamp, "approve")}
                  className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded"
                >
                  Approve
                </button>
                <button
                  onClick={() => doAction(e.timestamp, "delete")}
                  className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-zinc-600 dark:text-zinc-400 text-sm font-medium mb-3">Approved supporters ({approved.length})</h2>
        <div className="space-y-2">
          {approved.map((e) => (
            <div key={e.timestamp} className="bg-zinc-200/30 dark:bg-zinc-800/30 rounded-lg px-3 py-2 flex items-start justify-between gap-3 opacity-60">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-mint-ink dark:text-mint text-sm font-medium">{e.name}</span>
                  {e.provider === "gcash" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-semibold">GCash</span>
                  )}
                  <span className="text-zinc-500 text-xs">{formatAmount(e)}</span>
                  <span className="text-zinc-500 dark:text-zinc-600 text-[10px]">{formatSupportDate(e.timestamp)}</span>
                </div>
                {e.provider === "gcash" && e.referenceNumber && (
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs font-mono mt-1 block">Ref: {e.referenceNumber}</span>
                )}
                {e.message && <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-0.5">{e.message}</p>}
              </div>
              <button
                onClick={() => doAction(e.timestamp, "delete")}
                className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
