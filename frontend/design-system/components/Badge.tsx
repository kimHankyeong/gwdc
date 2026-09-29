import type { HTMLAttributes } from "react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  info: "bg-primary-100 text-primary-700",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
};

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium " +
        `${tones[tone]} ${className}`
      }
      {...props}
    />
  );
}
