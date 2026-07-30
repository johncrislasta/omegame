"use client";

import Link from "next/link";
import { useState, useRef, KeyboardEvent } from "react";
import { useSocket } from "@/hooks/useSocket";
import { countryFlagUrl } from "@/lib/countryFlag";

export default function Home() {
  const [mounted] = useState(true);
  const { onlineCount, isConnected } = useSocket();
  const [interests, setInterests] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addInterest(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests((prev) => [...prev, trimmed]);
    }
  }

  function removeInterest(index: number) {
    setInterests((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addInterest(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && interests.length > 0) {
      removeInterest(interests.length - 1);
    }
  }

  const interestsParam = interests.join(",");

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div
        className={`text-center transition-all duration-700 w-full max-w-xl ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h1 className="text-6xl sm:text-8xl font-bold text-white mb-2 tracking-tight">
          Ome<span className="text-mint">Game</span>
        </h1>
        <p className="text-zinc-400 text-lg sm:text-xl mb-4 max-w-md mx-auto">
          Meet strangers. Play games. Have fun.
        </p>

        {isConnected && onlineCount.total > 0 && (
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="flex items-center gap-1.5 text-zinc-500 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {onlineCount.total} {onlineCount.total === 1 ? "person" : "people"} online
            </div>
            {Object.keys(onlineCount.countries).length > 0 && (
              <div className="flex items-center gap-3 flex-wrap justify-center">
                {Object.entries(onlineCount.countries).map(([code, count]) => (
                  <div key={code} className="flex flex-col items-center gap-0.5">
                    <img
                      src={countryFlagUrl(code)}
                      alt={code}
                      className="w-6 h-[15px] rounded-sm"
                    />
                    <span className="text-[10px] text-zinc-500">{code} {count > 1 && count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {onlineCount.topInterests && onlineCount.topInterests.length > 0 && (
          <div className="mb-5">
            <p className="text-zinc-500 text-xs mb-2">Trending interests</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {onlineCount.topInterests.map(({ interest, count }) => (
                <button
                  key={interest}
                  onClick={() => {
                    if (!interests.includes(interest)) {
                      setInterests((prev) => [...prev, interest]);
                      setInput("");
                      inputRef.current?.focus();
                    }
                  }}
                  className="px-2.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[11px] rounded-full transition-colors"
                >
                  {interest} <span className="text-zinc-500">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-900 border border-zinc-700 rounded-xl mb-3 min-h-[52px]">
            {interests.map((interest, i) => (
              <span
                key={interest}
                className="inline-flex items-center gap-1 px-3 py-1 bg-mint/20 text-mint text-sm rounded-full"
              >
                {interest}
                <button
                  onClick={() => removeInterest(i)}
                  className="hover:text-white transition-colors text-mint/60"
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={interests.length === 0 ? "Add interests (e.g. music, gaming, coding)..." : "Add more..."}
              className="flex-1 min-w-[120px] bg-transparent text-white placeholder-zinc-500 outline-none text-sm"
            />
          </div>
          <p className="text-zinc-500 text-xs text-left">Press Enter or comma to add. Click ✕ to remove.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link
            href={`/chat?mode=video${interestsParam ? `&interests=${encodeURIComponent(interestsParam)}` : ""}`}
            className="inline-flex items-center gap-3 px-8 py-4 bg-mint hover:bg-[#8fd696] text-zinc-900 text-lg font-semibold rounded-full transition-all hover:scale-105 hover:shadow-lg hover:shadow-mint/25"
          >
            <span className="text-2xl">🎥</span>
            <div className="flex flex-col items-start">
              <span>Video Chat</span>
              {onlineCount.video > 0 && (
                <span className="text-green-800 text-xs font-normal leading-tight">{onlineCount.video} online</span>
              )}
            </div>
          </Link>
          <Link
            href={`/chat?mode=text${interestsParam ? `&interests=${encodeURIComponent(interestsParam)}` : ""}`}
            className="inline-flex items-center gap-3 px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-white text-lg font-semibold rounded-full border border-zinc-600 hover:border-zinc-500 transition-all hover:scale-105"
          >
            <span className="text-2xl">💬</span>
            <div className="flex flex-col items-start">
              <span>Text Chat</span>
              {onlineCount.text > 0 && (
                <span className="text-zinc-400 text-xs font-normal leading-tight">{onlineCount.text} online</span>
              )}
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-lg mx-auto">
          {[
            { emoji: "🎥", label: "Video Chat" },
            { emoji: "❌", label: "Tic Tac Toe" },
            { emoji: "✊", label: "Rock Paper Scissors" },
            { emoji: "💬", label: "Text Chat" },
          ].map((item, i) => (
            <div
              key={item.label}
              className={`flex flex-col items-center gap-2 transition-all duration-500 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: `${200 + i * 100}ms` }}
            >
              <span className="text-3xl">{item.emoji}</span>
              <span className="text-zinc-500 text-sm">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
