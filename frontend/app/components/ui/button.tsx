import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[20px] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-95 shadow-[0_4px_8px_rgba(0,0,0,0.1)]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)] hover:scale-[1.02]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:shadow-[0_4px_8px_rgba(0,0,0,0.08)]",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-success text-success-foreground hover:bg-success/90 hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/90 hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
        info:
          "bg-info text-info-foreground hover:bg-info/90 hover:shadow-[0_6px_12px_rgba(0,0,0,0.12)]",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10 rounded-full",
      },
      width: {
        auto: "w-auto",
        full: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      width: "auto",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, width, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, width, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
