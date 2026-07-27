"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [mounted] = useState(true);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div
        className={`text-center transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <h1 className="text-6xl sm:text-8xl font-bold text-white mb-2 tracking-tight">
          Random<span className="text-purple-500">Play</span>
        </h1>
        <p className="text-zinc-400 text-lg sm:text-xl mb-12 max-w-md mx-auto">
          Meet strangers. Play games. Have fun.
        </p>

        <Link
          href="/chat"
          className="inline-flex items-center gap-3 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold rounded-full transition-all hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
        >
          <span className="text-2xl">▶</span>
          Start Chatting
        </Link>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-lg mx-auto">
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
