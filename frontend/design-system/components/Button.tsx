import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-colors duration-150 ease-out disabled:cursor-not-allowed " +
  "focus-visible:outline-none";

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-primary-600 text-white shadow-e1 hover:bg-primary-700 hover:shadow-e2 " +
    "active:bg-primary-800 active:scale-[0.98] focus-visible:shadow-focus " +
    "disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none",
  secondary:
    "bg-white text-primary-700 border border-neutral-300 shadow-e1 " +
    "hover:bg-primary-50 hover:border-primary-300 active:bg-primary-100 " +
    "active:border-primary-400 disabled:text-neutral-400 disabled:border-neutral-200",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 " +
    "active:bg-neutral-200 disabled:text-neutral-400",
  danger:
    "bg-danger-600 text-white shadow-e1 hover:bg-danger-700 hover:shadow-e2 " +
    "active:bg-[#931f34] active:scale-[0.98] disabled:bg-neutral-200 disabled:text-neutral-400",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ variant = "primary", size = "md", className = "", ...props }, ref) => (
  <button
    ref={ref}
    className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    {...props}
  />
));
Button.displayName = "Button";
