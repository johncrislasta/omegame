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
  myChoice: Choice;
  oppChoice: Choice;
  result: RoundResult;
}

interface RockPaperScissorsProps {
  onStateChange: (choice: Choice) => void;
  opponentChoice: Choice | null;
  isHost: boolean;
  onGameEnd: () => void;
  onGameOver: () => void;
}

export default function RockPaperScissors({ onStateChange, opponentChoice, onGameEnd, onGameOver }: RockPaperScissorsProps) {
  const [myChoice, setMyChoice] = useState<Choice | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [rounds, setRounds] = useState<Round[]>([]);
  const gameEndCalledRef = useRef(false);
  const gameOverCalledRef = useRef(false);

  const currentRound = rounds.length;
  const isRevealed = myChoice !== null && opponentChoice !== null && currentRound > 0 && rounds[currentRound - 1]?.myChoice === myChoice;
  const isWaitingReveal = myChoice !== null && opponentChoice !== null && !isRevealed;

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (isWaitingReveal && myChoice && opponentChoice) {
      const result = computeWinner(myChoice, opponentChoice);
      const timer = setTimeout(() => {
        setRounds((prev) => [...prev, { myChoice, oppChoice: opponentChoice, result }]);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isWaitingReveal, myChoice, opponentChoice]);

  const myScore = useMemo(() => rounds.filter((r) => r.result === "win").length, [rounds]);
  const oppScore = useMemo(() => rounds.filter((r) => r.result === "lose").length, [rounds]);
  const matchOver = myScore >= 3 || oppScore >= 3;

  useEffect(() => {
    if (matchOver && !gameEndCalledRef.current) {
      gameEndCalledRef.current = true;
      setTimeout(onGameEnd, 2500);
    }
    if (matchOver && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      onGameOver();
    }
  }, [matchOver, onGameEnd, onGameOver]);

  useEffect(() => {
    return () => {
      gameEndCalledRef.current = false;
      gameOverCalledRef.current = false;
    };
  }, []);

  const handleChoice = useCallback(
    (choice: Choice) => {
      setMyChoice(choice);
      onStateChange(choice);
    },
    [onStateChange]
  );

  const handlePlayAgain = useCallback(() => {
    setMyChoice(null);
    setCountdown(3);
  }, []);

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-white text-lg font-bold drop-shadow-lg">
        Round {currentRound + 1} — You: {myScore} | Them: {oppScore}
      </div>

      {!myChoice && countdown > 0 && (
        <div className="text-6xl font-bold text-white animate-pulse drop-shadow-lg">
          {countdown}
        </div>
      )}

      {!myChoice && countdown === 0 && (
        <div className="flex gap-3">
          {choices.map((c) => (
            <button
              key={c.value}
              onClick={() => handleChoice(c.value)}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm
                flex flex-col items-center justify-center text-3xl sm:text-4xl transition-all hover:scale-110"
            >
              <span>{c.emoji}</span>
              <span className="text-xs text-white mt-1">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {isRevealed && myChoice && opponentChoice && lastRound && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-8 items-center">
            <div className="flex flex-col items-center">
              <span className="text-xs text-white/70">You</span>
              <span className="text-5xl">{choiceEmoji[myChoice]}</span>
            </div>
            <span className="text-2xl font-bold text-white">VS</span>
            <div className="flex flex-col items-center">
              <span className="text-xs text-white/70">Them</span>
              <span className="text-5xl">{choiceEmoji[opponentChoice]}</span>
            </div>
          </div>
          <div className={`text-2xl font-bold ${
            lastRound.result === "win" ? "text-green-400" : lastRound.result === "lose" ? "text-red-400" : "text-yellow-400"
          }`}>
            {lastRound.result === "win" ? "You Win!" : lastRound.result === "lose" ? "You Lose!" : "Draw!"}
          </div>
          {!matchOver && (
            <button
              onClick={handlePlayAgain}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm text-sm transition-colors"
            >
              Play Again
            </button>
          )}
          {matchOver && (
            <div className="text-xl font-bold text-white">
              {myScore >= 3 ? "You won the match!" : "You lost the match!"}
            </div>
          )}
        </div>
      )}

      {isWaitingReveal && (
        <div className="text-white/70 text-sm">Revealing...</div>
      )}

      {!myChoice && !isRevealed && !isWaitingReveal && countdown === 0 && (
        <div className="text-white/70 text-sm">Pick your move!</div>
      )}
    </div>
  );
}
