"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

type Choice = "rock" | "paper" | "scissors";
type RoundResult = "win" | "lose" | "draw";

const choices: { label: string; value: Choice; emoji: string }[] = [
  { label: "Rock", value: "rock", emoji: "✊" },
  { label: "Paper", value: "paper", emoji: "✋" },
  { label: "Scissors", value: "scissors", emoji: "✌️" },
];

const choiceEmoji: Record<Choice, string> = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

function computeWinner(a: Choice, b: Choice): RoundResult {
  if (a === b) return "draw";
  if ((a === "rock" && b === "scissors") || (a === "scissors" && b === "paper") || (a === "paper" && b === "rock")) return "win";
  return "lose";
}

interface Round {
  myChoice: Choice | null;
  oppChoice: Choice | null;
  result: RoundResult;
}

interface RockPaperScissorsProps {
  onStateChange: (state: Record<string, unknown>) => void;
  gameState: Record<string, unknown>;
  onGameEnd: () => void;
  onGameOver: () => void;
}

export default function RockPaperScissors({ onStateChange, gameState, onGameEnd, onGameOver }: RockPaperScissorsProps) {
  const [myChoice, setMyChoice] = useState<Choice | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [myPlayAgain, setMyPlayAgain] = useState(false);
  const [roundStartAt, setRoundStartAt] = useState(() => Date.now());
  const [timeLeft, setTimeLeft] = useState(15);
  const gameOverCalledRef = useRef(false);
  const roundResolvedRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const currentRound = rounds.length;
  const opponentChoice = (gameState.choice as Choice) ?? null;
  const oppPlayAgainRequest = gameState.playAgainRequest === true;

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - roundStartAt) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(15 - elapsed)));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [roundStartAt]);

  const isWaitingReveal = myChoice !== null && opponentChoice !== null && !roundResolvedRef.current;

  useEffect(() => {
    if (isWaitingReveal && myChoice && opponentChoice) {
      roundResolvedRef.current = true;
      const result = computeWinner(myChoice, opponentChoice);
      setRounds((prev) => [...prev, { myChoice, oppChoice: opponentChoice, result }]);
    }
  }, [isWaitingReveal, myChoice, opponentChoice]);

  useEffect(() => {
    const remaining = Math.max(0, Math.ceil(15 - (Date.now() - roundStartAt) / 1000));
    if (remaining <= 0 && !roundResolvedRef.current) {
      roundResolvedRef.current = true;
      if (myChoice && opponentChoice) {
        const result = computeWinner(myChoice, opponentChoice);
        setRounds((prev) => [...prev, { myChoice, oppChoice: opponentChoice, result }]);
      } else if (myChoice) {
        setRounds((prev) => [...prev, { myChoice, oppChoice: null, result: "win" }]);
      } else if (opponentChoice) {
        setRounds((prev) => [...prev, { myChoice: null, oppChoice: opponentChoice, result: "lose" }]);
      } else {
        setRounds((prev) => [...prev, { myChoice: null, oppChoice: null, result: "draw" }]);
      }
    }
  }, [roundStartAt, myChoice, opponentChoice]);

  const myScore = useMemo(() => rounds.filter((r) => r.result === "win").length, [rounds]);
  const oppScore = useMemo(() => rounds.filter((r) => r.result === "lose").length, [rounds]);
  const matchOver = myScore >= 3 || oppScore >= 3;
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const showResult = !!lastRound && roundResolvedRef.current;

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

  const resetRound = useCallback(() => {
    setMyChoice(null);
    setMyPlayAgain(false);
    const now = Date.now();
    setRoundStartAt(now);
    roundResolvedRef.current = false;
    onStateChangeRef.current({ choice: null, roundStartAt: now, playAgainRequest: true });
  }, []);

  useEffect(() => {
    if (myPlayAgain && oppPlayAgainRequest) {
      if (matchOver) {
        gameOverCalledRef.current = false;
        setRounds([]);
      }
      resetRound();
    }
  }, [myPlayAgain, oppPlayAgainRequest, resetRound, matchOver]);

  const handleChoice = useCallback(
    (choice: Choice) => {
      if (myChoice || roundResolvedRef.current) return;
      setMyChoice(choice);
      onStateChange({ choice, roundStartAt });
    },
    [myChoice, onStateChange, roundStartAt]
  );

  const handlePlayAgain = useCallback(() => {
    setMyPlayAgain(true);
    onStateChange({ choice: null, playAgainRequest: true });
  }, [onStateChange]);

  return (
    <>
    <div className="flex flex-col items-center gap-3">
      <div className="text-white text-lg font-bold drop-shadow-lg">
        Round {showResult ? currentRound : currentRound + 1} — You: {myScore} | Them: {oppScore}
      </div>

      {!showResult && !matchOver && (
        <div className={`text-3xl font-bold ${timeLeft <= 5 ? "text-red-400" : "text-white"}`}>
          {timeLeft}s
        </div>
      )}

      {!showResult && !matchOver && (
        <div className="flex gap-3">
          {choices.map((c) => {
            const isSelected = myChoice === c.value;
            const isDisabled = !!myChoice || roundResolvedRef.current;
            return (
              <button
                key={c.value}
                onClick={() => handleChoice(c.value)}
                disabled={isDisabled}
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl backdrop-blur-sm
                  flex flex-col items-center justify-center text-3xl sm:text-4xl transition-all
                  ${isSelected
                    ? "bg-white/40 ring-2 ring-white scale-110"
                    : isDisabled
                      ? "bg-white/5 opacity-40"
                      : "bg-white/20 hover:bg-white/30 hover:scale-110 cursor-pointer"
                  }`}
              >
                <span>{c.emoji}</span>
                <span className="text-xs text-white mt-1">{c.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {!showResult && !matchOver && myChoice && timeLeft > 0 && (
        <div className="text-white/70 text-sm animate-pulse">Waiting for opponent...</div>
      )}

      {showResult && lastRound && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-8 items-center">
            <div className="flex flex-col items-center">
              <span className="text-xs text-white/70">You</span>
              <span className="text-5xl">{lastRound.myChoice ? choiceEmoji[lastRound.myChoice] : "⏳"}</span>
            </div>
            <span className="text-2xl font-bold text-white">VS</span>
            <div className="flex flex-col items-center">
              <span className="text-xs text-white/70">Them</span>
              <span className="text-5xl">{lastRound.oppChoice ? choiceEmoji[lastRound.oppChoice] : "⏳"}</span>
            </div>
          </div>
          <div className={`text-2xl font-bold ${
            lastRound.result === "win" ? "text-green-400" : lastRound.result === "lose" ? "text-red-400" : "text-yellow-400"
          }`}>
            {lastRound.result === "win" ? "You Win!" : lastRound.result === "lose" ? "You Lose!" : "Draw!"}
          </div>
          {!matchOver && (
            <>
              {!myPlayAgain && !oppPlayAgainRequest && (
                <button
                  onClick={handlePlayAgain}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm text-sm transition-colors"
                >
                  Ready
                </button>
              )}
              {myPlayAgain && !oppPlayAgainRequest && (
                <div className="text-white/70 text-sm animate-pulse">Waiting for partner...</div>
              )}
              {!myPlayAgain && oppPlayAgainRequest && (
                <button
                  onClick={handlePlayAgain}
                  className="px-4 py-2 bg-green-600/80 hover:bg-green-600 text-white rounded-lg backdrop-blur-sm text-sm transition-colors animate-pulse"
                >
                  Partner is ready!
                </button>
              )}
            </>
          )}
          {matchOver && (
            <>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                <span className={myScore >= 3 ? "animate-win-emoji" : "animate-lose-emoji"}>
                  {myScore >= 3 ? "🥳" : "😭"}
                </span>
                {myScore >= 3 ? "You won the match!" : "You lost the match!"}
              </div>
              {!myPlayAgain && !oppPlayAgainRequest && (
                <button
                  onClick={handlePlayAgain}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm text-sm transition-colors"
                >
                  Play Again
                </button>
              )}
              {myPlayAgain && !oppPlayAgainRequest && (
                <div className="text-white/70 text-sm animate-pulse">Waiting for partner...</div>
              )}
              {!myPlayAgain && oppPlayAgainRequest && (
                <button
                  onClick={handlePlayAgain}
                  className="px-4 py-2 bg-green-600/80 hover:bg-green-600 text-white rounded-lg backdrop-blur-sm text-sm transition-colors animate-pulse"
                >
                  Partner wants a rematch!
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}
