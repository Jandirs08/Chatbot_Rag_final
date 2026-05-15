"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { motionTokens } from "./tokens";

type StaggerProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  stagger?: number;
  delayChildren?: number;
};

export function Stagger({
  children,
  stagger = motionTokens.stagger.tight,
  delayChildren = 0,
  ...rest
}: StaggerProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : stagger,
            delayChildren,
          },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = Omit<HTMLMotionProps<"div">, "ref"> & { y?: number };

export function StaggerItem({ children, y = 12, ...rest }: StaggerItemProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : y },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: motionTokens.duration.base,
            ease: motionTokens.ease.outExpo,
          },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
