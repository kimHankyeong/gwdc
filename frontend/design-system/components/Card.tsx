import type { HTMLAttributes } from "react";

type CardState = "default" | "selected" | "rejected";

export function Card({
  state = "default",
  interactive = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { state?: CardState; interactive?: boolean }) {
  const stateClass =
    state === "selected"
      ? "border-2 border-primary-500 bg-primary-50 shadow-e2"
      : state === "rejected"
        ? "border border-danger-600 bg-danger-50 shadow-e1"
        : "border border-neutral-200 bg-white shadow-e1";
  const hoverClass =
    interactive && state === "default"
      ? "hover:border-primary-200 hover:shadow-e2 cursor-pointer"
      : "";
  return (
    <div
      className={`rounded-lg p-6 transition-shadow duration-150 ${stateClass} ${hoverClass} ${className}`}
      {...props}
    />
  );
}
