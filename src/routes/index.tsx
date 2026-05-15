import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

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
};

const DIFFICULTIES: Difficulty[] = [
  { key: "beginner", label: "Beginner", cols: 9, rows: 9, mines: 10 },
  { key: "intermediate", label: "Intermediate", cols: 16, rows: 16, mines: 40 },
  { key: "expert", label: "Expert", cols: 30, rows: 16, mines: 99 },
];

const NUMBER_COLORS: Record<number, string> = {
  1: "#22d3ee",
  2: "#00ff88",
  3: "#ff3355",
  4: "#a855f7",
  5: "#fb923c",
};

// Static demo pattern so the board has visual variety without game logic.
function demoCellState(r: number, c: number): { kind: "hidden" } | { kind: "revealed"; n?: number } | { kind: "flag" } | { kind: "mine" } {
  const seed = (r * 31 + c * 17) % 23;
  if (seed === 0) return { kind: "flag" };
  if (seed < 9) return { kind: "hidden" };
  if (seed === 9) return { kind: "revealed", n: 1 };
  if (seed === 10) return { kind: "revealed", n: 2 };
  if (seed === 11) return { kind: "revealed", n: 3 };
  if (seed === 12) return { kind: "revealed", n: 4 };
  if (seed === 13) return { kind: "revealed", n: 5 };
  return { kind: "revealed" };
}

function Cell({ r, c }: { r: number; c: number }) {
  const state = demoCellState(r, c);
  const base =
    "flex items-center justify-center font-mono font-bold select-none transition-all duration-150 border";

  if (state.kind === "hidden") {
    return (
      <div
        className={base}
        style={{
          width: "var(--cell)",
          height: "var(--cell)",
          background: "#1a1a2e",
          borderColor: "rgba(0,255,136,0.08)",
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
      />
    );
  }

  if (state.kind === "flag") {
    return (
      <div
        className={base}
        style={{
          width: "var(--cell)",
          height: "var(--cell)",
          background: "#1a1a2e",
          borderColor: "rgba(255,51,85,0.3)",
          color: "#ff3355",
          fontSize: "calc(var(--cell) * 0.5)",
          textShadow: "0 0 6px rgba(255,51,85,0.7)",
        }}
      >
        ⚑
      </div>
    );
  }

  if (state.kind === "mine") {
    return (
      <div
        className={base}
        style={{
          width: "var(--cell)",
          height: "var(--cell)",
          background: "#2a0a14",
          borderColor: "rgba(255,51,85,0.5)",
          color: "#ff3355",
          fontSize: "calc(var(--cell) * 0.55)",
          textShadow: "0 0 10px rgba(255,51,85,0.9)",
        }}
      >
        ✸
      </div>
    );
  }

  return (
    <div
      className={base}
      style={{
        width: "var(--cell)",
        height: "var(--cell)",
        background: "#16213e",
        borderColor: "rgba(255,255,255,0.04)",
        color: state.n ? NUMBER_COLORS[state.n] : "transparent",
        fontSize: "calc(var(--cell) * 0.55)",
        textShadow: state.n ? `0 0 8px ${NUMBER_COLORS[state.n]}80` : undefined,
      }}
    >
      {state.n ?? ""}
    </div>
  );
}

function Board({ difficulty }: { difficulty: Difficulty }) {
  return (
    <div
      className="inline-block p-3 rounded-lg"
      style={{
        background: "#0d0d18",
        border: "1px solid rgba(0,255,136,0.12)",
        boxShadow:
          "0 0 40px rgba(0,255,136,0.08), inset 0 0 30px rgba(0,255,136,0.03)",
      }}
    >
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: `repeat(${difficulty.cols}, var(--cell))`,
          gridTemplateRows: `repeat(${difficulty.rows}, var(--cell))`,
        }}
      >
        {Array.from({ length: difficulty.rows }).map((_, r) =>
          Array.from({ length: difficulty.cols }).map((_, c) => (
            <Cell key={`${r}-${c}`} r={r} c={c} />
          )),
        )}
      </div>
    </div>
  );
}

function Index() {
  const [active, setActive] = useState<Difficulty>(DIFFICULTIES[0]);

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          "radial-gradient(ellipse at top, #11111c 0%, #0a0a0f 60%)",
        color: "#e6e6f0",
        fontFamily: "'Inter', system-ui, sans-serif",
        ['--cell' as string]: "32px",
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          [data-mw-root] { --cell: 26px !important; }
        }
      `}</style>

      <div data-mw-root className="max-w-[1400px] mx-auto px-6 py-8" style={{ ['--cell' as string]: "32px" }}>
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
              style={{
                fontFamily: "'Space Mono', monospace",
                color: "#fff",
              }}
            >
              Minds<span style={{ color: "#00ff88" }}>Weeper</span>
            </h1>
          </div>
          <p
            className="text-sm tracking-wider uppercase"
            style={{ color: "#6b7280", letterSpacing: "0.15em" }}
          >
            Train your probabilistic mind
          </p>
        </header>

        {/* Difficulty selector */}
        <div className="flex flex-wrap gap-3 mb-8 justify-center">
          {DIFFICULTIES.map((d) => {
            const isActive = d.key === active.key;
            return (
              <button
                key={d.key}
                onClick={() => setActive(d)}
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
                  {d.cols}×{d.rows} · {d.mines} mines
                </div>
              </button>
            );
          })}
        </div>

        {/* Game panel */}
        <div className="flex flex-col items-center gap-6">
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
                style={{
                  color: "#ff3355",
                  textShadow: "0 0 10px rgba(255,51,85,0.5)",
                }}
              >
                {String(active.mines).padStart(3, "0")}
              </span>
            </div>

            <button
              className="w-12 h-12 rounded-md flex items-center justify-center text-2xl transition-transform hover:scale-110"
              style={{
                background: "#1a1a2e",
                border: "1px solid rgba(0,255,136,0.25)",
                boxShadow: "0 0 15px rgba(0,255,136,0.15)",
                cursor: "pointer",
              }}
              aria-label="Reset"
            >
              🧠
            </button>

            <div className="flex items-center gap-2">
              <span
                className="text-2xl font-bold tabular-nums"
                style={{
                  color: "#00ff88",
                  textShadow: "0 0 10px rgba(0,255,136,0.5)",
                }}
              >
                000
              </span>
              <span style={{ color: "#00ff88", fontSize: "14px" }}>◷</span>
            </div>
          </div>

          {/* Board (scrollable on small screens for expert) */}
          <div className="w-full overflow-x-auto flex justify-center pb-2">
            <Board difficulty={active} />
          </div>

          <p
            className="text-xs text-center max-w-md"
            style={{ color: "#4b5563", fontFamily: "'Space Mono', monospace" }}
          >
            // Each cell is a hypothesis. Estimate. Decide. Update.
          </p>
        </div>
      </div>
    </div>
  );
}
