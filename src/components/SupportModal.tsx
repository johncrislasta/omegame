"use client";

import { useState, useEffect, useRef } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { formatSupportDate } from "@/lib/relativeTime";
import { useCountry } from "@/hooks/useCountry";

interface Supporter {
  id: string;
  name: string;
  message: string;
  amount: string;
  timestamp: number;
  approved: boolean;
  provider: "paypal" | "gcash";
  currency: "USD" | "PHP";
}

const PAYPAL_CLIENT_ID =
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "Adfg_LlFfi6dVI0ny7tLiyyCfgYMIILqxz3lP6evbK1uO71fdz_P8beOPsa_vUWjO4N2dd4_4OVEtt4s";
const AMOUNTS = ["3.00", "5.00", "10.00", "25.00"];
const GCASH_AMOUNTS = ["50", "100", "250", "500"];
const GCASH_QR: Record<string, string> = {
  "50": "/qrs/gcash-50.jpg",
  "100": "/qrs/gcash-100.jpg",
  "250": "/qrs/gcash-250.jpg",
  "500": "/qrs/gcash-500.jpg",
};
const REF_REGEX = /^\d{6,30}$/;

function formatAmount(s: Supporter) {
  return `${s.currency === "PHP" ? "₱" : "$"}${parseFloat(s.amount).toFixed(2)}`;
}

async function compressImage(file: File, maxDim = 1024, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

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
  const [provider, setProvider] = useState<"paypal" | "gcash">("paypal");
  const [amount, setAmount] = useState("5.00");
  const [gcAmount, setGcAmount] = useState("100");
  const [paid, setPaid] = useState(false);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const recordedRef = useRef(false);

  const country = useCountry();
  const showGcash = country === null || country === "PH";
  const activeProvider = showGcash ? provider : "paypal";

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

  async function handleReceiptFile(file: File | null) {
    if (!file) {
      setReceipt(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    try {
      setReceipt(await compressImage(file));
      setError("");
    } catch {
      setError("Could not read that image. Try another one.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (activeProvider === "gcash") {
      if (!REF_REGEX.test(ref.trim())) {
        setError("Please enter the reference number shown on your GCash receipt (6-30 digits).");
        return;
      }
      setError("");
    }
    setSending(true);
    try {
      if (activeProvider === "paypal" && recordId) {
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
          body: JSON.stringify({
            name: name.trim(),
            message: message.trim(),
            amount: activeProvider === "gcash" ? gcAmount : amount,
            provider: activeProvider,
            referenceNumber: activeProvider === "gcash" ? ref.trim() : undefined,
            receipt: activeProvider === "gcash" ? receipt ?? undefined : undefined,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
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
      <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-700 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-bold">Support OmeGame</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg">✕</button>
        </div>

        <p className="text-zinc-400 text-sm mb-4">
          If you enjoy using OmeGame, consider supporting development. Any amount helps keep the server running and new features coming!
        </p>

        {!paid ? (
          <>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setProvider("paypal")}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeProvider === "paypal" ? "bg-mint text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                PayPal
              </button>
              {showGcash && (
                <button
                  onClick={() => setProvider("gcash")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeProvider === "gcash" ? "bg-mint text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  GCash
                </button>
              )}
            </div>

            {activeProvider === "gcash" ? (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  <p className="text-zinc-400 text-xs font-medium">Choose amount</p>
                  <div className="flex gap-2">
                    {GCASH_AMOUNTS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setGcAmount(a)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          gcAmount === a
                            ? "bg-mint text-zinc-900"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        ₱{a}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-800/60 rounded-xl p-4 mb-4 flex flex-col items-center">
                  <img
                    src={GCASH_QR[gcAmount]}
                    alt={`GCash QR for ₱${gcAmount}`}
                    className="w-48 h-48 rounded-lg bg-white p-2 mb-3"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <p className="text-zinc-300 text-sm text-center">
                    Scan with the GCash app and send <span className="text-mint font-semibold">₱{gcAmount}</span>
                  </p>
                  <p className="text-zinc-500 text-xs text-center mt-1 mb-3">
                    Save your receipt reference number — you'll enter it next.
                  </p>
                  <button
                    onClick={() => setPaid(true)}
                    className="w-full py-2 bg-mint hover:bg-[#8fd696] text-zinc-900 font-semibold rounded-lg text-sm transition-colors"
                  >
                    I've paid
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  <p className="text-zinc-400 text-xs font-medium">Choose amount</p>
                  <div className="flex gap-2">
                    {AMOUNTS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAmount(a)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          amount === a
                            ? "bg-mint text-zinc-900"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
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
            )}
          </>
        ) : submitted ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🙏</div>
            <p className="text-green-400 text-sm font-medium">Thank you for your support!</p>
            <p className="text-zinc-500 text-xs mt-1">Your name has been added to the wall below.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-zinc-400 text-sm">
              {activeProvider === "gcash"
                ? `Thanks for paying ₱${gcAmount}! Leave your name so I can thank you:`
                : "Payment confirmed! Leave your name so I can thank you:"}
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500"
            />
            {activeProvider === "gcash" && (
              <input
                type="text"
                inputMode="numeric"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="GCash reference number"
                required
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500"
              />
            )}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message (optional)"
              rows={2}
              className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint placeholder-zinc-500 resize-none"
            />
            {activeProvider === "gcash" && (
              <label className="block">
                <span className="text-zinc-400 text-xs">Receipt screenshot (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleReceiptFile(e.target.files?.[0] ?? null)}
                  className="w-full mt-1 text-zinc-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs file:font-medium"
                />
                {receipt && (
                  <span className="inline-flex items-center gap-1 mt-1 text-green-400 text-xs">
                    ✓ Receipt attached
                    <button
                      type="button"
                      onClick={() => setReceipt(null)}
                      className="text-zinc-500 hover:text-white underline"
                    >
                      remove
                    </button>
                  </span>
                )}
              </label>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
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
          <div className={`${paid || submitted ? "pt-4 mt-4 border-t border-zinc-700" : "mt-6"}`}>
            <p className="text-zinc-500 text-xs mb-3">Thank you to our supporters</p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {supporters.slice(0, 50).map((s) => (
                <div key={s.id} className="bg-zinc-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-mint text-sm font-medium">{s.name}</span>
                    <span className="text-zinc-500 text-xs">{formatAmount(s)}</span>
                    <span className="text-zinc-600 text-[10px]">{formatSupportDate(s.timestamp)}</span>
                  </div>
                  {s.message && <p className="text-zinc-400 text-xs mt-0.5">{s.message}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
