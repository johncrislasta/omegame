"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import VideoChat from "@/components/VideoChat";
import ThemeToggle from "@/components/ThemeToggle";
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
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-white">
          <img src="/logo.png" alt="OmeGame" className="w-6 h-6" />
          <span>Ome<span className="text-mint-ink dark:text-mint">Game</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>{mode === "video" ? onlineCount.video : onlineCount.text}</span>
            <span className="hidden sm:inline">online</span>
          </div>
          <ThemeToggle />
          <div className="relative">
            <div className="sm:hidden relative">
              <select
                value={mode}
                onChange={(e) => switchMode(e.target.value)}
                aria-label="Switch chat mode"
                className="appearance-none bg-zinc-200 dark:bg-zinc-800 text-transparent text-sm w-11 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 focus:border-mint focus:outline-none cursor-pointer transition-colors"
              >
                <option value="video" className="text-zinc-900">🎥 Video Chat</option>
                <option value="text" className="text-zinc-900">💬 Text Chat</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 left-0 w-full flex items-center justify-center text-sm">
                {mode === "video" ? "🎥" : "💬"}
              </span>
            </div>
            <select
              value={mode}
              onChange={(e) => switchMode(e.target.value)}
              className="hidden sm:block appearance-none bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm px-3 py-1.5 pr-8 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 focus:border-mint focus:outline-none cursor-pointer transition-colors"
            >
              <option value="video">🎥 Video Chat</option>
              <option value="text">💬 Text Chat</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden sm:flex items-center pr-2">
              <svg className="w-4 h-4 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="h-screen flex items-center justify-center bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400">
        Loading...
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
