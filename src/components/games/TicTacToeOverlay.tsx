"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Point = { x: number; y: number };
type Stroke = Point[];

interface TttCell {
  mark: "X" | "O";
  strokes: Stroke[];
}

interface TicTacToeOverlayProps {
  isPlayerX: boolean;
  onStateChange: (state: Record<string, unknown>) => void;
  gameState: Record<string, unknown>;
  onGameEnd: () => void;
}

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const X_COLOR = "#3b82f6";
const O_COLOR = "#ef4444";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function computeWinner(board: (TttCell | null)[]): "X" | "O" | null {
  for (const [a, b, c] of WINNING_LINES) {
    const m = board[a]?.mark;
    if (m && board[b]?.mark === m && board[c]?.mark === m) {
      return m;
    }
  }
  return null;
}

function isBoardDraw(board: (TttCell | null)[]): boolean {
  return board.every((cell) => cell !== null);
}

function wavyPoints(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const segs = 7;
  const pts: string[] = [`${x1},${y1}`];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const wobble = Math.sin(t * Math.PI * 3) * 0.035;
    pts.push(
      `${(x1 + dx * t + nx * wobble).toFixed(3)},${(y1 + dy * t + ny * wobble).toFixed(3)}`
    );
  }
  pts.push(`${x2},${y2}`);
  return pts.join(" ");
}

const HASH_LINES = [
  wavyPoints(1, 0.12, 1, 2.88),
  wavyPoints(2, 0.12, 2, 2.88),
  wavyPoints(0.12, 1, 2.88, 1),
  wavyPoints(0.12, 2, 2.88, 2),
];

function strokeToPoints(stroke: Stroke): string {
  return stroke.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
}

const colorFor = (mark: "X" | "O") => (mark === "X" ? X_COLOR : O_COLOR);

type RoundResult = "win" | "lose" | "draw";

export default function TicTacToeOverlay({
  isPlayerX,
  onStateChange,
  gameState,
  onGameEnd,
}: TicTacToeOverlayProps) {
  const [myBoard, setMyBoard] = useState<(TttCell | null)[]>(Array(9).fill(null));
  const [round, setRound] = useState(1);
  const [boardPx, setBoardPx] = useState(0);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [bigPadCell, setBigPadCell] = useState<number | null>(null);
  const [bigPadStrokes, setBigPadStrokes] = useState<Stroke[]>([]);
  const [draftCell, setDraftCell] = useState<number | null>(null);
  const [draftStrokes, setDraftStrokes] = useState<Stroke[]>([]);

  const roundRef = useRef(1);
  const overlayRef = useRef<HTMLDivElement>(null);
  const padSvgRef = useRef<SVGSVGElement>(null);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  const drawingRef = useRef(false);
  const activeCellRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const strokeRef = useRef<Stroke>([]);
  const downPosRef = useRef<{ x: number; y: number } | null>(null);
  const draftCellRef = useRef<number | null>(null);

  const padDrawingRef = useRef(false);
  const padRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoardPx(
        Math.max(
          140,
          Math.min(
            Math.floor(el.clientWidth * 0.6),
            Math.floor(el.clientHeight * 0.55),
            640
          )
        )
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const myMark = isPlayerX
    ? round % 2 === 1
      ? "X"
      : "O"
    : round % 2 === 1
      ? "O"
      : "X";
  const opponentBoard = (gameState.board as (TttCell | null)[]) ?? null;
  const opponentRound = (gameState.round as number) ?? 1;

  useEffect(() => {
    if (opponentRound > roundRef.current) {
      const newRound = opponentRound;
      setMyBoard(Array(9).fill(null));
      setRound(newRound);
      roundRef.current = newRound;
      draftCellRef.current = null;
      setDraftCell(null);
      setDraftStrokes([]);
      onStateChangeRef.current({ board: Array(9).fill(null), round: newRound });
    }
  }, [opponentRound]);

  const effectiveBoard = useMemo<(TttCell | null)[]>(() => {
    if (opponentRound !== round) return Array(9).fill(null);
    return myBoard.map((cell, i) => cell || opponentBoard?.[i] || null);
  }, [myBoard, opponentBoard, round, opponentRound]);

  const winner = useMemo(() => computeWinner(effectiveBoard), [effectiveBoard]);
  const draw = useMemo(
    () => !winner && isBoardDraw(effectiveBoard),
    [winner, effectiveBoard]
  );
  const roundOver = winner !== null || draw;

  const roundResult: RoundResult | null = useMemo(() => {
    if (!roundOver) return null;
    if (draw) return "draw";
    return winner === myMark ? "win" : "lose";
  }, [roundOver, winner, myMark, draw]);

  const mergedXCount = effectiveBoard.filter((c) => c?.mark === "X").length;
  const mergedOCount = effectiveBoard.filter((c) => c?.mark === "O").length;
  const isMyTurn =
    !roundOver &&
    (myMark === "X" ? mergedXCount === mergedOCount : mergedXCount === mergedOCount + 1);

  const commitMove = useCallback(
    (index: number, strokes: Stroke[]) => {
      const newBoard = [...myBoard];
      newBoard[index] = { mark: myMark, strokes };
      setMyBoard(newBoard);
      onStateChangeRef.current({ board: newBoard, round });
    },
    [myBoard, myMark, round]
  );

  const pointFromEvent = (
    e: ReactPointerEvent,
    rect: DOMRect
  ): Point => ({
    x: clamp((e.clientX - rect.left) / rect.width, 0.02, 0.98),
    y: clamp((e.clientY - rect.top) / rect.height, 0.02, 0.98),
  });

  const handleCellPointerDown =
    (index: number) => (e: ReactPointerEvent<SVGRectElement>) => {
      if (!isMyTurn || myBoard[index] !== null || roundOver) return;
      if (draftCellRef.current !== null && draftCellRef.current !== index) return;
      if (draftCellRef.current === null) {
        draftCellRef.current = index;
        setDraftCell(index);
        setDraftStrokes([]);
      }
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      activeCellRef.current = index;
      rectRef.current = e.currentTarget.getBoundingClientRect();
      downPosRef.current = { x: e.clientX, y: e.clientY };
      strokeRef.current = [pointFromEvent(e, rectRef.current)];
      setActiveCell(index);
      setActiveStroke(strokeRef.current);
    };

  const handleBoardPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current || !rectRef.current) return;
    const p = pointFromEvent(e, rectRef.current);
    const prev = strokeRef.current[strokeRef.current.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.02) {
      if (strokeRef.current.length < 500) {
        strokeRef.current = [...strokeRef.current, p];
        setActiveStroke(strokeRef.current);
      }
    }
  };

  const handleBoardPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const index = activeCellRef.current;
    const stroke = strokeRef.current;
    const down = downPosRef.current;
    drawingRef.current = false;
    strokeRef.current = [];
    rectRef.current = null;
    activeCellRef.current = null;
    downPosRef.current = null;
    setActiveStroke(null);
    setActiveCell(null);
    if (index === null || !down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (stroke.length <= 1 || dist < 10) {
      if (draftCellRef.current === null && isMyTurn && myBoard[index] === null && !roundOver) {
        setBigPadCell(index);
        setBigPadStrokes([]);
      }
      return;
    }
    draftCellRef.current = index;
    setDraftCell(index);
    setDraftStrokes((prev) => [...prev, stroke]);
  };

  const padPoint = (e: ReactPointerEvent): Point => {
    const rect = padRectRef.current!;
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0.02, 0.98),
      y: clamp((e.clientY - rect.top) / rect.height, 0.02, 0.98),
    };
  };

  const handlePadPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!padSvgRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    padDrawingRef.current = true;
    padRectRef.current = e.currentTarget.getBoundingClientRect();
    setBigPadStrokes((prev) => [...prev, [padPoint(e)]]);
  };

  const handlePadPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!padDrawingRef.current || !padRectRef.current) return;
    const p = padPoint(e);
    setBigPadStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const prevPoint = last[last.length - 1];
      if (prevPoint && Math.hypot(p.x - prevPoint.x, p.y - prevPoint.y) < 0.008) {
        return prev;
      }
      return [...prev.slice(0, -1), [...last, p]];
    });
  };

  const handlePadPointerUp = () => {
    padDrawingRef.current = false;
  };

  const handlePadCancel = useCallback(() => {
    padDrawingRef.current = false;
    setBigPadCell(null);
    setBigPadStrokes([]);
  }, []);

  const handlePadConfirm = useCallback(() => {
    if (bigPadCell === null || bigPadStrokes.length === 0) return;
    commitMove(bigPadCell, bigPadStrokes);
    setBigPadCell(null);
    setBigPadStrokes([]);
  }, [bigPadCell, bigPadStrokes, commitMove]);

  const handlePlayAgain = useCallback(() => {
    const newRound = round + 1;
    setMyBoard(Array(9).fill(null));
    setRound(newRound);
    roundRef.current = newRound;
    draftCellRef.current = null;
    setDraftCell(null);
    setDraftStrokes([]);
    onStateChangeRef.current({ board: Array(9).fill(null), round: newRound });
  }, [round]);

  const handleDraftClear = useCallback(() => {
    setDraftStrokes([]);
  }, []);

  const handleDraftCancel = useCallback(() => {
    drawingRef.current = false;
    strokeRef.current = [];
    draftCellRef.current = null;
    setDraftCell(null);
    setDraftStrokes([]);
    setActiveStroke(null);
    setActiveCell(null);
  }, []);

  const handleDraftConfirm = useCallback(() => {
    const index = draftCellRef.current;
    if (index === null || draftStrokes.length === 0) return;
    commitMove(index, draftStrokes);
    draftCellRef.current = null;
    setDraftCell(null);
    setDraftStrokes([]);
  }, [draftStrokes, commitMove]);

  return (
    <>
      <div
        ref={overlayRef}
        className="absolute inset-0 z-10 pointer-events-none select-none"
      >
        {boardPx > 0 && (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              viewBox="0 0 3 3"
              width={boardPx}
              height={boardPx}
              className="touch-none"
              style={{ touchAction: "none", pointerEvents: "auto" }}
              onPointerMove={handleBoardPointerMove}
              onPointerUp={handleBoardPointerUp}
              onPointerCancel={handleBoardPointerUp}
            >
              {HASH_LINES.map((pts, i) => (
                <polyline
                  key={i}
                  points={pts}
                  fill="none"
                  stroke="white"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.55))" }}
                />
              ))}
              {effectiveBoard.map((cell, i) => {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const mark = cell?.mark;
                const isDraftCell = draftCell === i;
                return (
                  <g key={i} transform={`translate(${col}, ${row})`}>
                    {(activeCell === i || mark || isDraftCell) && (
                      <rect
                        x="0.03"
                        y="0.03"
                        width="0.94"
                        height="0.94"
                        rx="0.07"
                        fill={mark ? colorFor(mark) : colorFor(myMark)}
                        opacity={0.15}
                      />
                    )}
                    <rect
                      x="0"
                      y="0"
                      width="1"
                      height="1"
                      fill="transparent"
                      onPointerDown={mark ? undefined : handleCellPointerDown(i)}
                    />
                    {cell?.strokes.map((stroke, si) => (
                      <polyline
                        key={si}
                        points={strokeToPoints(stroke)}
                        fill="none"
                        stroke={colorFor(cell.mark)}
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
                      />
                    ))}
                    {isDraftCell &&
                      draftStrokes.map((stroke, si) => (
                        <polyline
                          key={si}
                          points={strokeToPoints(stroke)}
                          fill="none"
                          stroke={colorFor(myMark)}
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
                        />
                      ))}
                    {activeCell === i && activeStroke && (
                      <polyline
                        points={strokeToPoints(activeStroke)}
                        fill="none"
                        stroke={colorFor(myMark)}
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[90%]">
          <div
            className={`px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white text-xs sm:text-sm font-semibold text-center shadow-lg ${
              roundResult === "win"
                ? "animate-win-emoji"
                : roundResult === "lose"
                  ? "animate-lose-emoji"
                  : ""
            }`}
          >
            {roundOver
              ? roundResult === "win"
                ? "You Win! 🥳"
                : roundResult === "lose"
                  ? "You Lose! 😭"
                  : "Draw!"
              : isMyTurn
                ? `Your Turn · You are ${myMark}`
                : `Opponent's Turn · You are ${myMark}`}
          </div>
        </div>

        {roundOver && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={handlePlayAgain}
              className="px-4 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full font-medium text-sm shadow-lg transition-colors"
            >
              Play Again
            </button>
          </div>
        )}

        {draftCell !== null && !roundOver && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2">
            <button
              onClick={handleDraftClear}
              className="px-3 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full font-medium text-sm shadow-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleDraftCancel}
              className="px-3 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full font-medium text-sm shadow-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDraftConfirm}
              disabled={draftStrokes.length === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed backdrop-blur-sm text-white rounded-full font-medium text-sm shadow-lg transition-colors"
            >
              Done
            </button>
          </div>
        )}

        <div className="absolute top-3 right-3 pointer-events-auto">
          <button
            onClick={onGameEnd}
            title="Close game"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white text-sm transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {bigPadCell !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-white font-bold text-lg">
                Draw your {myMark}
              </span>
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                  myMark === "X" ? "bg-blue-500" : "bg-red-500"
                }`}
              >
                {myMark}
              </span>
            </div>
            <svg
              ref={padSvgRef}
              viewBox="0 0 1 1"
              className="w-full aspect-square touch-none bg-zinc-900 rounded-2xl"
              style={{ touchAction: "none" }}
              onPointerDown={handlePadPointerDown}
              onPointerMove={handlePadPointerMove}
              onPointerUp={handlePadPointerUp}
              onPointerCancel={handlePadPointerUp}
            >
              {bigPadStrokes.map((stroke, si) => (
                <polyline
                  key={si}
                  points={strokeToPoints(stroke)}
                  fill="none"
                  stroke={colorFor(myMark)}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <div className="flex gap-2">
              <button
                onClick={() => setBigPadStrokes([])}
                className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handlePadCancel}
                className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePadConfirm}
                disabled={bigPadStrokes.length === 0}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
