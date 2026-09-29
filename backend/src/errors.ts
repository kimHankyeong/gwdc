export class AppError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function requireThat(ok: unknown, code: string, status = 409): asserts ok {
  if (!ok) throw new AppError(code, status);
}
