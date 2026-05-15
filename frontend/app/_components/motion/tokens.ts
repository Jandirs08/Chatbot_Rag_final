export const motionTokens = {
  ease: {
    outExpo: [0.16, 1, 0.3, 1] as const,
    outBack: [0.34, 1.56, 0.64, 1] as const,
    inOutCirc: [0.85, 0, 0.15, 1] as const,
  },
  spring: {
    soft: { type: "spring" as const, stiffness: 260, damping: 28 },
    snappy: { type: "spring" as const, stiffness: 380, damping: 30 },
    bouncy: { type: "spring" as const, stiffness: 320, damping: 18 },
  },
  duration: {
    instant: 0.12,
    fast: 0.2,
    base: 0.32,
    slow: 0.56,
  },
  stagger: {
    tight: 0.04,
    loose: 0.08,
  },
};
