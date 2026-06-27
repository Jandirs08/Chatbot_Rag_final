"use client";

import type { WaterfallStage } from "@/app/_components/telemetry";
import { fmtMs } from "../_utils";

interface Props {
  stages: WaterfallStage[];
  bottleneckStageId?: string;
}

const NODE_W = 88;
const NODE_H = 48;
const NODE_Y = 16;
const SPACING = 116;
const START_X = 4;

const STAGE_COLORS: Record<string, string> = {
  embedding_ms: "#22d3ee",
  dense_ms: "#60a5fa",
  lexical_ms: "#60a5fa",
  hydrate_ms: "#60a5fa",
  rerank_ms: "#a78bfa",
  llm_ms: "#34d399",
};

const STAGE_DEFAULTS = [
  { key: "embedding_ms", short: "Embed" },
  { key: "dense_ms", short: "Dense" },
  { key: "lexical_ms", short: "Lexical" },
  { key: "hydrate_ms", short: "Hydrate" },
  { key: "rerank_ms", short: "Rerank" },
  { key: "llm_ms", short: "LLM" },
];

// Generate pseudo-random bar heights seeded by index and value
function barHeights(
  base: number | null,
  isBottleneck: boolean,
  seed: number,
): number[] {
  return Array.from({ length: 10 }, (_, i) => {
    const noise = Math.sin(seed * 7 + i * 3.7) * 0.5 + 0.5;
    const min = isBottleneck ? 8 : 4;
    const max = isBottleneck ? 20 : 14;
    return min + noise * (max - min);
  });
}

export function PipelineFlow({ stages, bottleneckStageId }: Props) {
  const stageMap = new Map(stages.map((s) => [s.key, s]));

  const rendered = STAGE_DEFAULTS.map((def, i) => {
    const stage = stageMap.get(def.key);
    const isBottleneck = def.key === bottleneckStageId;
    const color = STAGE_COLORS[def.key] ?? "#60a5fa";
    const x = START_X + i * SPACING;
    const bars = barHeights(stage?.p95 ?? null, isBottleneck, i);
    return { def, stage, isBottleneck, color, x, bars };
  });

  // Bottleneck label
  const bottleneckStage = stages.find((s) => s.key === bottleneckStageId);
  const totalP95 = stages.reduce((acc, s) => acc + (s.p95 ?? 0), 0);
  const summaryLabel =
    stages.length > 0
      ? `p95 total: ${fmtMs(totalP95)}${bottleneckStage ? ` · bottleneck: ${bottleneckStage.short}` : ""}`
      : "Sin datos de pipeline";

  const svgWidth =
    START_X * 2 + STAGE_DEFAULTS.length * SPACING - (SPACING - NODE_W);
  // Connections: from right edge of node i to left edge of node i+1
  const connections = STAGE_DEFAULTS.slice(0, -1).map((def, i) => {
    const x1 = START_X + i * SPACING + NODE_W;
    const x2 = START_X + (i + 1) * SPACING;
    const y = NODE_Y + NODE_H / 2;
    const isPreBottleneck =
      bottleneckStageId !== undefined &&
      STAGE_DEFAULTS[i + 1]?.key === bottleneckStageId;
    return { x1, x2, y, delay: i * 0.3, isPreBottleneck };
  });

  return (
    <div
      className="w-full rounded-xl overflow-hidden bg-card border border-border"
      style={{ padding: "12px 12px 8px" }}
    >
      <div
        className="w-full overflow-x-auto"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--muted-foreground) / 0.3) transparent",
        }}
      >
        <svg
          width={svgWidth}
          height={140}
          viewBox={`0 0 ${svgWidth} 140`}
          style={{ display: "block", minWidth: svgWidth }}
          aria-label="Pipeline RAG: etapas y latencias"
        >
          <style>{`
            @keyframes flow {
              from { stroke-dashoffset: 60 }
              to   { stroke-dashoffset: 0  }
            }
            @keyframes flowFast {
              from { stroke-dashoffset: 60 }
              to   { stroke-dashoffset: 0  }
            }
            @keyframes nodeGlow {
              0%,100% { filter: drop-shadow(0 0 3px rgba(251,191,36,0.4)) }
              50%      { filter: drop-shadow(0 0 8px rgba(251,191,36,0.7)) }
            }
          `}</style>

          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowNormal"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(99,179,255,0.3)" />
            </marker>
            <marker
              id="arrowBottleneck"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(251,191,36,0.7)" />
            </marker>
          </defs>

          {/* Connecting base lines */}
          {connections.map((c, i) => (
            <line
              key={`base-${i}`}
              x1={c.x1}
              y1={c.y}
              x2={c.x2}
              y2={c.y}
              stroke="rgba(99,179,255,0.15)"
              strokeWidth={2}
              markerEnd={
                c.isPreBottleneck
                  ? "url(#arrowBottleneck)"
                  : "url(#arrowNormal)"
              }
            />
          ))}

          {/* Animated particles */}
          {connections.map((c, i) => (
            <line
              key={`particle-${i}`}
              x1={c.x1}
              y1={c.y}
              x2={c.x2}
              y2={c.y}
              stroke={
                c.isPreBottleneck
                  ? "rgba(251,191,36,0.9)"
                  : "rgba(34,211,238,0.7)"
              }
              strokeWidth={2}
              strokeDasharray="6 54"
              style={{
                animation: `${c.isPreBottleneck ? "flowFast" : "flow"} ${c.isPreBottleneck ? "1.2s" : "1.8s"} linear infinite`,
                animationDelay: `${c.delay}s`,
              }}
            />
          ))}

          {/* Nodes */}
          {rendered.map(({ def, stage, isBottleneck, color, x, bars }) => {
            const hexAlpha = "40"; // ~25%
            return (
              <g
                key={def.key}
                style={
                  isBottleneck
                    ? { animation: "nodeGlow 1.5s ease-in-out infinite" }
                    : undefined
                }
              >
                {/* Node rect */}
                <rect
                  x={x}
                  y={NODE_Y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={9}
                  fill="hsl(var(--card))"
                  stroke={
                    isBottleneck
                      ? "rgba(245,158,11,0.5)"
                      : `${color}${hexAlpha}`
                  }
                  strokeWidth={isBottleneck ? 1.8 : 1.2}
                />
                {/* Stage name */}
                <text
                  x={x + NODE_W / 2}
                  y={NODE_Y + 18}
                  textAnchor="middle"
                  fill={color}
                  fontSize={11}
                  fontWeight={700}
                  fontFamily="system-ui, sans-serif"
                >
                  {def.short}
                </text>
                {/* Latency */}
                <text
                  x={x + NODE_W / 2}
                  y={NODE_Y + 32}
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  fontSize={10}
                  fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                >
                  {stage ? fmtMs(stage.p95) : "—"}
                </text>

                {/* Mini histogram bars below node */}
                {bars.map((h, bi) => {
                  const bx = x + bi * 6 + (NODE_W - 10 * 6 + 2) / 2;
                  const by = NODE_Y + NODE_H + 10 - h;
                  const opacity = isBottleneck
                    ? 0.5 + (bi / bars.length) * 0.3
                    : 0.25 + (bi / bars.length) * 0.2;
                  return (
                    <rect
                      key={bi}
                      x={bx}
                      y={by}
                      width={4}
                      height={h}
                      rx={1}
                      fill={color}
                      opacity={opacity}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Summary label */}
          <text
            x={svgWidth / 2}
            y={134}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={10}
            fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          >
            {summaryLabel}
          </text>
        </svg>
      </div>
    </div>
  );
}
