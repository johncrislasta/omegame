"use client";

import Link from "next/link";
import { useState } from "react";
import { useSocket } from "@/hooks/useSocket";

export default function Home() {
  const [mounted] = useState(true);
  const { onlineCount, isConnected } = useSocket();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div
        className={`text-center transition-all duration-700 ${
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
          <div className="flex items-center justify-center gap-1.5 text-zinc-500 text-sm mb-10">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {onlineCount.total} {onlineCount.total === 1 ? "person" : "people"} online
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/chat?mode=video"
            className="inline-flex items-center gap-3 px-8 py-4 bg-mint hover:bg-[#8fd696] text-zinc-900 text-lg font-semibold rounded-full transition-all hover:scale-105 hover:shadow-lg hover:shadow-mint/25"
          >
            <span className="text-2xl">🎥</span>
            <div className="flex flex-col items-start">
              <span>Video Chat</span>
              {onlineCount.video > 0 && (
                <span className="text-[#8fd696] text-xs font-normal leading-tight">{onlineCount.video} online</span>
              )}
            </div>
          </Link>
          <Link
            href="/chat?mode=text"
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
