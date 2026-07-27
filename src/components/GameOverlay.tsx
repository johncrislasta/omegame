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
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30">
      <div className="bg-black/70 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-2xl">
        {gameType === "tic-tac-toe" && (
          <TicTacToe
            isPlayerX={isHost}
            onStateChange={(board) => onLocalState({ board })}
            opponentState={gameState.board as (string | null)[] | null}
            onGameEnd={onGameEnd}
            onGameOver={onGameOver}
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
