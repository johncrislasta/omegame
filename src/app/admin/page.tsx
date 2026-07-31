"use client";

import { useState, useEffect } from "react";

interface Entry {
  name: string;
  message: string;
  amount: string;
  timestamp: number;
  approved: boolean;
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
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAuthed(true);
            sessionStorage.setItem("admin_token", token);
          }}
          className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700 w-full max-w-sm"
        >
          <h1 className="text-white text-lg font-bold mb-4">Admin Login</h1>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500 mb-3"
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
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-white text-lg font-bold">Supporters Admin</h1>
          <button
            onClick={() => {
              sessionStorage.removeItem("admin_token");
              setAuthed(false);
              setToken("");
            }}
            className="text-zinc-500 text-xs hover:text-white"
          >
            Logout
          </button>
        </div>

        <h2 className="text-zinc-400 text-sm font-medium mb-3">Pending ({pending.length})</h2>
        {pending.length === 0 && <p className="text-zinc-600 text-sm mb-4">No pending entries</p>}
        <div className="space-y-2 mb-6">
          {pending.map((e) => (
            <div key={e.timestamp} className="bg-zinc-800/50 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-mint text-sm font-medium">{e.name}</span>
                  <span className="text-zinc-500 text-xs">${parseFloat(e.amount).toFixed(2)}</span>
                  <span className="text-zinc-600 text-[10px]">{new Date(e.timestamp).toLocaleDateString()}</span>
                </div>
                {e.message && <p className="text-zinc-400 text-xs mt-0.5">{e.message}</p>}
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

        <h2 className="text-zinc-400 text-sm font-medium mb-3">Approved ({approved.length})</h2>
        <div className="space-y-2">
          {approved.map((e) => (
            <div key={e.timestamp} className="bg-zinc-800/30 rounded-lg px-3 py-2 flex items-start justify-between gap-3 opacity-60">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-mint text-sm font-medium">{e.name}</span>
                  <span className="text-zinc-500 text-xs">${parseFloat(e.amount).toFixed(2)}</span>
                  <span className="text-zinc-600 text-[10px]">{new Date(e.timestamp).toLocaleDateString()}</span>
                </div>
                {e.message && <p className="text-zinc-400 text-xs mt-0.5">{e.message}</p>}
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
