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

function computeWinner(a: Gesture, b: Gesture): RoundResult {
  if (a === b) return "draw";
  if ((a === "rock" && b === "scissors") || (a === "scissors" && b === "paper") || (a === "paper" && b === "rock")) return "win";
  return "lose";
}

const INTRO_MS = 2000;
const READY_MS = 1000;
const SET_MS = 1000;
const GO_MS = 5000;
const ROUND_MS = INTRO_MS + READY_MS + SET_MS + GO_MS;

type Phase = "intro" | "ready" | "set" | "go" | "capture";

function phaseAt(elapsed: number): Phase {
  if (elapsed < INTRO_MS) return "intro";
  if (elapsed < INTRO_MS + READY_MS) return "ready";
  if (elapsed < INTRO_MS + READY_MS + SET_MS) return "set";
  if (elapsed < ROUND_MS) return "go";
  return "capture";
}

interface CameraRPSProps {
  onStateChange: (state: Record<string, unknown>) => void;
  gameState: Record<string, unknown>;
  onGameOver: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
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
  localVideoRef,
}: CameraRPSProps) {
  const [roundStartAt, setRoundStartAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [timeLeft, setTimeLeft] = useState(GO_MS / 1000);
  const [myChoice, setMyChoice] = useState<Gesture | null>(null);
  const [manualChoice, setManualChoice] = useState<Gesture | null>(null);
  const [liveGesture, setLiveGesture] = useState<Gesture | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [showResult, setShowResult] = useState(false);

  const roundNonceRef = useRef(0);
  const lastBroadcastRef = useRef<{ roundStartAt: number; roundNonce: number } | null>(null);
  const capturedRef = useRef(false);
  const resolvedRef = useRef(false);
  const lastDetectedRef = useRef<Gesture | null>(null);
  const gameOverCalledRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  });

  const remoteRoundStartAt = gameState.roundStartAt as number | undefined;
  const remoteRoundNonce = gameState.roundNonce as number | undefined;
  const remoteChoice = gameState.choice as Gesture | null | undefined;
  const remoteCaptured = gameState.captured === true;

  useEffect(() => {
    if (roundStartAt === null) return;
    const tick = () => {
      const elapsed = Date.now() - roundStartAt;
      setPhase(phaseAt(elapsed));
      setTimeLeft(Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [roundStartAt]);

  const broadcast = useCallback((extra: Record<string, unknown>) => {
    const ctx = lastBroadcastRef.current;
    if (!ctx) return;
    onStateChangeRef.current({ roundStartAt: ctx.roundStartAt, roundNonce: ctx.roundNonce, ...extra });
  }, []);

  const startRound = useCallback(() => {
    roundNonceRef.current += 1;
    const now = Date.now();
    lastBroadcastRef.current = { roundStartAt: now, roundNonce: roundNonceRef.current };
    setRoundStartAt(now);
    setMyChoice(null);
    setManualChoice(null);
    setLiveGesture(null);
    setShowResult(false);
    capturedRef.current = false;
    resolvedRef.current = false;
    lastDetectedRef.current = null;
    onStateChangeRef.current({ roundStartAt: now, roundNonce: roundNonceRef.current, choice: null, captured: false });
  }, []);

  useEffect(() => {
    if (typeof remoteRoundStartAt !== "number" || typeof remoteRoundNonce !== "number") return;
    setRoundStartAt((prev) => {
      const localCtx = lastBroadcastRef.current;
      if (prev === null || !localCtx) return remoteRoundStartAt;
      if (remoteRoundNonce > localCtx.roundNonce) return remoteRoundStartAt;
      if (remoteRoundNonce === localCtx.roundNonce && remoteRoundStartAt > localCtx.roundStartAt) {
        return remoteRoundStartAt;
      }
      return prev;
    });
  }, [remoteRoundStartAt, remoteRoundNonce]);

  useEffect(() => {
    const t = setTimeout(startRound, 0);
    return () => clearTimeout(t);
  }, [startRound]);

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
    if (phase !== "capture" || capturedRef.current || resolvedRef.current) return;
    capturedRef.current = true;
    const choice = manualChoice ?? lastDetectedRef.current ?? null;
    setMyChoice(choice);
    broadcast({ choice, captured: true });
  }, [phase, manualChoice, broadcast]);

  const handleChoice = useCallback((g: Gesture) => {
    if (capturedRef.current || resolvedRef.current) return;
    setManualChoice(g);
    setMyChoice(g);
  }, []);

  useEffect(() => {
    if (!capturedRef.current || !remoteCaptured || resolvedRef.current) return;
    resolvedRef.current = true;
    const mine = myChoice;
    const theirs = remoteChoice ?? null;
    const result = mine && theirs ? computeWinner(mine, theirs) : mine ? "win" : theirs ? "lose" : "draw";
    setRounds((prev) => [...prev, { myChoice: mine, oppChoice: theirs, result }]);
    setShowResult(true);
  }, [capturedRef, remoteCaptured, myChoice, remoteChoice, showResult]);

  const myScore = rounds.filter((r) => r.result === "win").length;
  const oppScore = rounds.filter((r) => r.result === "lose").length;
  const matchOver = myScore >= 3 || oppScore >= 3;
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  useEffect(() => {
    if (matchOver && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      onGameOver();
    }
  }, [matchOver, onGameOver]);

  useEffect(() => {
    return () => {
      gameOverCalledRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!showResult || matchOver) return;
    const t = setTimeout(() => startRound(), 2000);
    return () => clearTimeout(t);
  }, [showResult, matchOver, startRound]);

  const highlight = (value: Gesture) => {
    if (myChoice) return myChoice === value;
    return phase === "go" && liveGesture === value;
  };

  const countdown = phase === "go" ? timeLeft : null;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      <div className="text-zinc-900 dark:text-white text-lg font-bold drop-shadow-lg">
        You: {myScore} | Them: {oppScore}
      </div>

      <div className="w-full h-24 bg-black rounded-xl flex items-center justify-center overflow-hidden relative">
        {showResult && lastRound ? (
          <span className="text-5xl">{lastRound.oppChoice ? choiceEmoji[lastRound.oppChoice] : "⏳"}</span>
        ) : countdown !== null ? (
          <>
            <span className={`text-5xl font-bold ${countdown <= 3 ? "text-red-500" : "text-white"}`}>
              {countdown}
            </span>
            <span className="absolute bottom-1.5 text-white/70 text-xs">{"opponent's hand hidden"}</span>
          </>
        ) : (
          <span className="text-white/40 text-sm animate-pulse">...</span>
        )}
      </div>

      {!showResult && !matchOver && (
        <div className="min-h-8 text-center">
          {phase === "intro" && (
            <div className="text-lg font-bold text-zinc-900 dark:text-white">
              First to reach 3 points wins!
            </div>
          )}
          {phase === "ready" && <div className="text-4xl font-bold text-zinc-900 dark:text-white">Ready</div>}
          {phase === "set" && <div className="text-4xl font-bold text-zinc-900 dark:text-white">Set</div>}
          {phase === "go" && (
            <div className="text-4xl font-bold text-green-500">
              Go! <span className="text-xl text-zinc-900 dark:text-white">Make a sign</span>
            </div>
          )}
          {phase === "capture" && <div className="text-xl font-bold text-zinc-900 dark:text-white">Snapping...</div>}
        </div>
      )}

      {!showResult && !matchOver && (
        <div className="flex gap-3">
          {GESTURES.map((g) => {
            const isHighlighted = highlight(g.value);
            const isLocked = myChoice !== null && myChoice === g.value;
            return (
              <button
                key={g.value}
                onClick={() => handleChoice(g.value)}
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl backdrop-blur-sm flex flex-col items-center justify-center text-3xl sm:text-4xl transition-all ${
                  isLocked
                    ? "bg-zinc-900/20 dark:bg-white/40 ring-2 ring-green-500 scale-110"
                    : isHighlighted
                      ? "bg-zinc-900/20 dark:bg-white/40 ring-2 ring-zinc-400 dark:ring-white scale-110"
                      : "bg-zinc-200/60 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/20"
                }`}
              >
                <span>{g.emoji}</span>
                <span className="text-xs text-zinc-700 dark:text-white/70 mt-1">{g.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {!showResult && !matchOver && phase === "go" && (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 min-h-4">
          {handStatus === "loading" && "Loading hand detection..."}
          {handStatus === "ready" && !liveGesture && "Show your hand in the camera to auto-detect"}
          {handStatus === "ready" && liveGesture && `Detected ${choiceEmoji[liveGesture]}`}
          {handStatus === "error" && "Hand detection unavailable — tap an emoji instead"}
        </div>
      )}

      {showResult && lastRound && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-8 items-center">
            <span className="text-5xl">{lastRound.myChoice ? choiceEmoji[lastRound.myChoice] : "⏳"}</span>
            <span className="text-2xl font-bold text-zinc-900 dark:text-white">VS</span>
            <span className="text-5xl">{lastRound.oppChoice ? choiceEmoji[lastRound.oppChoice] : "⏳"}</span>
          </div>
          <div
            className={`text-2xl font-bold ${
              lastRound.result === "win" ? "text-green-400" : lastRound.result === "lose" ? "text-red-400" : "text-yellow-400"
            }`}
          >
            {lastRound.result === "win" ? "You Win!" : lastRound.result === "lose" ? "You Lose!" : "Draw!"}
          </div>
        </div>
      )}

      {matchOver && (
        <div className="text-4xl">
          <span className={myScore >= 3 ? "animate-win-emoji" : "animate-lose-emoji"}>
            {myScore >= 3 ? "🥳" : "😭"}
          </span>
        </div>
      )}
    </div>
  );
}
