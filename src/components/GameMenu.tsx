"use client";

import { useState } from "react";

interface GameMenuProps {
  onSelectGame: (game: "tic-tac-toe" | "rock-paper-scissors") => void;
}

const games = [
  {
    id: "tic-tac-toe" as const,
    name: "Tic Tac Toe",
    emoji: "❌⭕",
    description: "Classic noughts and crosses",
  },
  {
    id: "rock-paper-scissors" as const,
    name: "Rock Paper Scissors",
    emoji: "✊✋✌️",
    description: "Best of 5 rounds",
  },
];

export default function GameMenu({ onSelectGame }: GameMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        <span>🎮</span> Play Game
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Choose a Game</h2>
            <div className="space-y-3">
              {games.map((game) => (
                <button
                  key={game.id}
                  onClick={() => {
                    onSelectGame(game.id);
                    setIsOpen(false);
                  }}
                  className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left transition-colors flex items-center gap-4"
                >
                  <span className="text-3xl">{game.emoji}</span>
                  <div>
                    <div className="text-white font-semibold">{game.name}</div>
                    <div className="text-zinc-400 text-sm">{game.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
