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

function getDeviceInfo(): { device: string; os: string; browser: string } {
  const ua = navigator.userAgent || "";
  let device = "desktop";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) device = "tablet";
  else if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) device = "mobile";

  let os = "unknown";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/CriOS\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS\//i.test(ua)) browser = "Firefox";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  else {
    const raw = ua.match(/(?:CriOS|FxiOS|EdgiOS|Version|Safari|OPT)\/[\d.]+/i);
    if (raw) browser = raw[0];
  }

  return { device, os, browser };
}

function getUtmInfo(): { utmSource: string; utmMedium: string; utmCampaign: string } {
  if (typeof window === "undefined") return { utmSource: "", utmMedium: "", utmCampaign: "" };
  const q = new URLSearchParams(window.location.search);
  const clean = (v: string | null) => (v ? v.trim().slice(0, 100) : "");
  return {
    utmSource: clean(q.get("utm_source")) || clean(q.get("source")) || clean(q.get("ref")) || clean(q.get("from")),
    utmMedium: clean(q.get("utm_medium")),
    utmCampaign: clean(q.get("utm_campaign")),
  };
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState<OnlineCount>({ total: 0, video: 0, text: 0, countries: {} });

  useEffect(() => {
    const { sessionId, page } = getSession();
    const country = sessionStorage.getItem("country") || undefined;
    const { device, os, browser } = getDeviceInfo();
    const { utmSource, utmMedium, utmCampaign } = getUtmInfo();
    const query: Record<string, string> = { page };
    if (sessionId) query.sessionId = sessionId;
    for (const [key, value] of Object.entries({ country, device, os, browser, utmSource, utmMedium, utmCampaign })) {
      if (value) query[key] = value;
    }
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      query,
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
