"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { motionTokens } from "./tokens";

type FadeInProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  delay?: number;
  y?: number;
  duration?: number;
};

export function FadeIn({
  children,
  delay = 0,
  y = 12,
  duration = motionTokens.duration.base,
  ...rest
}: FadeInProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: motionTokens.ease.outExpo }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
