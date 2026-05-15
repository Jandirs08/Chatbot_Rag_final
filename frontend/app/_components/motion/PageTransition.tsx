"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { motionTokens } from "./tokens";

export function PageTransition({ children, ...rest }: Omit<HTMLMotionProps<"div">, "ref">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : -4 }}
      transition={{
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.outExpo,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
