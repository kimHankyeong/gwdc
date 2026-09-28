import type { AuditEvent, DemoUser, Policy, PurchaseRecord } from "@franchise/shared";

export type Bootstrap = {
  user: DemoUser | null;
  demoMode: boolean;
  chainMode: "simulated" | "rpc";
  policies?: Policy[];
  orders?: PurchaseRecord[];
  events?: AuditEvent[];
  users: DemoUser[];
  catalog: Array<{ id: string; name: string; unit: string; price: number }>;
  suppliers: Array<{ id: string; name: string; deliveryFee: number }>;
  defaultProvider?: "codex" | "claude" | "demo";
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(body.error || `요청에 실패했습니다 (${response.status}).`, response.status);
  return body as T;
}

export async function loadBootstrap(): Promise<Bootstrap> { return api<Bootstrap>("/api/bootstrap"); }
