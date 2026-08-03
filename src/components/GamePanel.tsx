"use client";

import TicTacToe from "./games/TicTacToe";
import RockPaperScissors from "./games/RockPaperScissors";
import type { GameType } from "@/lib/types";

interface GamePanelProps {
  gameType: GameType;
  isHost: boolean;
  gameState: Record<string, unknown>;
  onLocalState: (state: unknown) => void;
  onGameEnd: () => void;
  onGameOver: () => void;
}

export default function GamePanel({ gameType, isHost, gameState, onLocalState, onGameEnd, onGameOver }: GamePanelProps) {
  if (!gameType) return null;

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-zinc-100 dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-300 dark:border-zinc-700 shrink-0">
        <span className="text-zinc-900 dark:text-white font-medium text-sm">
          🎮 {gameType === "tic-tac-toe" ? "Tic Tac Toe" : "Rock Paper Scissors"}
        </span>
        <button
          onClick={onGameEnd}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg"
          title="Close game"
        >
          ✕
        </button>
      </div>
      <div data-game-area className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-3">
        {gameType === "tic-tac-toe" && (
          <TicTacToe
            isPlayerX={isHost}
            onStateChange={(state) => onLocalState(state)}
            gameState={gameState}
          />
        )}
        {gameType === "rock-paper-scissors" && (
          <RockPaperScissors
            onStateChange={(state) => onLocalState(state)}
            gameState={gameState}
            onGameEnd={onGameEnd}
            onGameOver={onGameOver}
          />
        )}
      </div>
    </div>
  );
}
