import Link from "next/link";
import VideoChat from "@/components/VideoChat";

export default function ChatPage() {
  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <Link href="/" className="text-xl font-bold text-white">
          Ome<span className="text-purple-500">Game</span>
        </Link>
        <div className="text-zinc-500 text-sm">Video Chat</div>
      </header>
      <VideoChat />
    </div>
  );
}
