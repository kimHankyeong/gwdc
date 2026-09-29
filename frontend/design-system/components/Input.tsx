import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const fieldBase =
  "rounded-md border bg-white px-3 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 transition-colors duration-150 " +
  "focus-visible:outline-none focus-visible:border-primary-500 " +
  "focus-visible:shadow-focus disabled:bg-neutral-100 disabled:text-neutral-400";

function fieldState(error?: string) {
  return error
    ? "border-danger-600 bg-danger-50 focus-visible:shadow-focus-danger"
    : "border-neutral-300 hover:border-neutral-400";
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-700">
      {children}
    </label>
  );
}

function ErrorText({ children }: { children: string }) {
  return <p className="text-xs text-danger-600">{children}</p>;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: string; label?: string }
>(({ error, label, className = "", id, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && <Label htmlFor={id}>{label}</Label>}
    <input
      ref={ref}
      id={id}
      className={`h-10 ${fieldBase} ${fieldState(error)} ${className}`}
      {...props}
    />
    {error && <ErrorText>{error}</ErrorText>}
  </div>
));
Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { error?: string; label?: string }
>(({ error, label, className = "", id, children, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && <Label htmlFor={id}>{label}</Label>}
    <select
      ref={ref}
      id={id}
      className={`h-10 ${fieldBase} ${fieldState(error)} ${className}`}
      {...props}
    >
      {children}
    </select>
    {error && <ErrorText>{error}</ErrorText>}
  </div>
));
Select.displayName = "Select";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; label?: string }
>(({ error, label, className = "", id, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && <Label htmlFor={id}>{label}</Label>}
    <textarea
      ref={ref}
      id={id}
      className={`min-h-24 py-2 ${fieldBase} ${fieldState(error)} ${className}`}
      {...props}
    />
    {error && <ErrorText>{error}</ErrorText>}
  </div>
));
Textarea.displayName = "Textarea";
