"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";

const SOCKET_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_SIGNALING_URL || window.location.origin
    : "http://localhost:3000";

type OnlineCount = { total: number; video: number; text: number; countries: Record<string, number>; topInterests?: { interest: string; count: number }[] };

let cachedSessionId: string | null = null;
let cachedPath: string | null = null;

function getPage(): string {
  const p = window.location.pathname;
  if (p === "/" || p === "/home") return "home";
  if (p === "/chat") return "chat";
  if (p === "/admin") return "admin";
  return p.replace(/^\/+/, "") || p;
}

function getSession(): { sessionId: string | undefined; page: string } {
  if (typeof window === "undefined") return { sessionId: undefined, page: "unknown" };
  const page = getPage();
  if (cachedSessionId === null || cachedPath !== window.location.pathname) {
    cachedSessionId = uuid();
    cachedPath = window.location.pathname;
  }
  return { sessionId: cachedSessionId, page };
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState<OnlineCount>({ total: 0, video: 0, text: 0, countries: {} });

  useEffect(() => {
    const { sessionId, page } = getSession();
    const country = sessionStorage.getItem("country") || undefined;
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      query: { sessionId, page, country },
    });
    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("online-count", (count: OnlineCount) => setOnlineCount(count));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  const getSocketId = useCallback(() => {
    return socketRef.current?.id;
  }, []);

  return {
    isConnected,
    onlineCount,
    emit,
    on,
    getSocketId,
  };
}
