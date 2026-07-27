"use client";

import Link from "next/link";
import VideoChat from "@/components/VideoChat";
import { useSocket } from "@/hooks/useSocket";

export default function ChatPage() {
  const { onlineCount } = useSocket();

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <Link href="/" className="text-xl font-bold text-white">
          Ome<span className="text-purple-500">Game</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {onlineCount} online
          </div>
          <div className="text-zinc-500 text-sm">Video Chat</div>
        </div>
      </header>
      <VideoChat />
    </div>
  );
}
