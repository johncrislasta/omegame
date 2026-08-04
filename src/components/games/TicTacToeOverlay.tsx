"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const X_COLOR = "#3b82f6";
const O_COLOR = "#ef4444";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function computeWinner(board: (TttCell | null)[]): "X" | "O" | null {
  for (const [a, b, c] of WINNING_LINES) {
    const m = board[a]?.mark;
    if (m && board[b]?.mark === m && board[c]?.mark === m) return m;
  }
  return null;
}

function isBoardDraw(board: (TttCell | null)[]): boolean {
  return board.every((cell) => cell !== null);
}

const colorFor = (mark: "X" | "O") => (mark === "X" ? X_COLOR : O_COLOR);

type RoundResult = "win" | "lose" | "draw";

/* ── canvas drawing helpers ────────────────────────────────── */

function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  color: string,
  lw: number,
) {
  if (stroke.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.moveTo(stroke[0].x, stroke[0].y);
  for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
  ctx.stroke();
  ctx.restore();
}

/** Draw the static board (grid + committed strokes + draft strokes) into a target ctx. */
function drawBase(
  ctx: CanvasRenderingContext2D,
  w: number,
  board: (TttCell | null)[],
  myMark: "X" | "O",
  draftCell: number | null,
  draftStrokes: Stroke[],
) {
  ctx.clearRect(0, 0, w, w);

  const pad = w * 0.04;
  const inner = w - pad * 2;
  const cellW = inner / 3;
  const cellH = inner / 3;
  const toX = (col: number) => pad + col * cellW;
  const toY = (row: number) => pad + row * cellH;

  /* cell highlights */
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cell = board[i];
    const isDraft = draftCell === i;
    if (cell || isDraft) {
      const fill = cell ? colorFor(cell.mark) : colorFor(myMark);
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = fill;
      const rx = 6;
      const cx = toX(col) + 4;
      const cy = toY(row) + 4;
      const cw = cellW - 8;
      const ch = cellH - 8;
      ctx.beginPath();
      ctx.moveTo(cx + rx, cy);
      ctx.arcTo(cx + cw, cy, cx + cw, cy + ch, rx);
      ctx.arcTo(cx + cw, cy + ch, cx, cy + ch, rx);
      ctx.arcTo(cx, cy + ch, cx, cy, rx);
      ctx.arcTo(cx, cy, cx + cw, cy, rx);
      ctx.fill();
      ctx.restore();
    }
  }

  /* grid lines */
  ctx.save();
  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(3, w * 0.012);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.moveTo(toX(1), toY(0)); ctx.lineTo(toX(1), toY(3));
  ctx.moveTo(toX(2), toY(0)); ctx.lineTo(toX(2), toY(3));
  ctx.moveTo(toX(0), toY(1)); ctx.lineTo(toX(3), toY(1));
  ctx.moveTo(toX(0), toY(2)); ctx.lineTo(toX(3), toY(2));
  ctx.stroke();
  ctx.restore();

  const strokeLw = Math.max(3, w * 0.015);

  /* committed strokes */
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cell = board[i];
    if (!cell) continue;
    const ox = toX(col);
    const oy = toY(row);
    for (const s of cell.strokes) {
      drawStrokePath(
        ctx,
        s.map((p) => ({ x: ox + p.x * cellW, y: oy + p.y * cellH })),
        colorFor(cell.mark),
        strokeLw,
      );
    }
  }

  /* draft strokes */
  if (draftCell !== null && draftStrokes.length > 0) {
    const col = draftCell % 3;
    const row = Math.floor(draftCell / 3);
    const ox = toX(col);
    const oy = toY(row);
    for (const s of draftStrokes) {
      drawStrokePath(
        ctx,
        s.map((p) => ({ x: ox + p.x * cellW, y: oy + p.y * cellH })),
        colorFor(myMark),
        strokeLw,
      );
    }
  }
}

/* ── component ─────────────────────────────────────────────── */

export default function TicTacToeOverlay({
  isPlayerX,
  onStateChange,
  gameState,
  onGameEnd,
}: TicTacToeOverlayProps) {
  const [myBoard, setMyBoard] = useState<(TttCell | null)[]>(Array(9).fill(null));
  const [round, setRound] = useState(1);
  const [draftCell, setDraftCell] = useState<number | null>(null);
  const [draftStrokes, setDraftStrokes] = useState<Stroke[]>([]);

  const roundRef = useRef(1);
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSizeRef = useRef(0);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  /* mutable refs for the hot path — no React re-renders during drawing */
  const boardRef = useRef<(TttCell | null)[]>(Array(9).fill(null));
  const activeCellRef = useRef<number | null>(null);
  const draftCellRef = useRef<number | null>(null);
  const draftStrokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke>([]);
  const drawingRef = useRef(false);
  const rectRef = useRef<DOMRect | null>(null);
  const downPosRef = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(true);
  const rafRef = useRef(0);

  /* offscreen canvas holding the "base" image (grid + committed + draft strokes).
     During active drawing we blit this + draw only the new segment. */
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const myMark = isPlayerX
    ? round % 2 === 1 ? "X" : "O"
    : round % 2 === 1 ? "O" : "X";
  const opponentBoard = (gameState.board as (TttCell | null)[]) ?? null;
  const opponentRound = (gameState.round as number) ?? 1;

  /* sync board state into ref */
  const effectiveBoard = (() => {
    if (opponentRound !== round) return Array(9).fill(null) as (TttCell | null)[];
    return myBoard.map((cell, i) => cell || opponentBoard?.[i] || null);
  })();

  useEffect(() => {
    boardRef.current = effectiveBoard;
    dirtyRef.current = true;
  }, [effectiveBoard]);

  /* sync draft strokes + draft cell into refs */
  useEffect(() => {
    draftStrokesRef.current = draftStrokes;
    dirtyRef.current = true;
  }, [draftStrokes]);

  useEffect(() => {
    draftCellRef.current = draftCell;
    dirtyRef.current = true;
  }, [draftCell]);

  const winner = computeWinner(effectiveBoard);
  const draw = !winner && isBoardDraw(effectiveBoard);
  const roundOver = winner !== null || draw;

  const roundResult: RoundResult | null = (() => {
    if (!roundOver) return null;
    if (draw) return "draw";
    return winner === myMark ? "win" : "lose";
  })();

  const mergedXCount = effectiveBoard.filter((c) => c?.mark === "X").length;
  const mergedOCount = effectiveBoard.filter((c) => c?.mark === "O").length;
  const isMyTurn =
    !roundOver &&
    (myMark === "X" ? mergedXCount === mergedOCount : mergedXCount === mergedOCount + 1);

  /* size the canvas */
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const size = Math.max(
        140,
        Math.min(
          Math.floor(el.clientWidth * 0.6),
          Math.floor(el.clientHeight * 0.55),
          640,
        ),
      );
      canvasSizeRef.current = size;
      dirtyRef.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* rAF render loop */
  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const canvas = canvasRef.current;
        if (canvas) {
          const size = canvasSizeRef.current;
          if (size > 0) {
            const dpr = window.devicePixelRatio || 1;
            const px = Math.ceil(size * dpr);
            if (canvas.width !== px || canvas.height !== px) {
              canvas.width = px;
              canvas.height = px;
            }
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              /* 1) rebuild the offscreen base when board/draft state changed */
              let base = baseCanvasRef.current;
              if (!base || base.width !== px || base.height !== px) {
                base = document.createElement("canvas");
                base.width = px;
                base.height = px;
                baseCanvasRef.current = base;
              }
              const bCtx = base.getContext("2d")!;
              bCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
              drawBase(bCtx, size, boardRef.current, myMark, draftCellRef.current, draftStrokesRef.current);

              /* 2) blit base onto the visible canvas */
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(base, 0, 0);

              /* 3) draw the active stroke (if any) directly — no full redraw */
              const activeCell = activeCellRef.current;
              const activeStroke = activeStrokeRef.current;
              if (activeCell !== null && activeStroke.length >= 2) {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                const pad = size * 0.04;
                const inner = size - pad * 2;
                const cellW = inner / 3;
                const cellH = inner / 3;
                const col = activeCell % 3;
                const row = Math.floor(activeCell / 3);
                const ox = pad + col * cellW;
                const oy = pad + row * cellH;
                const strokeLw = Math.max(3, size * 0.015);
                drawStrokePath(
                  ctx,
                  activeStroke.map((p) => ({ x: ox + p.x * cellW, y: oy + p.y * cellH })),
                  colorFor(myMark),
                  strokeLw,
                );
              }
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [myMark]);

  /* when opponent round advances, reset */
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

  const commitMove = useCallback(
    (index: number, strokes: Stroke[]) => {
      const newBoard = [...myBoard];
      newBoard[index] = { mark: myMark, strokes };
      setMyBoard(newBoard);
      onStateChangeRef.current({ board: newBoard, round });
    },
    [myBoard, myMark, round],
  );

  const pointFromEvent = (e: ReactPointerEvent, rect: DOMRect): Point => ({
    x: clamp((e.clientX - rect.left) / rect.width, 0.02, 0.98),
    y: clamp((e.clientY - rect.top) / rect.height, 0.02, 0.98),
  });

  /* hit-test: which cell did the pointer land in? */
  const cellFromPoint = (p: Point): number | null => {
    const size = canvasSizeRef.current;
    if (size <= 0) return null;
    const pad = size * 0.04;
    const inner = size - pad * 2;
    const cellW = inner / 3;
    const cellH = inner / 3;
    const px = p.x * size;
    const py = p.y * size;
    const col = Math.floor((px - pad) / cellW);
    const row = Math.floor((py - pad) / cellH);
    if (col < 0 || col > 2 || row < 0 || row > 2) return null;
    return row * 3 + col;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isMyTurn || roundOver) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = pointFromEvent(e, rect);
    const index = cellFromPoint(p);
    if (index === null || myBoard[index] !== null) return;
    if (draftCellRef.current !== null && draftCellRef.current !== index) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    activeCellRef.current = index;
    rectRef.current = rect;
    downPosRef.current = { x: e.clientX, y: e.clientY };
    activeStrokeRef.current = [pointFromEvent(e, rect)];
    dirtyRef.current = true;
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !rectRef.current) return;
    const p = pointFromEvent(e, rectRef.current);
    const stroke = activeStrokeRef.current;
    const prev = stroke[stroke.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.02) {
      if (stroke.length < 500) {
        stroke.push(p);
        dirtyRef.current = true;
      }
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const index = activeCellRef.current;
    const stroke = activeStrokeRef.current;
    const down = downPosRef.current;
    drawingRef.current = false;
    activeStrokeRef.current = [];
    rectRef.current = null;
    activeCellRef.current = null;
    downPosRef.current = null;
    dirtyRef.current = true;
    if (index === null || !down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (stroke.length <= 1 || dist < 10) return;
    draftCellRef.current = index;
    setDraftCell(index);
    setDraftStrokes((prev) => [...prev, stroke]);
  };

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
    activeStrokeRef.current = [];
    draftCellRef.current = null;
    setDraftCell(null);
    setDraftStrokes([]);
    dirtyRef.current = true;
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
        <div className="w-full h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="touch-none"
            style={{ touchAction: "none", pointerEvents: "auto" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>

        {/* turn / result HUD */}
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

        {/* roundOver actions */}
        {roundOver && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2">
            <button
              onClick={onGameEnd}
              className="px-4 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full font-medium text-sm shadow-lg transition-colors"
            >
              Close Game
            </button>
            <button
              onClick={handlePlayAgain}
              className="px-4 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full font-medium text-sm shadow-lg transition-colors"
            >
              Play Again
            </button>
          </div>
        )}

        {/* draft toolbar */}
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

        {/* close button — always visible */}
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
    </>
  );
}
