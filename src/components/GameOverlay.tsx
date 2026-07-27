"use client";

import TicTacToe from "./games/TicTacToe";
import RockPaperScissors from "./games/RockPaperScissors";
import type { GameType } from "@/lib/types";

interface GameOverlayProps {
  gameType: GameType;
  isHost: boolean;
  gameState: Record<string, unknown>;
  onLocalState: (state: unknown) => void;
  onGameEnd: () => void;
  onGameOver: () => void;
}

export default function GameOverlay({ gameType, isHost, gameState, onLocalState, onGameEnd, onGameOver }: GameOverlayProps) {
  if (!gameType) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-black/70 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-2xl relative">
        <button
          onClick={onGameEnd}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-sm transition-colors"
        >
          ✕
        </button>
        {gameType === "tic-tac-toe" && (
          <TicTacToe
            isPlayerX={isHost}
            onStateChange={(state) => onLocalState(state)}
            gameState={gameState}
          />
        )}
        {gameType === "rock-paper-scissors" && (
          <RockPaperScissors
            onStateChange={(choice) => onLocalState({ choice })}
            opponentChoice={(gameState.choice as "rock" | "paper" | "scissors") || null}
            isHost={isHost}
            onGameEnd={onGameEnd}
            onGameOver={onGameOver}
          />
        )}
      </div>
    </div>
  );
}
