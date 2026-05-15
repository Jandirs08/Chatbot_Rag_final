"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { motionTokens } from "./tokens";

type HoverLiftProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  lift?: number;
  glow?: "primary" | "violet" | "cyan" | "magenta" | "none";
};

const glowMap = {
  primary: "var(--shadow-glow-primary)",
  violet: "var(--shadow-glow-violet)",
  cyan: "var(--shadow-glow-cyan)",
  magenta: "var(--shadow-glow-magenta)",
  none: "none",
};

export function HoverLift({
  children,
  lift = 2,
  glow = "primary",
  ...rest
}: HoverLiftProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileHover={
        reduce
          ? undefined
          : { y: -lift, boxShadow: glowMap[glow] }
      }
      transition={{ duration: motionTokens.duration.base, ease: motionTokens.ease.outExpo }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
