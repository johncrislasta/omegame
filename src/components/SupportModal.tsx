"use client";

import { useState, useEffect, useRef } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { formatSupportDate } from "@/lib/relativeTime";

interface Supporter {
  id: string;
  name: string;
  message: string;
  amount: string;
  timestamp: number;
  approved: boolean;
}

const PAYPAL_CLIENT_ID =
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "Adfg_LlFfi6dVI0ny7tLiyyCfgYMIILqxz3lP6evbK1uO71fdz_P8beOPsa_vUWjO4N2dd4_4OVEtt4s";
const AMOUNTS = ["3.00", "5.00", "10.00", "25.00"];

function PayPalButton({ amount, onSuccess }: { amount: string; onSuccess: () => void }) {
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  return (
    <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: "USD" }}>
      <PayPalButtons
        forceReRender={[amount]}
        style={{ layout: "vertical", tagline: false }}
        createOrder={(_data, actions) =>
          actions.order.create({
            intent: "CAPTURE",
            purchase_units: [{ amount: { currency_code: "USD", value: amount }, description: "Support OmeGame" }],
          })
        }
        onApprove={(_data, actions) => actions.order!.capture().then(() => onSuccessRef.current())}
        onError={(err) => console.error("PayPal error:", err)}
      />
    </PayPalScriptProvider>
  );
}

export default function SupportModal({ onClose }: { onClose: () => void }) {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [amount, setAmount] = useState("5.00");
  const [paid, setPaid] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    fetch("/api/thanks").then((r) => r.json()).then(setSupporters).catch(() => {});
  }, []);

  async function recordPayment(payAmount: string) {
    if (recordedRef.current) return;
    try {
      const res = await fetch("/api/thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: payAmount }),
      });
      const data = await res.json();
      if (data.entry) {
        recordedRef.current = true;
        setRecordId(data.entry.id);
        setSupporters((prev) => [data.entry, ...prev]);
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSending(true);
    try {
      if (recordId) {
        const res = await fetch("/api/thanks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: recordId, name: name.trim(), message: message.trim() }),
        });
        const data = await res.json();
        if (data.entry) {
          setSupporters((prev) => prev.map((s) => (s.id === recordId ? data.entry : s)));
        }
      } else {
        const res = await fetch("/api/thanks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), message: message.trim(), amount }),
        });
        const data = await res.json();
        if (data.entry) {
          setSupporters((prev) => [data.entry, ...prev]);
        }
      }
      setSubmitted(true);
    } catch {}
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-300 dark:border-zinc-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-zinc-900 dark:text-white text-lg font-bold">Support OmeGame</h2>
          <button onClick={onClose} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg">✕</button>
        </div>

        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
          If you enjoy using OmeGame, consider supporting development. Any amount helps keep the server running and new features coming!
        </p>

        {!paid ? (
          <>
            <div className="flex flex-col gap-3 mb-4">
              <p className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">Choose amount</p>
              <div className="flex gap-2">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${ amount === a ? "bg-mint text-zinc-900" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700" }`}
                  >
                    ${parseFloat(a).toFixed(0)}
                  </button>
                ))}
              </div>
            </div>

            <PayPalButton
              amount={amount}
              onSuccess={() => {
                recordPayment(amount);
                setPaid(true);
              }}
            />
          </>
        ) : submitted ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🙏</div>
            <p className="text-green-400 text-sm font-medium">Thank you for your support!</p>
            <p className="text-zinc-500 text-xs mt-1">Your name has been added to the wall below.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-zinc-600 dark:text-zinc-400 text-sm">Payment confirmed! Leave your name so I can thank you:</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message (optional)"
              rows={2}
              className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500 resize-none"
            />
            <button
              type="submit"
              disabled={sending || !name.trim()}
              className="w-full py-2 bg-mint hover:bg-[#8fd696] text-zinc-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {sending ? "Sending..." : "Add to wall"}
            </button>
          </form>
        )}

        {supporters.length > 0 && (
          <div className={`${paid || submitted ? "pt-4 mt-4 border-t border-zinc-300 dark:border-zinc-700" : "mt-6"}`}>
            <p className="text-zinc-500 text-xs mb-3">Thank you to our supporters</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {supporters.slice(0, 50).map((s) => (
                <div key={s.id} className="bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-mint-ink dark:text-mint text-sm font-medium">{s.name}</span>
                    <span className="text-zinc-500 text-xs">${parseFloat(s.amount).toFixed(2)}</span>
                    <span className="text-zinc-500 dark:text-zinc-600 text-[10px]">{formatSupportDate(s.timestamp)}</span>
                  </div>
                  {s.message && <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-0.5">{s.message}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
