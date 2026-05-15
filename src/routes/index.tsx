import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "MindsWeeper — Train your probabilistic mind" },
      {
        name: "description",
        content:
          "MindsWeeper is a premium minesweeper experience designed as a probabilistic thinking trainer.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap",
      },
    ],
  }),
});

type Difficulty = {
  key: string;
  label: string;
  cols: number;
  rows: number;
  mines: number;
  par: number;
};

const DIFFICULTIES: Difficulty[] = [
  { key: "beginner", label: "Beginner", cols: 9, rows: 9, mines: 10, par: 90 },
  { key: "intermediate", label: "Intermediate", cols: 16, rows: 16, mines: 40, par: 200 },
  { key: "expert", label: "Expert", cols: 30, rows: 16, mines: 99, par: 600 },
];

const NUMBER_COLORS: Record<number, string> = {
  1: "#22d3ee",
  2: "#00ff88",
  3: "#ff3355",
  4: "#a855f7",
  5: "#fb923c",
  6: "#06b6d4",
  7: "#f5f5f5",
  8: "#9ca3af",
};

type CellMark = "none" | "flag" | "question";
type GameStatus = "idle" | "playing" | "won" | "lost";

type Cell = {
  mine: boolean;
  adj: number;
  revealed: boolean;
  mark: CellMark;
  exploded?: boolean;
};

type Board = Cell[][];

function makeEmptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      adj: 0,
      revealed: false,
      mark: "none" as CellMark,
    })),
  );
}

function placeMines(board: Board, rows: number, cols: number, mines: number, safeR: number, safeC: number) {
  const total = rows * cols;
  const indices = Array.from({ length: total }, (_, i) => i);
  // Exclude safe cell + neighbors (3x3) so first click opens an area
  const safeSet = new Set<number>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeR + dr;
      const c = safeC + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) safeSet.add(r * cols + c);
    }
  }
  const pool = indices.filter((i) => !safeSet.has(i));
  // Fisher-Yates partial shuffle
  const m = Math.min(mines, pool.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < m; i++) {
    const idx = pool[i];
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    board[r][c].mine = true;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) n++;
        }
      }
      board[r][c].adj = n;
    }
  }
}

function floodReveal(board: Board, rows: number, cols: number, sr: number, sc: number) {
  const queue: [number, number][] = [[sr, sc]];
  while (queue.length) {
    const [r, c] = queue.shift()!;
    const cell = board[r][c];
    if (cell.revealed || cell.mark === "flag") continue;
    cell.revealed = true;
    if (cell.adj === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const n = board[nr][nc];
            if (!n.revealed && !n.mine && n.mark !== "flag") queue.push([nr, nc]);
            else if (!n.revealed && !n.mine && n.mark === "question") {
              // questions don't block reveal
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }
}

function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((c) => ({ ...c })));
}

function computeScore(opts: {
  won: boolean;
  time: number;
  par: number;
  flagsRemoved: number;
  correctFlags: number;
  totalMines: number;
}) {
  let score = 50;
  const { won, time, par, flagsRemoved, correctFlags, totalMines } = opts;
  if (won && time < par) score += 20;
  if (flagsRemoved === 0) score += 20;
  if (correctFlags / totalMines >= 0.8) score += 10;
  score -= flagsRemoved * 5;
  if (!won) score -= 10;
  score = Math.max(0, Math.min(100, score));
  let grade: "S" | "A" | "B" | "C" | "D";
  if (score >= 90) grade = "S";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 60) grade = "C";
  else grade = "D";
  const feedback: Record<typeof grade, string> = {
    S: "Calibrated. Your priors are sharp.",
    A: "Strong inference under uncertainty.",
    B: "Solid reasoning. Trust the math more.",
    C: "Decent — but flag indecision is costing you.",
    D: "Update faster. Estimate before you act.",
  };
  const gradeColor: Record<typeof grade, string> = {
    S: "#00ff88",
    A: "#22d3ee",
    B: "#a855f7",
    C: "#fb923c",
    D: "#ff3355",
  };
  return { score, grade, feedback: feedback[grade], color: gradeColor[grade] };
}

function CellView({
  cell,
  onLeft,
  onRight,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
}: {
  cell: Cell;
  onLeft: () => void;
  onRight: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}) {
  const base =
    "flex items-center justify-center font-mono font-bold select-none transition-all duration-100 border";

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    onRight();
  };
  const handleClick = () => onLeft();

  if (!cell.revealed) {
    const isFlag = cell.mark === "flag";
    const isQuestion = cell.mark === "question";
    return (
      <div
        className={base}
        onClick={handleClick}
        onContextMenu={handleContext}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{
          width: "var(--cell)",
          height: "var(--cell)",
          background: "#1a1a2e",
          borderColor: isFlag
            ? "rgba(255,51,85,0.3)"
            : isQuestion
              ? "rgba(168,85,247,0.3)"
              : "rgba(0,255,136,0.08)",
          color: isFlag ? "#ff3355" : isQuestion ? "#a855f7" : "transparent",
          fontSize: "calc(var(--cell) * 0.5)",
          textShadow: isFlag
            ? "0 0 6px rgba(255,51,85,0.7)"
            : isQuestion
              ? "0 0 6px rgba(168,85,247,0.7)"
              : undefined,
          cursor: "pointer",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 0 12px rgba(0,255,136,0.35), inset 0 0 0 1px rgba(0,255,136,0.4)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "inset 0 0 0 1px rgba(255,255,255,0.02)";
        }}
      >
        {isFlag ? "⚑" : isQuestion ? "?" : ""}
      </div>
    );
  }

  if (cell.mine) {
    return (
      <div
        className={base}
        style={{
          width: "var(--cell)",
          height: "var(--cell)",
          background: cell.exploded ? "#3a0a14" : "#2a0a14",
          borderColor: "rgba(255,51,85,0.5)",
          color: "#ff3355",
          fontSize: "calc(var(--cell) * 0.55)",
          textShadow: "0 0 10px rgba(255,51,85,0.9)",
          animation: cell.exploded ? "mw-pulse 0.8s ease-out infinite" : undefined,
        }}
      >
        ✸
      </div>
    );
  }

  return (
    <div
      className={base}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: "var(--cell)",
        height: "var(--cell)",
        background: "#16213e",
        borderColor: "rgba(255,255,255,0.04)",
        color: cell.adj ? NUMBER_COLORS[cell.adj] : "transparent",
        fontSize: "calc(var(--cell) * 0.55)",
        textShadow: cell.adj ? `0 0 8px ${NUMBER_COLORS[cell.adj]}80` : undefined,
      }}
    >
      {cell.adj || ""}
    </div>
  );
}

function BoardView({
  board,
  difficulty,
  onLeft,
  onRight,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
}: {
  board: Board;
  difficulty: Difficulty;
  onLeft: (r: number, c: number) => void;
  onRight: (r: number, c: number) => void;
  onTouchStart: (r: number, c: number) => void;
  onTouchEnd: (r: number, c: number) => void;
  onTouchCancel: () => void;
}) {
  return (
    <div
      className="inline-block p-3 rounded-lg"
      style={{
        background: "#0d0d18",
        border: "1px solid rgba(0,255,136,0.12)",
        boxShadow: "0 0 40px rgba(0,255,136,0.08), inset 0 0 30px rgba(0,255,136,0.03)",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: `repeat(${difficulty.cols}, var(--cell))`,
          gridTemplateRows: `repeat(${difficulty.rows}, var(--cell))`,
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => (
            <CellView
              key={`${r}-${c}`}
              cell={cell}
              onLeft={() => onLeft(r, c)}
              onRight={() => onRight(r, c)}
              onTouchStart={() => onTouchStart(r, c)}
              onTouchEnd={() => onTouchEnd(r, c)}
              onTouchCancel={onTouchCancel}
            />
          )),
        )}
      </div>
    </div>
  );
}

function Index() {
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [board, setBoard] = useState<Board>(() => makeEmptyBoard(DIFFICULTIES[0].rows, DIFFICULTIES[0].cols));
  const [status, setStatus] = useState<GameStatus>("idle");
  const [time, setTime] = useState(0);
  const [flagsRemovedCount, setFlagsRemovedCount] = useState(0);
  const [bestTimes, setBestTimes] = useState<Record<string, number>>({});
  const [lastScore, setLastScore] = useState<ReturnType<typeof computeScore> | null>(null);

  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Load best times
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mindsweeper:bestTimes");
      if (raw) setBestTimes(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Timer
  useEffect(() => {
    if (status === "playing") {
      timerRef.current = window.setInterval(() => {
        setTime((t) => Math.min(999, t + 1));
      }, 1000);
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [status]);

  const reset = useCallback(
    (d: Difficulty = difficulty) => {
      setBoard(makeEmptyBoard(d.rows, d.cols));
      setStatus("idle");
      setTime(0);
      setFlagsRemovedCount(0);
      setLastScore(null);
    },
    [difficulty],
  );

  const changeDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    setBoard(makeEmptyBoard(d.rows, d.cols));
    setStatus("idle");
    setTime(0);
    setFlagsRemovedCount(0);
    setLastScore(null);
  };

  // Reset on R key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r") reset();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [reset]);

  const flagCount = useMemo(() => {
    let n = 0;
    for (const row of board) for (const c of row) if (c.mark === "flag") n++;
    return n;
  }, [board]);

  const checkWin = (b: Board): boolean => {
    for (const row of b) {
      for (const c of row) {
        if (!c.mine && !c.revealed) return false;
      }
    }
    return true;
  };

  const finalize = (b: Board, won: boolean, removed: number) => {
    const totalMines = difficulty.mines;
    let correctFlags = 0;
    for (const row of b) {
      for (const c of row) {
        if (c.mark === "flag" && c.mine) correctFlags++;
      }
    }
    const result = computeScore({
      won,
      time,
      par: difficulty.par,
      flagsRemoved: removed,
      correctFlags,
      totalMines,
    });
    setLastScore(result);
    try {
      const scoresRaw = localStorage.getItem("mindsweeper:scores");
      const scores = scoresRaw ? JSON.parse(scoresRaw) : [];
      scores.push({
        difficulty: difficulty.key,
        won,
        time,
        score: result.score,
        grade: result.grade,
        ts: Date.now(),
      });
      localStorage.setItem("mindsweeper:scores", JSON.stringify(scores.slice(-100)));
      if (won) {
        const prev = bestTimes[difficulty.key];
        if (!prev || time < prev) {
          const next = { ...bestTimes, [difficulty.key]: time };
          setBestTimes(next);
          localStorage.setItem("mindsweeper:bestTimes", JSON.stringify(next));
        }
      }
    } catch {
      // ignore
    }
  };

  const handleLeft = (r: number, c: number) => {
    if (status === "won" || status === "lost") return;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      const cell = next[r][c];
      if (cell.revealed || cell.mark === "flag") return prev;

      let currentStatus = status;
      if (currentStatus === "idle") {
        placeMines(next, difficulty.rows, difficulty.cols, difficulty.mines, r, c);
        currentStatus = "playing";
        setStatus("playing");
      }

      if (cell.mine) {
        // Lose
        for (const row of next) {
          for (const cc of row) {
            if (cc.mine) cc.revealed = true;
          }
        }
        next[r][c].exploded = true;
        setStatus("lost");
        finalize(next, false, flagsRemovedCount);
        return next;
      }

      floodReveal(next, difficulty.rows, difficulty.cols, r, c);

      if (checkWin(next)) {
        // auto-flag remaining mines visually
        for (const row of next) {
          for (const cc of row) {
            if (cc.mine && cc.mark !== "flag") cc.mark = "flag";
          }
        }
        setStatus("won");
        finalize(next, true, flagsRemovedCount);
      }
      return next;
    });
  };

  const handleRight = (r: number, c: number) => {
    if (status === "won" || status === "lost") return;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      const cell = next[r][c];
      if (cell.revealed) return prev;
      let removed = false;
      if (cell.mark === "none") cell.mark = "flag";
      else if (cell.mark === "flag") {
        cell.mark = "question";
        removed = true;
      } else cell.mark = "none";
      if (removed) setFlagsRemovedCount((n) => n + 1);
      return next;
    });
  };

  const handleTouchStart = (r: number, c: number) => {
    longPressFired.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      handleRight(r, c);
    }, 500);
  };
  const handleTouchEnd = (r: number, c: number) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressFired.current) {
      // Prevent the synthetic click from firing reveal
      // by relying on browser; click still may fire — guard:
      longPressFired.current = false;
      // no-op, the click handler will still fire on some browsers; cell already flagged.
      // To prevent reveal-after-flag, we can no-op by checking mark in handleLeft (flag blocks).
      void r;
      void c;
    }
  };
  const handleTouchCancel = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const minesRemaining = difficulty.mines - flagCount;
  // ─── Resonance Engine ───
type EchoValue = string | null;

const computeResonance = (board: Board, rows: number, cols: number): EchoValue[][] => {
  const echoes: EchoValue[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  
  const getNeighbors = (r: number, c: number) => {
    const res: { r: number; c: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) res.push({ r: nr, c: nc });
      }
    }
    return res;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.revealed || cell.mark === "flag") continue;

      const revealedNeighbors = getNeighbors(r, c).filter(
        (n) => board[n.r][n.c].revealed && board[n.r][n.c].adj > 0
      );
      if (revealedNeighbors.length < 2) continue;

      const constraints: { min: number; max: number }[] = [];

      for (const n of revealedNeighbors) {
        const nCell = board[n.r][n.c];
        const nNeighbors = getNeighbors(n.r, n.c);
        const flaggedAround = nNeighbors.filter((x) => board[x.r][x.c].mark === "flag").length;
        const hiddenAround = nNeighbors.filter(
          (x) => !board[x.r][x.c].revealed && board[x.r][x.c].mark !== "flag"
        );
        const remaining = nCell.adj - flaggedAround;
        if (hiddenAround.length === 0) continue;

        const isThisCellHiddenNeighbor = nNeighbors.some((x) => x.r === r && x.c === c);
        if (!isThisCellHiddenNeighbor) continue;

        const minContrib = Math.max(0, remaining - (hiddenAround.length - 1));
        const maxContrib = Math.min(1, remaining);
        constraints.push({ min: minContrib, max: maxContrib });
      }

      if (constraints.length < 2) continue;

      const overallMin = Math.max(...constraints.map((x) => x.min));
      const overallMax = Math.min(...constraints.map((x) => x.max));

      if (overallMin === overallMax) {
        if (overallMax === 1) echoes[r][c] = "💣";
        else if (overallMax === 0) echoes[r][c] = "0";
        else echoes[r][c] = String(overallMax);
      }
    }
  }
  return echoes;
};

const [resonanceEnabled, setResonanceEnabled] = useState(() => {
  try {
    return localStorage.getItem("mindsweeper:resonance") !== "false";
  } catch {
    return true;
  }
});

const toggleResonance = () => {
  setResonanceEnabled((prev) => {
    const next = !prev;
    try {
      localStorage.setItem("mindsweeper:resonance", String(next));
    } catch {}
    return next;
  });
};

const echoes = useMemo(() => {
  if (!resonanceEnabled) return null;
  return computeResonance(board, difficulty.rows, difficulty.cols);
}, [board, difficulty, resonanceEnabled]);
  const face = status === "won" ? "😎" : status === "lost" ? "💀" : status === "playing" ? "😐" : "🙂";

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "radial-gradient(ellipse at top, #11111c 0%, #0a0a0f 60%)",
        color: "#e6e6f0",
        fontFamily: "'Inter', system-ui, sans-serif",
        ["--cell" as string]: "32px",
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          [data-mw-root] { --cell: 26px !important; }
        }
        @keyframes mw-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,51,85,0.7), inset 0 0 12px rgba(255,51,85,0.4); }
          50% { box-shadow: 0 0 14px 2px rgba(255,51,85,0.9), inset 0 0 18px rgba(255,51,85,0.6); }
        }
        @keyframes mw-fade { from { opacity: 0; transform: translateY(8px);} to {opacity:1; transform:none;} }
      `}</style>

      <div data-mw-root className="max-w-[1400px] mx-auto px-6 py-8" style={{ ["--cell" as string]: "32px" }}>
        {/* Header */}
        <header className="flex items-center justify-between flex-wrap gap-4 mb-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center font-mono font-bold text-xl"
              style={{
                background: "linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)",
                color: "#0a0a0f",
                boxShadow: "0 0 20px rgba(0,255,136,0.4)",
              }}
            >
              M
            </div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "'Space Mono', monospace", color: "#fff" }}
            >
              Minds<span style={{ color: "#00ff88" }}>Weeper</span>
            </h1>
          </div>
          <p className="text-sm tracking-wider uppercase" style={{ color: "#6b7280", letterSpacing: "0.15em" }}>
            Train your probabilistic mind
          </p>
        </header>

        {/* Difficulty selector */}
        <div className="flex flex-wrap gap-3 mb-8 justify-center">
          {DIFFICULTIES.map((d) => {
            const isActive = d.key === difficulty.key;
            const best = bestTimes[d.key];
            return (
              <button
                key={d.key}
                onClick={() => changeDifficulty(d)}
                className="px-5 py-2.5 rounded-md font-mono text-sm transition-all duration-200"
                style={{
                  fontFamily: "'Space Mono', monospace",
                  background: isActive ? "rgba(0,255,136,0.1)" : "#13131f",
                  color: isActive ? "#00ff88" : "#9ca3af",
                  border: `1px solid ${isActive ? "rgba(0,255,136,0.5)" : "rgba(255,255,255,0.06)"}`,
                  boxShadow: isActive
                    ? "0 0 20px rgba(0,255,136,0.25), inset 0 0 10px rgba(0,255,136,0.05)"
                    : "none",
                  cursor: "pointer",
                }}
              >
                <div className="font-bold">{d.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">
                  {d.cols}×{d.rows} · {d.mines} mines{best ? ` · best ${String(best).padStart(3, "0")}` : ""}
                </div>
              </button>
            );
          })}
        </div>

        {/* Game panel */}
        <div className="flex flex-col items-center gap-6 relative">
          {/* Status bar */}
          <div
            className="flex items-center justify-between w-full max-w-md px-5 py-3 rounded-md"
            style={{
              background: "#13131f",
              border: "1px solid rgba(0,255,136,0.12)",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: "#ff3355", fontSize: "14px" }}>✸</span>
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: "#ff3355", textShadow: "0 0 10px rgba(255,51,85,0.5)" }}
              >
                {minesRemaining < 0
                  ? `-${String(Math.abs(minesRemaining)).padStart(2, "0")}`
                  : String(minesRemaining).padStart(3, "0")}
              </span>
            </div>

            <button
              onClick={() => reset()}
              className="w-12 h-12 rounded-md flex items-center justify-center text-2xl transition-transform hover:scale-110"
              style={{
                background: "#1a1a2e",
                border: "1px solid rgba(0,255,136,0.25)",
                boxShadow: "0 0 15px rgba(0,255,136,0.15)",
                cursor: "pointer",
              }}
              aria-label="Reset"
            >
              {face}
            </button>

            <div className="flex items-center gap-2">
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: "#00ff88", textShadow: "0 0 10px rgba(0,255,136,0.5)" }}
              >
                {String(time).padStart(3, "0")}
              </span>
              <span style={{ color: "#00ff88", fontSize: "14px" }}>◷</span>
            </div>
          </div>

          {/* Board */}
          <div className="w-full overflow-x-auto flex justify-center pb-2">
            <BoardView
              board={board}
              difficulty={difficulty}
              onLeft={handleLeft}
              onRight={handleRight}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
            />
          </div>

          <p
            className="text-xs text-center max-w-md"
            style={{ color: "#4b5563", fontFamily: "'Space Mono', monospace" }}
          >
            // Each cell is a hypothesis. Estimate. Decide. Update. [R] to reset.
          </p>

          {/* Win/Lose overlay */}
          {(status === "won" || status === "lost") && lastScore && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: "rgba(10,10,15,0.85)", backdropFilter: "blur(6px)" }}
            >
              <div
                className="rounded-xl p-8 max-w-sm w-[90%] text-center"
                style={{
                  background: "#11111c",
                  border: `1px solid ${lastScore.color}55`,
                  boxShadow: `0 0 60px ${lastScore.color}33`,
                  fontFamily: "'Space Mono', monospace",
                  animation: "mw-fade 0.4s ease-out",
                }}
              >
                <div className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: "#6b7280" }}>
                  {status === "won" ? "Cleared" : "Detonated"}
                </div>
                <div
                  className="font-bold leading-none"
                  style={{
                    fontSize: "120px",
                    color: lastScore.color,
                    textShadow: `0 0 30px ${lastScore.color}aa`,
                  }}
                >
                  {lastScore.grade}
                </div>
                <div className="text-3xl font-bold mt-2" style={{ color: "#fff" }}>
                  {lastScore.score}
                  <span className="text-base opacity-50">/100</span>
                </div>
                <p className="text-sm mt-4 mb-6" style={{ color: "#9ca3af" }}>
                  {lastScore.feedback}
                </p>
                <div className="flex justify-between text-xs mb-6" style={{ color: "#6b7280" }}>
                  <span>Time: {String(time).padStart(3, "0")}s</span>
                  <span>Par: {difficulty.par}s</span>
                </div>
                <button
                  onClick={() => reset()}
                  className="w-full py-3 rounded-md font-bold transition-all"
                  style={{
                    background: `${lastScore.color}15`,
                    color: lastScore.color,
                    border: `1px solid ${lastScore.color}55`,
                    cursor: "pointer",
                  }}
                >
                  PLAY AGAIN
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
