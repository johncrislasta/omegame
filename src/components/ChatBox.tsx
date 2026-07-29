"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "@/lib/types";

interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onFeedback?: (type: string, category: string, isPositive: boolean) => void;
  incomingFeedback?: { type: string; isPositive: boolean } | null;
}

const POSITIVE_FEEDBACK = [
  { emoji: "🤩", label: "Interesting" },
  { emoji: "🤣", label: "Funny" },
  { emoji: "😍", label: "Good looking" },
  { emoji: "🤤", label: "Sexy" },
  { emoji: "👍", label: "Good" },
];

const NEGATIVE_FEEDBACK = [
  { emoji: "🍆", label: "Inappropriate" },
  { emoji: "😡", label: "Rude" },
  { emoji: "🙉", label: "Close minded" },
  { emoji: "😴", label: "Distracted" },
  { emoji: "👎", label: "Bad" },
];

interface FlyingEmoji {
  id: number;
  emoji: string;
  isPositive: boolean;
}

let flyingId = 0;

export default function ChatBox({ messages, onSendMessage, onFeedback, incomingFeedback }: ChatBoxProps) {
  const [input, setInput] = useState("");
  const [activeFlyout, setActiveFlyout] = useState<"positive" | "negative" | null>(null);
  const [flyingEmojis, setFlyingEmojis] = useState<FlyingEmoji[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeFlyout) return;
    const handler = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node) &&
          thumbsRef.current && !thumbsRef.current.contains(e.target as Node)) {
        setActiveFlyout(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeFlyout]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  const handleFeedback = useCallback((emoji: string, category: string, isPositive: boolean) => {
    onFeedback?.(emoji, category, isPositive);
    const id = ++flyingId;
    setFlyingEmojis((prev) => [...prev, { id, emoji, isPositive }]);
    setTimeout(() => {
      setFlyingEmojis((prev) => prev.filter((f) => f.id !== id));
    }, 1000);
  }, [onFeedback]);

  useEffect(() => {
    if (!incomingFeedback) return;
    const id = ++flyingId;
    setFlyingEmojis((prev) => [...prev, { id, emoji: incomingFeedback.type, isPositive: incomingFeedback.isPositive }]);
    setTimeout(() => {
      setFlyingEmojis((prev) => prev.filter((f) => f.id !== id));
    }, 1000);
  }, [incomingFeedback]);

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="text-zinc-500 text-sm text-center mt-8">No messages yet. Say hi!</div>
        )}
        {messages.map((msg) => (
          msg.kind === "feedback" ? (
            <div key={msg.id} className="flex justify-center">
              <div className="bg-zinc-800/80 border border-zinc-700 px-3 py-1 rounded-full text-sm flex items-center gap-1.5">
                <span>{msg.text}</span>
              </div>
            </div>
          ) : (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm ${
                msg.sender === "me"
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-zinc-700 text-zinc-100 rounded-bl-md"
              }`}
            >
              {msg.text}
            </div>
          </div>
          )
        ))}
        <div ref={messagesEndRef} />
      </div>

      {flyingEmojis.map((f) => (
        <span
          key={f.id}
          className={`fixed text-2xl z-50 animate-feedback-fly ${f.isPositive ? "text-green-400" : "text-red-400"}`}
          style={{
            bottom: "80px",
            [f.isPositive ? "right" : "right"]: f.isPositive ? "100px" : "60px",
          }}
        >
          {f.emoji}
        </span>
      ))}

      <div className="p-2 border-t border-zinc-700 flex gap-2 items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 bg-zinc-800 text-white rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-zinc-500"
        />
        <div className="relative flex shrink-0 gap-1" ref={thumbsRef}>
          <button
            onClick={() => setActiveFlyout(activeFlyout === "positive" ? null : "positive")}
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-lg transition-colors ${
              activeFlyout === "positive" ? "bg-green-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
            }`}
            title="Give feedback"
          >
            👍
          </button>
          <button
            onClick={() => setActiveFlyout(activeFlyout === "negative" ? null : "negative")}
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-lg transition-colors ${
              activeFlyout === "negative" ? "bg-red-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
            }`}
            title="Give feedback"
          >
            👎
          </button>

          {activeFlyout && (
            <>
              {/* Mobile: full-screen overlay */}
              <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 sm:hidden p-6" onClick={() => setActiveFlyout(null)}>
                <div className="bg-zinc-800 rounded-2xl p-4 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-1">
                    {(activeFlyout === "positive" ? POSITIVE_FEEDBACK : NEGATIVE_FEEDBACK).map((item) => (
                      <button
                        key={item.emoji}
                        onClick={() => {
                          handleFeedback(item.emoji, item.label, activeFlyout === "positive");
                          setActiveFlyout(null);
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-700 text-white text-base transition-colors"
                      >
                        <span className="text-2xl">{item.emoji}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setActiveFlyout(null)}
                    className="w-full mt-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-xl text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {/* Desktop: dropdown flyout */}
              <div
                ref={flyoutRef}
                className="hidden sm:block absolute bottom-full mb-2 bg-zinc-800 border border-zinc-600 rounded-xl p-1.5 shadow-xl z-40 right-0"
              >
                <div className="flex flex-col gap-0.5">
                  {(activeFlyout === "positive" ? POSITIVE_FEEDBACK : NEGATIVE_FEEDBACK).map((item) => (
                    <button
                      key={item.emoji}
                      onClick={() => handleFeedback(item.emoji, item.label, activeFlyout === "positive")}
                      className="flex items-center gap-2 px-1.5 sm:px-2 py-1.5 rounded-lg hover:bg-zinc-700 text-xl transition-colors"
                    >
                      <span>{item.emoji}</span>
                      <span className="hidden sm:inline text-xs text-zinc-300 whitespace-nowrap">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="shrink-0 w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-full text-sm font-medium transition-colors flex items-center justify-center"
        >
          <svg className="sm:hidden w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
    </div>
  );
}
