"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

interface TicTacToeProps {
  isPlayerX: boolean;
  onStateChange: (state: (string | null)[]) => void;
  opponentState: (string | null)[] | null;
  onGameEnd: () => void;
  onGameOver: () => void;
}

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function computeWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardDraw(board: (string | null)[]): boolean {
  return board.every((cell) => cell !== null);
}

export default function TicTacToe({ isPlayerX, onStateChange, opponentState, onGameEnd, onGameOver }: TicTacToeProps) {
  const [myBoard, setMyBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const gameEndCalledRef = useRef(false);
  const gameOverCalledRef = useRef(false);

  const myMark = isPlayerX ? "X" : "O";

  const mergedBoard = useMemo(
    () => myBoard.map((cell, i) => cell || opponentState?.[i] || null),
    [myBoard, opponentState]
  );

  const winner = useMemo(() => computeWinner(mergedBoard), [mergedBoard]);
  const draw = useMemo(() => !winner && isBoardDraw(mergedBoard), [winner, mergedBoard]);
  const gameOver = winner !== null || draw;

  const mergedXCount = mergedBoard.filter((c) => c === "X").length;
  const mergedOCount = mergedBoard.filter((c) => c === "O").length;
  const isMyTurn = !gameOver && (
    isPlayerX ? mergedXCount === mergedOCount
              : mergedXCount === mergedOCount + 1
  );

  useEffect(() => {
    if (gameOver && !gameEndCalledRef.current) {
      gameEndCalledRef.current = true;
      setTimeout(onGameEnd, 2500);
    }
    if (gameOver && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      onGameOver();
    }
  }, [gameOver, onGameEnd, onGameOver]);

  useEffect(() => {
    return () => {
      gameEndCalledRef.current = false;
      gameOverCalledRef.current = false;
    };
  }, []);

  const handleCellClick = useCallback(
    (index: number) => {
      if (!isMyTurn || myBoard[index] !== null || gameOver) return;

      const newBoard = [...myBoard];
      newBoard[index] = myMark;
      setMyBoard(newBoard);
      onStateChange(newBoard);
    },
    [myBoard, isMyTurn, myMark, gameOver, onStateChange]
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-white text-lg font-bold drop-shadow-lg">
        {winner
          ? winner === myMark
            ? "You Win! 🎉"
            : "You Lose!"
          : draw
          ? "Draw!"
          : isMyTurn
          ? "Your Turn"
          : "Opponent's Turn"}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {mergedBoard.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleCellClick(i)}
            disabled={!isMyTurn || cell !== null || gameOver}
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg text-2xl sm:text-3xl font-bold flex items-center justify-center
              ${cell === "X" ? "bg-blue-500/80 text-white" : cell === "O" ? "bg-red-500/80 text-white" : "bg-white/20 hover:bg-white/30 text-white"}
              ${isMyTurn && !cell && !gameOver ? "cursor-pointer active:scale-95" : "cursor-default"}
              transition-all duration-150 backdrop-blur-sm`}
          >
            {cell}
          </button>
        ))}
      </div>
      <div className="text-white/70 text-sm">
        You are: <span className={`font-bold ${myMark === "X" ? "text-blue-400" : "text-red-400"}`}>{myMark}</span>
      </div>
    </div>
  );
}
