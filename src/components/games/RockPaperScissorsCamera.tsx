"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Gesture } from "@/lib/gesture";
import { useHandGesture } from "@/hooks/useHandGesture";

type RoundResult = "win" | "lose" | "draw";

const GESTURES: { value: Gesture; emoji: string; label: string }[] = [
  { value: "rock", emoji: "✊", label: "Rock" },
  { value: "paper", emoji: "✋", label: "Paper" },
  { value: "scissors", emoji: "✌️", label: "Scissors" },
];

const choiceEmoji: Record<Gesture, string> = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

const INTRO_MS = 2000;
const READY_MS = 1000;
const SET_MS = 1000;
const GO_MS = 5000;
const GO_START = INTRO_MS + READY_MS + SET_MS;

type Phase = "intro" | "ready" | "set" | "go" | "capture";

function phaseAt(elapsed: number): Phase {
  if (elapsed < INTRO_MS) return "intro";
  if (elapsed < INTRO_MS + READY_MS) return "ready";
  if (elapsed < INTRO_MS + READY_MS + SET_MS) return "set";
  if (elapsed < GO_START + GO_MS) return "go";
  return "capture";
}

export interface RpsServerResult {
  nonce: number;
  myChoice: Gesture | null;
  oppChoice: Gesture | null;
  result: RoundResult;
}

interface CameraRPSProps {
  onStateChange: (state: Record<string, unknown>) => void;
  gameState: Record<string, unknown>;
  onGameOver: () => void;
  onGameEnd: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  landscape: boolean;
  isHost: boolean;
  onSubmitChoice: (payload: { nonce: number; choice: Gesture | null }) => void;
  rpsResult: RpsServerResult | null;
}

interface Round {
  myChoice: Gesture | null;
  oppChoice: Gesture | null;
  result: RoundResult;
}

export default function RockPaperScissorsCamera({
  onStateChange,
  gameState,
  onGameOver,
  onGameEnd,
  localVideoRef,
  landscape,
  isHost,
  onSubmitChoice,
  rpsResult,
}: CameraRPSProps) {
  const [roundStartAt, setRoundStartAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [timeLeft, setTimeLeft] = useState(GO_MS / 1000);
  const [myChoice, setMyChoice] = useState<Gesture | null>(null);
  const [manualChoice, setManualChoice] = useState<Gesture | null>(null);
  const [liveGesture, setLiveGesture] = useState<Gesture | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [myPlayAgain, setMyPlayAgain] = useState(false);

  const roundNonceRef = useRef(0);
  const activeNonceRef = useRef<number | null>(null);
  const lastBroadcastRef = useRef<{ roundStartAt: number; roundNonce: number } | null>(null);
  const submittedRef = useRef(false);
  const resolvedRef = useRef(false);
  const lastDetectedRef = useRef<Gesture | null>(null);
  const myChoiceRef = useRef<Gesture | null>(null);
  const gameOverCalledRef = useRef(false);
  const playAgainResettingRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const onSubmitChoiceRef = useRef(onSubmitChoice);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
    onSubmitChoiceRef.current = onSubmitChoice;
  });

  useEffect(() => {
    myChoiceRef.current = myChoice;
  });

  const remoteRoundStartAt = gameState.roundStartAt as number | undefined;
  const remoteRoundNonce = gameState.roundNonce as number | undefined;
  const oppPlayAgainRequest = gameState.playAgainRequest === true;

  useEffect(() => {
    if (roundStartAt === null) return;
    const tick = () => {
      const elapsed = Date.now() - roundStartAt;
      setPhase(phaseAt(elapsed));
      setTimeLeft(Math.max(0, Math.ceil((GO_START + GO_MS - elapsed) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [roundStartAt]);

  const resetRoundState = useCallback(() => {
    setMyChoice(null);
    setManualChoice(null);
    setLiveGesture(null);
    setShowResult(false);
    submittedRef.current = false;
    resolvedRef.current = false;
    lastDetectedRef.current = null;
    myChoiceRef.current = null;
    playAgainResettingRef.current = false;
  }, []);

  const startRound = useCallback(() => {
    roundNonceRef.current += 1;
    const nonce = roundNonceRef.current;
    const now = Date.now();
    activeNonceRef.current = nonce;
    lastBroadcastRef.current = { roundStartAt: now, roundNonce: nonce };
    resetRoundState();
    setRoundStartAt(now);
    onStateChangeRef.current({ roundStartAt: now, roundNonce: nonce });
  }, [resetRoundState]);

  // Only the host drives the round clock; the guest follows the host's broadcast.
  // The guest anchors its own timer to Date.now() at adoption so clock skew
  // between peers can never wedge the phases; the host's timestamp is echoed
  // back only so broadcasts carry a consistent round context.
  useEffect(() => {
    if (typeof remoteRoundStartAt !== "number" || typeof remoteRoundNonce !== "number") return;
    if (remoteRoundNonce <= (activeNonceRef.current ?? -1)) return;
    activeNonceRef.current = remoteRoundNonce;
    lastBroadcastRef.current = { roundStartAt: remoteRoundStartAt, roundNonce: remoteRoundNonce };
    resetRoundState();
    setRoundStartAt(Date.now());
  }, [remoteRoundStartAt, remoteRoundNonce, resetRoundState]);

  useEffect(() => {
    if (!isHost) return;
    const t = setTimeout(startRound, 0);
    return () => clearTimeout(t);
  }, [isHost, startRound]);

  const handleDetect = useCallback((g: Gesture | null) => {
    lastDetectedRef.current = g;
    setLiveGesture((prev) => (prev === g ? prev : g));
  }, []);

  const enabled = phase === "go";
  const warmup = phase === "intro" || phase === "ready" || phase === "set";
  const { status: handStatus } = useHandGesture({
    videoRef: localVideoRef,
    enabled,
    warmup,
    onDetect: handleDetect,
  });

  useEffect(() => {
    if (phase !== "capture" || submittedRef.current || resolvedRef.current) return;
    submittedRef.current = true;
    const choice = manualChoice ?? lastDetectedRef.current ?? null;
    setMyChoice(choice);
    myChoiceRef.current = choice;
    const nonce = activeNonceRef.current;
    if (nonce !== null) {
      onSubmitChoiceRef.current({ nonce, choice });
      console.log("[RPS] submitted sign", { nonce, choice });
    }
  }, [phase, manualChoice]);

  const handleChoice = useCallback((g: Gesture) => {
    if (submittedRef.current || resolvedRef.current) return;
    setManualChoice(g);
    setMyChoice(g);
  }, []);

  useEffect(() => {
    if (!rpsResult) return;
    if (rpsResult.nonce !== activeNonceRef.current) return;
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const mine = rpsResult.myChoice;
    const theirs = rpsResult.oppChoice;
    setMyChoice(mine);
    myChoiceRef.current = mine;
    setRounds((prev) => [...prev, { myChoice: mine, oppChoice: theirs, result: rpsResult.result }]);
    setShowResult(true);
    console.log("[RPS] server result applied", rpsResult);
  }, [rpsResult]);

  const myScore = rounds.filter((r) => r.result === "win").length;
  const oppScore = rounds.filter((r) => r.result === "lose").length;
  const matchOver = myScore >= 3 || oppScore >= 3;
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  // Re-announce the current round context every second so a peer that mounted
  // late (or missed a dropped message) can still adopt the round.
  useEffect(() => {
    if (resolvedRef.current || matchOver) return;
    const sync = () => {
      const ctx = lastBroadcastRef.current;
      if (!ctx) return;
      onStateChangeRef.current({ roundStartAt: ctx.roundStartAt, roundNonce: ctx.roundNonce });
    };
    const t = setInterval(sync, 1000);
    return () => clearInterval(t);
  }, [matchOver, showResult]);

  // Failsafe: never leave the game stuck on "Snapping..." — resolve the round
  // as a draw if the server result never arrives.
  useEffect(() => {
    if (phase !== "capture" || resolvedRef.current) return;
    const t = setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setShowResult(true);
      setRounds((prev) => [...prev, { myChoice: myChoiceRef.current, oppChoice: null, result: "draw" }]);
    }, 10000);
    return () => clearTimeout(t);
  }, [phase, showResult]);

  useEffect(() => {
    if (matchOver && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      onGameOver();
    }
  }, [matchOver, onGameOver]);

  const handlePlayAgain = useCallback(() => {
    setMyPlayAgain(true);
    const ctx = lastBroadcastRef.current;
    onStateChangeRef.current({
      roundStartAt: ctx?.roundStartAt ?? Date.now(),
      roundNonce: ctx?.roundNonce ?? 0,
      playAgainRequest: true,
    });
  }, []);

  useEffect(() => {
    if (!myPlayAgain || !oppPlayAgainRequest || playAgainResettingRef.current) return;
    playAgainResettingRef.current = true;
    setRounds([]);
    setMyPlayAgain(false);
    gameOverCalledRef.current = false;
    if (!isHost) return;
    const t = setTimeout(() => startRound(), 0);
    return () => clearTimeout(t);
  }, [myPlayAgain, oppPlayAgainRequest, isHost, startRound]);

  useEffect(() => {
    return () => {
      gameOverCalledRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!showResult || matchOver || !isHost) return;
    const t = setTimeout(() => startRound(), 2000);
    return () => clearTimeout(t);
  }, [showResult, matchOver, isHost, startRound]);

  const highlight = (value: Gesture) => {
    if (myChoice) return myChoice === value;
    return phase === "go" && liveGesture === value;
  };

  const countdown = phase === "go" ? timeLeft : null;
  const boxesVisible = phase === "go" || phase === "capture" || showResult;

  const partnerBoxClass = landscape
    ? "left-0 bottom-0 w-1/2 h-1/2"
    : "left-0 bottom-1/2 w-full h-1/4";

  const localBoxClass = landscape
    ? "right-0 bottom-0 w-1/2 h-1/2"
    : "left-0 bottom-0 w-full h-1/4";

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/70 backdrop-blur-sm rounded-full text-white font-bold text-sm whitespace-nowrap">
        Them: {oppScore} | You: {myScore}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        {!showResult && !matchOver && (
          <>
            {phase === "intro" && (
              <div className="text-xl sm:text-2xl font-bold text-white text-center px-4 drop-shadow-lg">
                First to reach 3 points wins!
              </div>
            )}
            {phase === "ready" && <div className="text-5xl sm:text-6xl font-bold text-white drop-shadow-lg">Ready</div>}
            {phase === "set" && <div className="text-5xl sm:text-6xl font-bold text-white drop-shadow-lg">Set</div>}
            {phase === "go" && (
              <div className="text-5xl sm:text-6xl font-bold text-green-400 drop-shadow-lg">Go!</div>
            )}
            {phase === "capture" && <div className="text-2xl font-bold text-white drop-shadow-lg">Snapping...</div>}
          </>
        )}
      </div>

      {showResult && (
        <div
          className={`absolute top-14 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/70 backdrop-blur-sm rounded-full text-lg sm:text-xl font-bold drop-shadow-lg whitespace-nowrap ${
            lastRound?.result === "win" ? "text-green-400" : lastRound?.result === "lose" ? "text-red-400" : "text-yellow-400"
          }`}
        >
          {lastRound?.result === "win" ? "You Win!" : lastRound?.result === "lose" ? "You Lose!" : "Draw!"}
        </div>
      )}

      {boxesVisible && (
        <div className={`absolute ${partnerBoxClass} bg-black/90 backdrop-blur-xl rounded-xl flex items-center justify-center overflow-hidden`}>
          {showResult && lastRound ? (
            <span className="text-6xl">{lastRound.oppChoice ? choiceEmoji[lastRound.oppChoice] : "⏳"}</span>
          ) : countdown !== null ? (
            <>
              <span className={`text-6xl font-bold ${countdown <= 3 ? "text-red-500" : "text-white"}`}>
                {countdown}
              </span>
              <span className="absolute bottom-1.5 left-0 right-0 text-center text-white/70 text-xs">
                {"opponent's hand hidden"}
              </span>
            </>
          ) : (
            <span className="text-white/40 text-sm animate-pulse">...</span>
          )}
        </div>
      )}

      {boxesVisible && (
        <div className={`absolute ${localBoxClass} border-4 border-zinc-400/90 rounded-xl flex flex-col items-center justify-center gap-2 bg-black/20 pointer-events-none`}>
          {showResult && lastRound ? (
            <span className="text-6xl">{lastRound.myChoice ? choiceEmoji[lastRound.myChoice] : "⏳"}</span>
          ) : phase === "go" ? (
            <>
              <span className="text-white font-bold drop-shadow-lg text-lg">Do a sign</span>
              <div className="flex gap-2 sm:gap-3 pointer-events-auto">
                {GESTURES.map((g) => {
                  const isHighlighted = highlight(g.value);
                  const isLocked = myChoice !== null && myChoice === g.value;
                  return (
                    <button
                      key={g.value}
                      onClick={() => handleChoice(g.value)}
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl backdrop-blur-sm flex flex-col items-center justify-center text-2xl sm:text-3xl transition-all ${
                        isLocked
                          ? "bg-zinc-900/20 dark:bg-white/40 ring-2 ring-green-500 scale-110"
                          : isHighlighted
                            ? "bg-zinc-900/20 dark:bg-white/40 ring-2 ring-white scale-110"
                            : "bg-zinc-200/60 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/20"
                      }`}
                    >
                      <span>{g.emoji}</span>
                      <span className="text-[10px] text-zinc-700 dark:text-white/70">{g.label}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-white/90 drop-shadow min-h-4">
                {handStatus === "loading" && "Loading hand detection..."}
                {handStatus === "ready" && !liveGesture && "Show your hand to auto-detect"}
                {handStatus === "ready" && liveGesture && `Detected ${choiceEmoji[liveGesture]}`}
                {handStatus === "error" && "Tap an emoji instead"}
              </span>
            </>
          ) : (
            <span className="text-white/50 text-sm animate-pulse">...</span>
          )}
        </div>
      )}

      {matchOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/40">
          <span className={`text-8xl ${myScore >= 3 ? "animate-win-emoji" : "animate-lose-emoji"}`}>
            {myScore >= 3 ? "🥳" : "😭"}
          </span>
          {!myPlayAgain && !oppPlayAgainRequest && (
            <div className="flex gap-3 pointer-events-auto">
              <button
                onClick={handlePlayAgain}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg backdrop-blur-sm text-sm font-semibold transition-colors"
              >
                Play Again
              </button>
              <button
                onClick={onGameEnd}
                className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm text-sm font-semibold transition-colors"
              >
                End Game
              </button>
            </div>
          )}
          {myPlayAgain && !oppPlayAgainRequest && (
            <div className="flex flex-col items-center gap-2 pointer-events-auto">
              <div className="text-white/90 text-sm animate-pulse">Waiting for partner...</div>
              <button
                onClick={onGameEnd}
                className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {!myPlayAgain && oppPlayAgainRequest && (
            <div className="flex flex-col items-center gap-2 pointer-events-auto">
              <button
                onClick={handlePlayAgain}
                className="px-5 py-2 bg-green-600/80 hover:bg-green-600 text-white rounded-lg backdrop-blur-sm text-sm font-semibold transition-colors animate-pulse"
              >
                Partner wants a rematch!
              </button>
              <button
                onClick={onGameEnd}
                className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm text-xs transition-colors"
              >
                End Game
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
