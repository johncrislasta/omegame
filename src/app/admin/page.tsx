"use client";

import { useState, useEffect } from "react";
import { formatSupportDate } from "@/lib/relativeTime";
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

function formatAmount(e: Entry) {
  return `${e.currency === "PHP" ? "₱" : "$"}${parseFloat(e.amount).toFixed(2)}`;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_token");
    if (saved) {
      setToken(saved);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetch(`/api/thanks?token=${token}`).then((r) => r.json()).then(setEntries).catch(() => {});
    }
  }, [authed, token]);

  async function doAction(timestamp: number, action: string) {
    await fetch(`/admin/api?token=${token}`, {
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
            setAuthed(true);
            sessionStorage.setItem("admin_token", token);
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
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-zinc-900 dark:text-white text-lg font-bold">Supporters Admin</h1>
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

        <h2 className="text-zinc-600 dark:text-zinc-400 text-sm font-medium mb-3">Pending ({pending.length})</h2>
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

        <h2 className="text-zinc-600 dark:text-zinc-400 text-sm font-medium mb-3">Approved ({approved.length})</h2>
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
