"use client";

import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { motionTokens } from "./tokens";

type PresenceProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  show: boolean;
  mode?: "fade" | "scale" | "slide-up";
};

export function Presence({ show, children, mode = "scale", ...rest }: PresenceProps) {
  const reduce = useReducedMotion();
  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    scale: {
      initial: { opacity: 0, scale: reduce ? 1 : 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: reduce ? 1 : 0.95 },
    },
    "slide-up": {
      initial: { opacity: 0, y: reduce ? 0 : 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: reduce ? 0 : 8 },
    },
  };
  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          {...variants[mode]}
          transition={motionTokens.spring.snappy}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
