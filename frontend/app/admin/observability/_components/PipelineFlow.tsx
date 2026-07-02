"use client";

import type { WaterfallStage } from "@/app/_components/telemetry";
import { fmtMs, PIPELINE_STAGES } from "../_utils";

interface Props {
  stages: WaterfallStage[];
  bottleneckStageId?: string;
  haltedStageId?: string;
}

const NODE_W = 88;
const NODE_H = 48;
const NODE_Y = 16;
const SPACING = 116;
const START_X = 4;

const STAGE_COLORS: Record<string, string> = {
  embedding_ms: "hsl(var(--accent-cyan))",
  dense_ms: "hsl(var(--primary))",
  lexical_ms: "hsl(var(--primary))",
  hydrate_ms: "hsl(var(--primary))",
  rerank_ms: "hsl(var(--accent-violet))",
  llm_ms: "hsl(var(--success))",
};

// Single source of truth for stage order — shared with page.tsx haltedStageId logic.
const STAGE_DEFAULTS = PIPELINE_STAGES;

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

export function PipelineFlow({
  stages,
  bottleneckStageId,
  haltedStageId,
}: Props) {
  const stageMap = new Map(stages.map((s) => [s.key, s]));
  const haltedIndex = haltedStageId
    ? STAGE_DEFAULTS.findIndex((d) => d.key === haltedStageId)
    : -1;

  const rendered = STAGE_DEFAULTS.map((def, i) => {
    const stage = stageMap.get(def.key);
    const isHalted = i === haltedIndex;
    const isDisabled = haltedIndex >= 0 && i > haltedIndex;
    // A halted stage supersedes bottleneck styling; disabled stages show nothing.
    const isBottleneck =
      def.key === bottleneckStageId && !isHalted && !isDisabled;
    const color = isDisabled
      ? "hsl(var(--muted-foreground))"
      : (STAGE_COLORS[def.key] ?? "hsl(var(--primary))");
    const x = START_X + i * SPACING;
    const bars = barHeights(stage?.p95 ?? null, isBottleneck, i);
    return { def, stage, isHalted, isDisabled, isBottleneck, color, x, bars };
  });

  // Summary label
  const haltedStage = STAGE_DEFAULTS.find((d) => d.key === haltedStageId);
  const bottleneckStage = stages.find((s) => s.key === bottleneckStageId);
  const totalP95 = stages.reduce((acc, s) => acc + (s.p95 ?? 0), 0);
  const summaryLabel = haltedStage
    ? `⛔ Pipeline detenido — recuperación caída (${haltedStage.short})`
    : stages.length > 0
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
    // Flow is cut from the halted stage onward (connection i feeds node i+1)
    const isDisabled = haltedIndex >= 0 && i >= haltedIndex;
    return { x1, x2, y, delay: i * 0.3, isPreBottleneck, isDisabled };
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
              0%,100% { filter: drop-shadow(0 0 3px hsl(var(--warning) / 0.4)) }
              50%      { filter: drop-shadow(0 0 8px hsl(var(--warning) / 0.7)) }
            }
            @keyframes errorGlow {
              0%,100% { filter: drop-shadow(0 0 4px hsl(var(--error) / 0.5)) }
              50%      { filter: drop-shadow(0 0 10px hsl(var(--error) / 0.85)) }
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
              <path
                d="M0,0 L6,3 L0,6 Z"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
              />
            </marker>
            <marker
              id="arrowBottleneck"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path
                d="M0,0 L6,3 L0,6 Z"
                fill="hsl(var(--warning))"
                fillOpacity={0.7}
              />
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
              stroke={
                c.isDisabled
                  ? "hsl(var(--muted-foreground))"
                  : "hsl(var(--primary))"
              }
              strokeOpacity={c.isDisabled ? 0.08 : 0.15}
              strokeWidth={2}
              strokeDasharray={c.isDisabled ? "3 4" : undefined}
              markerEnd={
                c.isDisabled
                  ? undefined
                  : c.isPreBottleneck
                    ? "url(#arrowBottleneck)"
                    : "url(#arrowNormal)"
              }
            />
          ))}

          {/* Animated particles — none past a halted stage */}
          {connections.map((c, i) =>
            c.isDisabled ? null : (
              <line
                key={`particle-${i}`}
                x1={c.x1}
                y1={c.y}
                x2={c.x2}
                y2={c.y}
                stroke={
                  c.isPreBottleneck
                    ? "hsl(var(--warning))"
                    : "hsl(var(--accent-cyan))"
                }
                strokeOpacity={c.isPreBottleneck ? 0.9 : 0.7}
                strokeWidth={2}
                strokeDasharray="6 54"
                style={{
                  animation: `${c.isPreBottleneck ? "flowFast" : "flow"} ${c.isPreBottleneck ? "1.2s" : "1.8s"} linear infinite`,
                  animationDelay: `${c.delay}s`,
                }}
              />
            ),
          )}

          {/* Nodes */}
          {rendered.map(
            ({
              def,
              stage,
              isHalted,
              isDisabled,
              isBottleneck,
              color,
              x,
              bars,
            }) => {
              const strokeColor = isHalted
                ? "hsl(var(--error))"
                : isBottleneck
                  ? "hsl(var(--warning))"
                  : color;
              const glowAnimation = isHalted
                ? "errorGlow 1.3s ease-in-out infinite"
                : isBottleneck
                  ? "nodeGlow 1.5s ease-in-out infinite"
                  : undefined;
              return (
                <g
                  key={def.key}
                  style={{
                    animation: glowAnimation,
                    opacity: isDisabled ? 0.35 : 1,
                  }}
                >
                  {/* Node rect */}
                  <rect
                    x={x}
                    y={NODE_Y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={9}
                    fill="hsl(var(--card))"
                    stroke={strokeColor}
                    strokeOpacity={isHalted ? 0.8 : isBottleneck ? 0.5 : 0.25}
                    strokeWidth={isHalted || isBottleneck ? 1.8 : 1.2}
                    strokeDasharray={isDisabled ? "3 3" : undefined}
                  />
                  {/* Stage name */}
                  <text
                    x={x + NODE_W / 2}
                    y={NODE_Y + 18}
                    textAnchor="middle"
                    fill={isHalted ? "hsl(var(--error))" : color}
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="system-ui, sans-serif"
                  >
                    {def.short}
                  </text>
                  {/* Latency / status */}
                  <text
                    x={x + NODE_W / 2}
                    y={NODE_Y + 32}
                    textAnchor="middle"
                    fill={
                      isHalted
                        ? "hsl(var(--error))"
                        : "hsl(var(--muted-foreground))"
                    }
                    fontSize={isHalted ? 9 : 10}
                    fontWeight={isHalted ? 700 : 400}
                    fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                  >
                    {isHalted
                      ? "CAÍDO"
                      : isDisabled
                        ? "—"
                        : stage
                          ? fmtMs(stage.p95)
                          : "—"}
                  </text>

                  {/* Mini histogram bars below node — hidden when disabled */}
                  {!isDisabled &&
                    bars.map((h, bi) => {
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
                          fill={isHalted ? "hsl(var(--error))" : color}
                          opacity={opacity}
                        />
                      );
                    })}
                </g>
              );
            },
          )}

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
