"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import GameMenu from "./GameMenu";
import GameOverlay from "./GameOverlay";
import ChatBox from "./ChatBox";
import type { ChatMessage, GameType } from "@/lib/types";
import { v4 as uuid } from "uuid";

type Status = "idle" | "waiting" | "matched" | "connecting" | "connected" | "disconnected";
type SnapCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export default function VideoChat() {
  const { emit, on, isConnected } = useSocket();
  const webrtc = useWebRTC(emit);

  const [status, setStatus] = useState<Status>("idle");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [gameType, setGameType] = useState<GameType>(null);
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

  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number; moved: boolean } | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const partnerIdRef = useRef<string | null>(null);
  const pendingInviteRef = useRef<{ from: string; gameType: string } | null>(null);
  const pendingPlayAgainRef = useRef(false);
  const gameTypeRef = useRef<GameType>(null);

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

  const handleSkip = useCallback(() => {
    webrtc.cleanup();
    resetState();
    setStatus("idle");
    partnerIdRef.current = null;
    emit("skip");
  }, [webrtc, resetState, emit]);

  const handleFindStranger = useCallback(() => {
    resetState();
    setStatus("waiting");
    emit("find-stranger");
  }, [resetState, emit]);

  const handleStopSearch = useCallback(() => {
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
  }, [emit]);

  const handleGameOver = useCallback(() => {
    setGameOver(true);
  }, []);

  const handlePlayAgain = useCallback(() => {
    if (!partnerIdRef.current) return;
    setPendingPlayAgain(true);
    pendingPlayAgainRef.current = true;
    emit("game-play-again", { to: partnerIdRef.current });
  }, [emit]);

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

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      on("waiting", () => {
        setStatus("waiting");
      })
    );

    cleanups.push(
      on("matched", async (data: unknown) => {
        const { partnerId: pid, isInitiator } = data as { partnerId: string; roomId: string; isInitiator: boolean };
        partnerIdRef.current = pid;
        setStatus("connecting");

        webrtc.setupPeerConnection(pid);
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
        const { from, offer } = data as { from: string; offer: RTCSessionDescriptionInit };
        partnerIdRef.current = from;
        setStatus("connecting");

        webrtc.setupPeerConnection(from);
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
      on("game-invite", (data: unknown) => {
        const { from, gameType: gt } = data as { from: string; gameType: string };
        const invite = { from, gameType: gt };
        setPendingInvite(invite);
        pendingInviteRef.current = invite;
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
        webrtc.cleanup();
        resetState();
      })
    );

    cleanups.push(
      on("disconnected", () => {
        setStatus("disconnected");
      })
    );

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [on, webrtc, emit, resetState]);

  useEffect(() => {
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
  }, [webrtc]);

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 min-h-0">
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
          <div ref={videoContainerRef} className="flex-1 relative min-h-0">
            <div className={`absolute bg-zinc-900 rounded-lg overflow-hidden transition-[left,right,top,bottom] duration-200 ease-out ${
              pipPinned
                ? containerLandscape
                  ? snapCorner.endsWith("left")
                    ? "top-0 bottom-0 left-1/2 right-0"
                    : "top-0 bottom-0 left-0 right-1/2"
                  : snapCorner.startsWith("top")
                    ? "top-1/2 bottom-0 left-0 right-0"
                    : "top-0 bottom-1/2 left-0 right-0"
                : "inset-0"
            }`}>
              {webrtc.remoteStream ? (
                <video
                  ref={(el) => {
                    if (el) el.srcObject = webrtc.remoteStream;
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {status === "waiting" && (
                    <div className="text-center">
                      <div className="text-4xl mb-4 animate-spin">🔍</div>
                      <div className="text-zinc-400 text-lg">Looking for someone...</div>
                      <div className="text-zinc-600 text-sm mt-2">This may take a moment</div>
                    </div>
                  )}
                  {status === "connecting" && (
                    <div className="text-center">
                      <div className="text-4xl mb-4 animate-pulse">⚡</div>
                      <div className="text-zinc-400 text-lg">Connecting...</div>
                    </div>
                  )}
                  {status === "idle" && (
                    <div className="text-center">
                      <div className="text-6xl mb-4">🎯</div>
                      <div className="text-zinc-400 text-lg">Ready to meet someone?</div>
                    </div>
                  )}
                  {status === "disconnected" && (
                    <div className="text-center">
                      <div className="text-4xl mb-4">👋</div>
                      <div className="text-zinc-400 text-lg">Stranger has left</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              data-pip
              onPointerDown={pipPinned ? undefined : handleVideoDragStart}
              onPointerMove={pipPinned ? undefined : handleVideoDragMove}
              onPointerUp={pipPinned ? undefined : handleVideoDragEnd}
              className={`absolute bg-zinc-800 rounded-lg overflow-hidden border-2 border-zinc-700 z-10 touch-none select-none transition-[left,right,top,bottom,width,height,transform] duration-200 ease-out ${
                pipPinned
                  ? containerLandscape
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
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                  Loading...
                </div>
              )}
              {pipEnlarged && !pipPinned && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setPipPinned(true)}
                  className="absolute bottom-1 right-1 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white text-xs transition-colors"
                  title="Pin to half"
                >
                  📌
                </button>
              )}
              {pipPinned && (
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

            {gameType && (
              <GameOverlay
                key={gameKey}
                gameType={gameType}
                isHost={isGameHost}
                gameState={gameState}
                onLocalState={handleGameLocalState}
                onGameEnd={handleGameEnd}
                onGameOver={handleGameOver}
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-3 p-3 bg-zinc-900/50">
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
                  className="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-full font-medium transition-colors flex items-center gap-2"
                >
                  <span>⏭</span> Skip
                </button>
                {status === "connected" && (
                  <>
                    {gameOver && gameType && !pendingPlayAgain && !partnerPendingPlayAgain && (
                      <button
                        onClick={handlePlayAgain}
                        className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-medium transition-colors flex items-center gap-2"
                      >
                        🔄 Play Again
                      </button>
                    )}
                    {!gameOver && (
                      <GameMenu onSelectGame={handleSendGameInvite} />
                    )}
                    <button
                      onClick={() => setShowChat(!showChat)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 relative ${
                        showChat ? "bg-blue-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-white"
                      }`}
                    >
                      💬 Chat
                      {!showChat && unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {showChat && (
          <div className="w-full lg:w-80 h-64 lg:h-auto border-t lg:border-t-0 lg:border-l border-zinc-700 bg-zinc-900 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
              <span className="text-white font-medium text-sm">Chat</span>
              <button onClick={() => setShowChat(false)} className="text-zinc-400 hover:text-white text-lg">
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatBox messages={chatMessages} onSendMessage={handleSendMessage} />
            </div>
          </div>
        )}
      </div>

      {pendingInvite && !isGameHost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 text-center">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="text-white text-lg font-bold mb-2">Game Invitation</h3>
            <p className="text-zinc-400 mb-4">
              Your partner wants to play{" "}
              <span className="text-white font-semibold">
                {pendingInvite.gameType === "tic-tac-toe" ? "Tic Tac Toe" : "Rock Paper Scissors"}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRejectGame}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
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
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 text-center">
            <div className="text-4xl mb-3 animate-bounce">🎮</div>
            <h3 className="text-white text-lg font-bold mb-2">Waiting for response...</h3>
            <p className="text-zinc-400 mb-4">
              Waiting for partner to accept{" "}
              <span className="text-white font-semibold">
                {pendingInvite.gameType === "tic-tac-toe" ? "Tic Tac Toe" : "Rock Paper Scissors"}
              </span>
            </p>
            <button
              onClick={handleRejectGame}
              className="py-2 px-6 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameOver && gameType && pendingPlayAgain && !partnerPendingPlayAgain && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 text-center">
            <div className="text-4xl mb-3 animate-bounce">🔄</div>
            <h3 className="text-white text-lg font-bold mb-2">Waiting for response...</h3>
            <p className="text-zinc-400 mb-4">Waiting for partner to decide</p>
            <button
              onClick={handleRejectPlayAgain}
              className="py-2 px-6 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameOver && gameType && partnerPendingPlayAgain && !pendingPlayAgain && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 text-center">
            <div className="text-4xl mb-3">🔄</div>
            <h3 className="text-white text-lg font-bold mb-2">Play Again?</h3>
            <p className="text-zinc-400 mb-4">Your partner wants to play again</p>
            <div className="flex gap-3">
              <button
                onClick={handleRejectPlayAgain}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
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
