"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useCountry } from "@/hooks/useCountry";
import GameMenu from "./GameMenu";
import GamePanel from "./GamePanel";
import ChatBox from "./ChatBox";
import type { ChatMessage, GameType } from "@/lib/types";
import { countryFlagUrl } from "@/lib/countryFlag";
import { v4 as uuid } from "uuid";

type Status = "idle" | "waiting" | "matched" | "connecting" | "connected" | "disconnected";
type SnapCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

interface VideoChatProps {
  mode?: "video" | "text";
  interests?: string[];
}

export default function VideoChat({ mode = "video", interests: propInterests = [] }: VideoChatProps) {
  const { emit, on, isConnected } = useSocket();
  const webrtc = useWebRTC(emit);
  const myCountry = useCountry();
  const { onlineCount } = useSocket();

  const [status, setStatus] = useState<Status>("idle");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [gameType, setGameType] = useState<GameType>(null);
  const [localInterests, setLocalInterests] = useState<string[]>(propInterests);
  const [localInput, setLocalInput] = useState("");
  const [gameState, setGameState] = useState<Record<string, unknown>>({});
  const [isGameHost, setIsGameHost] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ from: string; gameType: string } | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [pendingPlayAgain, setPendingPlayAgain] = useState(false);
  const [partnerPendingPlayAgain, setPartnerPendingPlayAgain] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [snapCorner, setSnapCorner] = useState<SnapCorner>("top-right");
  const [pipEnlarged, setPipEnlarged] = useState(false);
  const [pipPinned, setPipPinned] = useState(false);
  const [containerLandscape, setContainerLandscape] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [incomingFeedback, setIncomingFeedback] = useState<{ type: string; isPositive: boolean } | null>(null);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [searchStartTime, setSearchStartTime] = useState<number>(0);
  const [searchPhase, setSearchPhase] = useState<"exact" | "broad" | "any">("exact");

  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number; moved: boolean } | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const partnerIdRef = useRef<string | null>(null);
  const pendingInviteRef = useRef<{ from: string; gameType: string } | null>(null);
  const pendingPlayAgainRef = useRef(false);
  const gameTypeRef = useRef<GameType>(null);
  const stopSearchRef = useRef(false);

  const interestInputRef = useRef<HTMLInputElement>(null);

  function addLocalInterest(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !localInterests.includes(trimmed)) {
      setLocalInterests((prev) => [...prev, trimmed]);
    }
  }

  function removeLocalInterest(index: number) {
    setLocalInterests((prev) => prev.filter((_, i) => i !== index));
  }

  function handleInterestKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLocalInterest(localInput);
      setLocalInput("");
    } else if (e.key === "Backspace" && !localInput && localInterests.length > 0) {
      removeLocalInterest(localInterests.length - 1);
    }
  }

  function handleInterestBlur() {
    if (localInput.trim()) {
      addLocalInterest(localInput);
      setLocalInput("");
    }
  }

  useEffect(() => {
    gameTypeRef.current = gameType;
  }, [gameType]);

  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  useEffect(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerWidth(width);
      setContainerLandscape(width >= height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pipEnlarged) setPipPinned(false);
  }, [pipEnlarged]);

  const resetState = useCallback(() => {
    setChatMessages([]);
    setGameType(null);
    setGameState({});
    setIsGameHost(false);
    setPendingInvite(null);
    pendingInviteRef.current = null;
    setGameOver(false);
    setPendingPlayAgain(false);
    setPartnerPendingPlayAgain(false);
    pendingPlayAgainRef.current = false;
    setPartnerCountry(null);
    setSharedInterests([]);
    setSearchStartTime(0);
    setSearchPhase("exact");
  }, []);

  const handleVideoDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest("[data-pip]") as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top, moved: false };
    target.setPointerCapture(e.pointerId);
  }, []);

  const handleVideoDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !videoContainerRef.current) return;
    const containerRect = videoContainerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    const target = e.currentTarget as HTMLElement;
    const newLeft = dragRef.current.startLeft - containerRect.left + dx;
    const newTop = dragRef.current.startTop - containerRect.top + dy;
    target.style.left = `${newLeft}px`;
    target.style.top = `${newTop}px`;
    target.style.right = "auto";
    target.style.bottom = "auto";
  }, []);

  const handleVideoDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !videoContainerRef.current) return;
    const target = (e.target as HTMLElement).closest("[data-pip]") as HTMLElement;
    if (!target) return;
    const moved = dragRef.current.moved;
    if (!moved) {
      setPipEnlarged((prev) => !prev);
    } else {
      const containerRect = videoContainerRef.current.getBoundingClientRect();
      const pipRect = target.getBoundingClientRect();
      const pipCenterX = pipRect.left + pipRect.width / 2 - containerRect.left;
      const pipCenterY = pipRect.top + pipRect.height / 2 - containerRect.top;
      const midX = containerRect.width / 2;
      const midY = containerRect.height / 2;
      const corner: SnapCorner =
        pipCenterY < midY
          ? pipCenterX < midX ? "top-left" : "top-right"
          : pipCenterX < midX ? "bottom-left" : "bottom-right";
      target.style.left = "";
      target.style.top = "";
      target.style.right = "";
      target.style.bottom = "";
      setSnapCorner(corner);
    }
    dragRef.current = null;
  }, []);

  const snapClass: Record<SnapCorner, string> = {
    "top-right": "top-3 right-3 origin-top-right",
    "top-left": "top-3 left-3 origin-top-left",
    "bottom-right": "bottom-3 right-3 origin-bottom-right",
    "bottom-left": "bottom-3 left-3 origin-bottom-left",
  };

  const pipSplitLandscape = containerLandscape && containerWidth >= 640;
  const compactVideo = mode === "video" && containerWidth > 0 && containerWidth < 640 && showChat && gameType;

  const handleSkip = useCallback(() => {
    webrtc.cleanup();
    resetState();
    partnerIdRef.current = null;
    stopSearchRef.current = true;
    emit("skip");
    setStatus("waiting");
    setSearchStartTime(Date.now());
    setSearchPhase("exact");
    emit("find-stranger", { mode, interests: localInterests });
  }, [webrtc, resetState, emit, mode, localInterests]);

  const handleEnterFullscreen = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches) return;
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => void;
    };
    try {
      if (el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      } else {
        el.webkitRequestFullscreen?.();
      }
    } catch {
      // iOS Safari does not support element fullscreen
    }
  }, []);

  const handleFindStranger = useCallback(() => {
    handleEnterFullscreen();
    stopSearchRef.current = false;
    resetState();
    setStatus("waiting");
    setSearchStartTime(Date.now());
    setSearchPhase("exact");
    emit("find-stranger", { mode, interests: localInterests });
  }, [resetState, emit, mode, localInterests, handleEnterFullscreen]);

  const handleStopSearch = useCallback(() => {
    stopSearchRef.current = true;
    emit("skip");
    setStatus("idle");
  }, [emit]);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!partnerIdRef.current) return;
      emit("chat-message", { to: partnerIdRef.current, message: text });
      setChatMessages((prev) => [
        ...prev,
        { id: uuid(), text, sender: "me", timestamp: Date.now() },
      ]);
    },
    [emit]
  );

  const handleSendGameInvite = useCallback(
    (game: "tic-tac-toe" | "rock-paper-scissors") => {
      if (!partnerIdRef.current) return;
      emit("game-invite", { to: partnerIdRef.current, gameType: game });
      setIsGameHost(true);
      const invite = { from: "me", gameType: game };
      setPendingInvite(invite);
      pendingInviteRef.current = invite;
    },
    [emit]
  );

  const handleAcceptGame = useCallback(() => {
    const invite = pendingInviteRef.current;
    if (!invite || !partnerIdRef.current) return;
    emit("game-accept", { to: partnerIdRef.current });
    setGameType(invite.gameType as GameType);
    setIsGameHost(false);
    setPendingInvite(null);
    pendingInviteRef.current = null;
  }, [emit]);

  const handleRejectGame = useCallback(() => {
    if (!partnerIdRef.current) return;
    emit("game-reject", { to: partnerIdRef.current });
    setPendingInvite(null);
    pendingInviteRef.current = null;
    setIsGameHost(false);
  }, [emit]);

  const handleGameEnd = useCallback(() => {
    if (partnerIdRef.current) {
      emit("game-end", { to: partnerIdRef.current });
    }
    setGameType(null);
    setGameState({});
    setGameOver(false);
    setPendingPlayAgain(false);
    setPartnerPendingPlayAgain(false);
    pendingPlayAgainRef.current = false;
    setIsGameHost(false);
  }, [emit]);

  const handleGameOver = useCallback(() => {
    setGameOver(true);
  }, []);


  const handleAcceptPlayAgain = useCallback(() => {
    if (!partnerIdRef.current || !gameType) return;
    emit("game-play-again-accept", { to: partnerIdRef.current });
    setPendingPlayAgain(false);
    setPartnerPendingPlayAgain(false);
    pendingPlayAgainRef.current = false;
    setGameOver(false);
    setGameState({});
    setGameKey((k) => k + 1);
    setIsGameHost((prev) => !prev);
  }, [emit, gameType]);

  const handleRejectPlayAgain = useCallback(() => {
    if (partnerIdRef.current) {
      emit("game-play-again-reject", { to: partnerIdRef.current });
    }
    setPendingPlayAgain(false);
    setPartnerPendingPlayAgain(false);
    pendingPlayAgainRef.current = false;
    setGameType(null);
    setGameState({});
    setGameOver(false);
  }, [emit]);

  const handleGameLocalState = useCallback(
    (state: unknown) => {
      if (partnerIdRef.current) {
        emit("game-state", { to: partnerIdRef.current, state });
      }
    },
    [emit]
  );

  const handleFeedback = useCallback(
    (type: string, category: string, isPositive: boolean) => {
      if (!partnerIdRef.current) return;
      emit("feedback-send", { to: partnerIdRef.current, type, category, isPositive });
      setChatMessages((prev) => [
        ...prev,
        { id: uuid(), text: `You sent ${type}`, sender: "me", timestamp: Date.now(), kind: "feedback" },
      ]);
    },
    [emit]
  );

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      on("waiting", () => {
        setStatus("waiting");
      })
    );

    cleanups.push(
      on("matched", async (data: unknown) => {
        const { partnerId: pid, isInitiator, partnerCountry: pc, sharedInterests: si } = data as { partnerId: string; roomId: string; isInitiator: boolean; partnerCountry?: string; sharedInterests?: string[] };
        partnerIdRef.current = pid;
        if (pc) setPartnerCountry(pc);
        if (si && si.length > 0) setSharedInterests(si);
        setStatus("connecting");

        if (mode === "text") {
          setStatus("connected");
          if (pc) {
            setChatMessages((prev) => [
              ...prev,
              { id: uuid(), text: `Stranger is from ${pc.toUpperCase()}`, sender: "stranger", timestamp: Date.now(), kind: "feedback", flagCode: pc },
            ]);
          }
          if (si && si.length > 0) {
            setChatMessages((prev) => [
              ...prev,
              { id: uuid(), text: `You both are interested in ${si.join(", ")}`, sender: "stranger", timestamp: Date.now(), kind: "feedback" },
            ]);
          }
          return;
        }

        await webrtc.setupPeerConnection(pid);
        if (isInitiator) {
          try {
            const offer = await webrtc.createOffer();
            emit("offer", { to: pid, offer });
          } catch (err) {
            console.error("Failed to create offer:", err);
          }
        }
      })
    );

    cleanups.push(
      on("offer", async (data: unknown) => {
        if (mode === "text") return;
        const { from, offer } = data as { from: string; offer: RTCSessionDescriptionInit };
        partnerIdRef.current = from;
        setStatus("connecting");

        await webrtc.setupPeerConnection(from);
        try {
          const answer = await webrtc.handleOffer(offer);
          emit("answer", { to: from, answer });
          setStatus("connected");
        } catch (err) {
          console.error("Failed to handle offer:", err);
        }
      })
    );

    cleanups.push(
      on("answer", async (data: unknown) => {
        if (mode === "text") return;
        const { answer } = data as { answer: RTCSessionDescriptionInit };
        try {
          await webrtc.handleAnswer(answer);
          setStatus("connected");
        } catch (err) {
          console.error("Failed to handle answer:", err);
        }
      })
    );

    cleanups.push(
      on("ice-candidate", async (data: unknown) => {
        if (mode === "text") return;
        const { candidate } = data as { candidate: RTCIceCandidateInit };
        await webrtc.addIceCandidate(candidate);
      })
    );

    cleanups.push(
      on("chat-message", (data: unknown) => {
        const { message } = data as { message: string };
        setChatMessages((prev) => [
          ...prev,
          { id: uuid(), text: message, sender: "stranger", timestamp: Date.now() },
        ]);
        setUnreadCount((prev) => prev + 1);
      })
    );

    cleanups.push(
      on("feedback-received", (data: unknown) => {
        const { type, isPositive } = data as { type: string; isPositive: boolean };
        setIncomingFeedback({ type, isPositive });
        setChatMessages((prev) => [
          ...prev,
          { id: uuid(), text: `Stranger sent ${type}`, sender: "stranger", timestamp: Date.now(), kind: "feedback" },
        ]);
        setTimeout(() => setIncomingFeedback(null), 1000);
      })
    );

    cleanups.push(
      on("game-invite", (data: unknown) => {
        const { from, gameType: gt } = data as { from: string; gameType: string };
        const invite = { from, gameType: gt };
        setPendingInvite(invite);
        pendingInviteRef.current = invite;
        setIsGameHost(false);
      })
    );

    cleanups.push(
      on("game-accept", () => {
        const invite = pendingInviteRef.current;
        if (invite) {
          setGameType(invite.gameType as GameType);
          setPendingInvite(null);
          pendingInviteRef.current = null;
        }
      })
    );

    cleanups.push(
      on("game-reject", () => {
        setPendingInvite(null);
        pendingInviteRef.current = null;
        setIsGameHost(false);
      })
    );

    cleanups.push(
      on("game-state", (data: unknown) => {
        const { state } = data as { state: Record<string, unknown> };
        setGameState(state);
      })
    );

    cleanups.push(
      on("game-end", () => {
        setGameType(null);
        setGameState({});
        setGameOver(false);
        setPendingPlayAgain(false);
        setPartnerPendingPlayAgain(false);
        pendingPlayAgainRef.current = false;
        setIsGameHost(false);
      })
    );

    cleanups.push(
      on("game-play-again", () => {
        setPartnerPendingPlayAgain(true);
      })
    );

    cleanups.push(
      on("game-play-again-accept", () => {
        if (pendingPlayAgainRef.current && gameTypeRef.current) {
    setPendingPlayAgain(false);
    setPartnerPendingPlayAgain(false);
    pendingPlayAgainRef.current = false;
    setUnreadCount(0);
    stopSearchRef.current = false;
          setGameOver(false);
          setGameState({});
          setGameKey((k) => k + 1);
          setIsGameHost((prev) => !prev);
        }
      })
    );

    cleanups.push(
      on("game-play-again-reject", () => {
        setPendingPlayAgain(false);
        setPartnerPendingPlayAgain(false);
        pendingPlayAgainRef.current = false;
        setGameType(null);
        setGameState({});
        setGameOver(false);
      })
    );

    cleanups.push(
      on("strangerDisconnected", () => {
        setStatus("disconnected");
        partnerIdRef.current = null;
        if (mode === "video") webrtc.cleanup();
        resetState();
        setTimeout(() => {
          emit("find-stranger", { mode, interests: localInterests });
          setStatus("waiting");
        }, 300);
      })
    );

    cleanups.push(
      on("disconnected", () => {
        if (stopSearchRef.current) {
          stopSearchRef.current = false;
          return;
        }
        setStatus("disconnected");
      })
    );

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [on, webrtc, emit, resetState, mode, localInterests]);

  useEffect(() => {
    if (mode === "text") return;
    if (!webrtc.localStream) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera requires HTTPS. Access the app via HTTPS or localhost.");
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        webrtc.setLocalStreamDirect(stream);
      }).catch(() => {
        setCameraError("Camera/microphone access denied. Please allow access and refresh.");
      });
    }
  }, [webrtc, mode]);

  useEffect(() => {
    if (myCountry) emit("set-country", myCountry);
  }, [myCountry, emit]);

  useEffect(() => {
    if (status !== "waiting" || !searchStartTime || localInterests.length === 0) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - searchStartTime;
      if (elapsed >= 60000) setSearchPhase("any");
      else if (elapsed >= 30000) setSearchPhase("broad");
    }, 1000);
    return () => clearInterval(interval);
  }, [status, searchStartTime, localInterests]);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 min-h-0">
      {!isConnected && (
        <div className="bg-yellow-900/50 text-yellow-200 text-center py-2 px-4 text-sm">
          Connecting to server...
        </div>
      )}
      {cameraError && (
        <div className="bg-red-900/50 text-red-200 text-center py-2 px-4 text-sm">
          {cameraError}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          {mode === "video" ? (
            <div ref={videoContainerRef} className="flex-1 relative min-h-0">
              <div className={`absolute bg-zinc-100 dark:bg-zinc-900 rounded-lg overflow-hidden transition-[left,right,top,bottom] duration-200 ease-out ${ compactVideo ? "top-0 bottom-0 left-0 right-1/2" : pipPinned ? pipSplitLandscape ? snapCorner.endsWith("left") ? "top-0 bottom-0 left-1/2 right-0" : "top-0 bottom-0 left-0 right-1/2" : snapCorner.startsWith("top") ? "top-1/2 bottom-0 left-0 right-0" : "top-0 bottom-1/2 left-0 right-0" : "inset-0" }`}>
                {webrtc.remoteStream ? (
                  <>
                  <video
                    ref={(el) => {
                      if (el) el.srcObject = webrtc.remoteStream;
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {partnerCountry && countryFlagUrl(partnerCountry) && (
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-1 z-10 flex items-center gap-1" title={partnerCountry}>
                      <img src={countryFlagUrl(partnerCountry)} alt={partnerCountry} className="w-6 h-[15px] rounded-sm" />
                      {sharedInterests.length > 0 && (
                        <span className="text-white text-[10px] font-medium ml-1 truncate max-w-[120px]">
                          {sharedInterests.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {status === "waiting" && (
                      <div className="text-center">
                        <div className="text-4xl mb-4 animate-spin">🔍</div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-lg">
                          {localInterests.length > 0
                            ? searchPhase === "exact"
                              ? `Looking for someone interested in ${localInterests.join(", ")}...`
                              : searchPhase === "broad"
                                ? `Looking for someone interested in ${localInterests.join(" or ")}...`
                                : "Looking for someone..."
                            : "Looking for someone..."}
                        </div>
                        <div className="text-zinc-500 dark:text-zinc-600 text-sm mt-2">This may take a moment</div>
                      </div>
                    )}
                    {status === "connecting" && (
                      <div className="text-center">
                        <div className="text-4xl mb-4 animate-pulse">⚡</div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-lg">Connecting...</div>
                      </div>
                    )}
                    {status === "idle" && (
                      <div className="flex flex-col items-center gap-4 px-4 max-w-md mx-auto w-full">
                        <div className="text-6xl">🎯</div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-lg">Ready to meet someone?</div>
                        <div className="w-full">
                          <div className="flex flex-wrap items-center gap-2 p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg mb-2 min-h-[44px]">
                            {localInterests.map((interest, i) => (
                              <span key={interest} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-mint/20 text-mint-ink dark:text-mint text-xs rounded-full">
                                {interest}
                                <button onClick={() => removeLocalInterest(i)} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-mint-ink/60 dark:text-mint/60">✕</button>
                              </span>
                            ))}
                            <input
                              ref={interestInputRef}
                              type="text"
                              value={localInput}
                              onChange={(e) => setLocalInput(e.target.value)}
                              onKeyDown={handleInterestKeyDown}
                              onBlur={handleInterestBlur}
                              placeholder={localInterests.length === 0 ? "Add interests..." : "Add more..."}
                              className="flex-1 min-w-[100px] bg-transparent text-zinc-900 dark:text-white placeholder-zinc-500 outline-none text-xs"
                            />
                          </div>
                          {onlineCount.topInterests && onlineCount.topInterests.length > 0 && (
                            <div className="flex flex-wrap gap-1 justify-center">
                              {onlineCount.topInterests.map(({ interest, count }) => (
                                <button
                                  key={interest}
                                  onClick={() => {
                                    if (!localInterests.includes(interest)) {
                                      setLocalInterests((prev) => [...prev, interest]);
                                      setLocalInput("");
                                      interestInputRef.current?.focus();
                                    }
                                  }}
                                  className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-zinc-700 dark:text-zinc-300 text-[10px] rounded-full transition-colors"
                                >
                                  {interest} <span className="text-zinc-500">{count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {status === "disconnected" && (
                      <div className="text-center">
                        <div className="text-4xl mb-4">👋</div>
                        <div className="text-zinc-600 dark:text-zinc-400 text-lg">Stranger has left</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                data-pip
                onPointerDown={compactVideo || pipPinned ? undefined : handleVideoDragStart}
                onPointerMove={compactVideo || pipPinned ? undefined : handleVideoDragMove}
                onPointerUp={compactVideo || pipPinned ? undefined : handleVideoDragEnd}
                className={`absolute bg-zinc-800 rounded-lg overflow-hidden border-2 border-zinc-700 z-10 touch-none select-none transition-[left,right,top,bottom,width,height,transform,transform-origin] duration-200 ease-out ${
                  compactVideo
                    ? "top-0 bottom-0 right-0 w-1/2"
                    : pipPinned
                      ? pipSplitLandscape
                        ? snapCorner.endsWith("left")
                          ? "top-0 left-0 w-1/2 h-full"
                          : "top-0 right-0 w-1/2 h-full"
                        : snapCorner.startsWith("top")
                          ? "top-0 left-0 w-full h-1/2"
                          : "bottom-0 left-0 w-full h-1/2"
                      : `${snapClass[snapCorner]} w-28 h-20 sm:w-36 sm:h-28 ${pipEnlarged ? "scale-[2.5]" : "scale-100"}`
                }`}
              >
                {webrtc.localStream ? (
                  <video
                    ref={(el) => {
                      if (el && webrtc.localStream && el.srcObject !== webrtc.localStream) {
                        el.srcObject = webrtc.localStream;
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-600 text-xs">
                    Loading...
                  </div>
                )}
                {!compactVideo && pipEnlarged && !pipPinned && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setPipPinned(true)}
                    className="absolute bottom-1 right-1 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white text-xs transition-colors"
                    title="Pin to half"
                  >
                    📌
                  </button>
                )}
                {!compactVideo && pipPinned && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setPipPinned(false)}
                    className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white text-xs transition-colors z-20"
                    title="Unpin"
                  >
                    📌
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0">
              <div className="flex-1 flex flex-col items-center justify-center p-0 sm:p-8 min-h-0 relative">
            {status === "waiting" && (
              <div className="text-center">
                <div className="text-4xl mb-4 animate-spin">🔍</div>
                <div className="text-zinc-600 dark:text-zinc-400 text-lg">
                  {localInterests.length > 0
                    ? searchPhase === "exact"
                      ? `Looking for someone interested in ${localInterests.join(", ")}...`
                      : searchPhase === "broad"
                        ? `Looking for someone interested in ${localInterests.join(" or ")}...`
                        : "Looking for someone..."
                    : "Looking for someone..."}
                </div>
                <div className="text-zinc-500 dark:text-zinc-600 text-sm mt-2">This may take a moment</div>
              </div>
            )}
            {status === "connecting" && (
              <div className="text-center">
                <div className="text-4xl mb-4 animate-pulse">⚡</div>
                <div className="text-zinc-600 dark:text-zinc-400 text-lg">Connecting...</div>
              </div>
            )}
            {status === "idle" && (
              <div className="flex flex-col items-center gap-4 px-4 max-w-md mx-auto w-full">
                <div className="text-6xl">💬</div>
                <div className="text-zinc-600 dark:text-zinc-400 text-lg">Ready to chat with someone?</div>
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-2 p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg mb-2 min-h-[44px]">
                    {localInterests.map((interest, i) => (
                      <span key={interest} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-mint/20 text-mint-ink dark:text-mint text-xs rounded-full">
                        {interest}
                        <button onClick={() => removeLocalInterest(i)} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-mint-ink/60 dark:text-mint/60">✕</button>
                      </span>
                    ))}
                    <input
                      ref={interestInputRef}
                      type="text"
                      value={localInput}
                      onChange={(e) => setLocalInput(e.target.value)}
                      onKeyDown={handleInterestKeyDown}
                      onBlur={handleInterestBlur}
                      placeholder={localInterests.length === 0 ? "Add interests..." : "Add more..."}
                      className="flex-1 min-w-[100px] bg-transparent text-zinc-900 dark:text-white placeholder-zinc-500 outline-none text-xs"
                    />
                  </div>
                  {onlineCount.topInterests && onlineCount.topInterests.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center">
                      {onlineCount.topInterests.map(({ interest, count }) => (
                        <button
                          key={interest}
                          onClick={() => {
                            if (!localInterests.includes(interest)) {
                              setLocalInterests((prev) => [...prev, interest]);
                              setLocalInput("");
                              interestInputRef.current?.focus();
                            }
                          }}
                          className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 text-zinc-700 dark:text-zinc-300 text-[10px] rounded-full transition-colors"
                        >
                          {interest} <span className="text-zinc-500">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {status === "disconnected" && (
              <div className="text-center">
                <div className="text-4xl mb-4">👋</div>
                <div className="text-zinc-600 dark:text-zinc-400 text-lg">Stranger has left</div>
              </div>
            )}
            {status === "connected" && (
                  <div className="w-full h-full flex flex-col min-h-0">
                    <div className="flex-1 min-h-0">
                      <ChatBox messages={chatMessages} onSendMessage={handleSendMessage} onFeedback={handleFeedback} incomingFeedback={incomingFeedback} />
                    </div>
                  </div>
                )}
              </div>
              {gameType && (
                <div className={`w-full lg:w-80 ${gameType === "tic-tac-toe" ? "h-[58%]" : "h-[45%]"} lg:h-auto border-t lg:border-t-0 lg:border-l border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 flex flex-col min-h-0`}>
                  <GamePanel
                    key={gameKey}
                    gameType={gameType}
                    isHost={isGameHost}
                    gameState={gameState}
                    onLocalState={handleGameLocalState}
                    onGameEnd={handleGameEnd}
                    onGameOver={handleGameOver}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 p-3 bg-zinc-100/50 dark:bg-zinc-900/50">
            {status === "idle" || status === "disconnected" ? (
              <button
                onClick={handleFindStranger}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium transition-colors flex items-center gap-2"
              >
                <span>▶</span> Start
              </button>
            ) : status === "waiting" ? (
              <button
                onClick={handleStopSearch}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium transition-colors flex items-center gap-2"
              >
                <span>⏹</span> Stop
              </button>
            ) : (
              <>
                <button
                  onClick={handleSkip}
                  className="px-5 py-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-full font-medium transition-colors flex items-center gap-2"
                >
                  <span>⏭</span> Skip
                </button>
                {status === "connected" && (
                  <>
                    <GameMenu onSelectGame={handleSendGameInvite} />
                    {mode === "video" && (
                      <button
                        onClick={() => setShowChat(!showChat)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 relative ${ showChat ? "bg-blue-600 text-white" : "bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white" }`}
                      >
                        💬 Chat
                        {!showChat && unreadCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {unreadCount}
                          </span>
                        )}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {mode === "video" && (showChat || gameType) && (
          <div className={`w-full lg:w-96 lg:h-auto flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 ${
            !gameType
              ? "h-64"
              : showChat
                ? gameType === "tic-tac-toe" ? "h-[calc(58%+10rem)]" : "h-[calc(45%+10rem)]"
                : gameType === "tic-tac-toe" ? "h-[58%]" : "h-[45%]"
          }`}>
            {gameType && (
              <div className={`flex-1 min-h-0 lg:flex-[5] ${showChat ? "border-b border-zinc-300 dark:border-zinc-700" : ""}`}>
                <GamePanel
                  key={gameKey}
                  gameType={gameType}
                  isHost={isGameHost}
                  gameState={gameState}
                  onLocalState={handleGameLocalState}
                  onGameEnd={handleGameEnd}
                  onGameOver={handleGameOver}
                />
              </div>
            )}
            {showChat && (
              <div className={`${gameType ? "h-40 lg:h-auto lg:flex-[3]" : "h-full"} flex flex-col min-h-0`}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-300 dark:border-zinc-700 shrink-0">
                  <span className="text-zinc-900 dark:text-white font-medium text-sm">Chat</span>
                  <button onClick={() => setShowChat(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg">
                    ✕
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <ChatBox messages={chatMessages} onSendMessage={handleSendMessage} onFeedback={handleFeedback} incomingFeedback={incomingFeedback} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingInvite && !isGameHost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-300 dark:border-zinc-700 text-center">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="text-zinc-900 dark:text-white text-lg font-bold mb-2">Game Invitation</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Your partner wants to play{" "}
              <span className="text-zinc-900 dark:text-white font-semibold">
                {pendingInvite.gameType === "tic-tac-toe" ? "Tic Tac Toe" : "Rock Paper Scissors"}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRejectGame}
                className="flex-1 py-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg transition-colors"
              >
                Decline
              </button>
              <button
                onClick={handleAcceptGame}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingInvite && isGameHost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-300 dark:border-zinc-700 text-center">
            <div className="text-4xl mb-3 animate-bounce">🎮</div>
            <h3 className="text-zinc-900 dark:text-white text-lg font-bold mb-2">Waiting for response...</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Waiting for partner to accept{" "}
              <span className="text-zinc-900 dark:text-white font-semibold">
                {pendingInvite.gameType === "tic-tac-toe" ? "Tic Tac Toe" : "Rock Paper Scissors"}
              </span>
            </p>
            <button
              onClick={handleRejectGame}
              className="py-2 px-6 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameOver && gameType && pendingPlayAgain && !partnerPendingPlayAgain && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-300 dark:border-zinc-700 text-center">
            <div className="text-4xl mb-3 animate-bounce">🔄</div>
            <h3 className="text-zinc-900 dark:text-white text-lg font-bold mb-2">Waiting for response...</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">Waiting for partner to decide</p>
            <button
              onClick={handleRejectPlayAgain}
              className="py-2 px-6 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameOver && gameType && partnerPendingPlayAgain && !pendingPlayAgain && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-300 dark:border-zinc-700 text-center">
            <div className="text-4xl mb-3">🔄</div>
            <h3 className="text-zinc-900 dark:text-white text-lg font-bold mb-2">Play Again?</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">Your partner wants to play again</p>
            <div className="flex gap-3">
              <button
                onClick={handleRejectPlayAgain}
                className="flex-1 py-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-zinc-900 dark:text-white rounded-lg transition-colors"
              >
                Leave
              </button>
              <button
                onClick={handleAcceptPlayAgain}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                Sure!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
