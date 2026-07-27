"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

interface TicTacToeProps {
  isPlayerX: boolean;
  onStateChange: (state: Record<string, unknown>) => void;
  gameState: Record<string, unknown>;
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

type RoundResult = "win" | "lose" | "draw";

export default function TicTacToe({ isPlayerX, onStateChange, gameState }: TicTacToeProps) {
  const [myBoard, setMyBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [round, setRound] = useState(1);
  const roundRef = useRef(1);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const myMark = isPlayerX
    ? (round % 2 === 1 ? "X" : "O")
    : (round % 2 === 1 ? "O" : "X");
  const opponentBoard = (gameState.board as (string | null)[]) ?? null;
  const opponentRound = (gameState.round as number) ?? 1;

  useEffect(() => {
    if (opponentRound > roundRef.current) {
      const newRound = opponentRound;
      setMyBoard(Array(9).fill(null));
      setRound(newRound);
      roundRef.current = newRound;
      onStateChangeRef.current({ board: Array(9).fill(null), round: newRound });
    }
  }, [opponentRound]);

  const effectiveBoard = useMemo(() => {
    if (opponentRound !== round) return Array(9).fill(null);
    return myBoard.map((cell, i) => cell || opponentBoard?.[i] || null);
  }, [myBoard, opponentBoard, round, opponentRound]);

  const winner = useMemo(() => computeWinner(effectiveBoard), [effectiveBoard]);
  const draw = useMemo(() => !winner && isBoardDraw(effectiveBoard), [winner, effectiveBoard]);
  const roundOver = winner !== null || draw;

  const roundResult: RoundResult | null = useMemo(() => {
    if (!roundOver) return null;
    if (draw) return "draw";
    return winner === myMark ? "win" : "lose";
  }, [roundOver, winner, myMark, draw]);

  const mergedXCount = effectiveBoard.filter((c) => c === "X").length;
  const mergedOCount = effectiveBoard.filter((c) => c === "O").length;
  const isMyTurn = !roundOver && (
    myMark === "X" ? mergedXCount === mergedOCount
                    : mergedXCount === mergedOCount + 1
  );

  const handleCellClick = useCallback(
    (index: number) => {
      if (!isMyTurn || myBoard[index] !== null || roundOver) return;
      const newBoard = [...myBoard];
      newBoard[index] = myMark;
      setMyBoard(newBoard);
      onStateChange({ board: newBoard, round });
    },
    [myBoard, isMyTurn, myMark, roundOver, onStateChange, round]
  );

  const handlePlayAgain = useCallback(() => {
    const newRound = round + 1;
    setMyBoard(Array(9).fill(null));
    setRound(newRound);
    roundRef.current = newRound;
    onStateChange({ board: Array(9).fill(null), round: newRound });
  }, [round, onStateChange]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-white text-lg font-bold drop-shadow-lg">
        {roundOver
          ? roundResult === "win"
            ? "You Win!"
            : roundResult === "lose"
            ? "You Lose!"
            : "Draw!"
          : isMyTurn
          ? "Your Turn"
          : "Opponent's Turn"}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {effectiveBoard.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleCellClick(i)}
            disabled={!isMyTurn || cell !== null || roundOver}
            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-lg text-3xl sm:text-4xl font-bold flex items-center justify-center
              ${cell === "X" ? "bg-blue-500/80 text-white" : cell === "O" ? "bg-red-500/80 text-white" : "bg-white/20 hover:bg-white/30 text-white"}
              ${isMyTurn && !cell && !roundOver ? "cursor-pointer active:scale-95" : "cursor-default"}
              transition-all duration-150 backdrop-blur-sm`}
          >
            {cell}
          </button>
        ))}
      </div>

      {roundOver && (
        <button
          onClick={handlePlayAgain}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm text-sm transition-colors"
        >
          Play Again
        </button>
      )}

      {!roundOver && (
        <div className="text-white/70 text-sm">
          You are: <span className={`font-bold ${myMark === "X" ? "text-blue-400" : "text-red-400"}`}>{myMark}</span>
        </div>
      )}
    </div>
  );
}
