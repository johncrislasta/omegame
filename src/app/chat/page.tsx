"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import VideoChat from "@/components/VideoChat";
import { useSocket } from "@/hooks/useSocket";

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = (searchParams.get("mode") === "text" ? "text" : "video") as "video" | "text";
  const interestsParam = searchParams.get("interests") || "";
  const interests = interestsParam ? interestsParam.split(",").filter(Boolean) : [];
  const { onlineCount } = useSocket();

  const switchMode = (newMode: string) => {
    router.push(`/chat?mode=${newMode}${interestsParam ? `&interests=${encodeURIComponent(interestsParam)}` : ""}`);
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
          <img src="/logo.png" alt="OmeGame" className="w-6 h-6" />
          <span>Ome<span className="text-mint">Game</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {mode === "video" ? onlineCount.video : onlineCount.text} online
          </div>
          <div className="relative">
            <select
              value={mode}
              onChange={(e) => switchMode(e.target.value)}
              className="appearance-none bg-zinc-800 text-white text-sm px-3 py-1.5 pr-8 rounded-lg border border-zinc-700 hover:border-zinc-500 focus:border-mint focus:outline-none cursor-pointer transition-colors"
            >
              <option value="video">🎥 Video Chat</option>
              <option value="text">💬 Text Chat</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </header>
      <VideoChat key={mode} mode={mode} interests={interests} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        Loading...
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
