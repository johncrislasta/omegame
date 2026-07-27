"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
const SOCKET_URL =
  typeof window !== "undefined"
    ? `${protocol}//${window.location.hostname}:3001`
    : "http://localhost:3001";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "https:" : "http:";
    const url = `${proto}//${window.location.hostname}:3001`;
    const socket = io(url, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

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
    emit,
    on,
    getSocketId,
  };
}
