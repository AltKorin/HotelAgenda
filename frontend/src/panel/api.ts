// Panel ↔ Django API. Session cookie + CSRF header; errors carry the server's Polish message.
import { useEffect, useState } from "react";
import type { TimeLabel } from "./time.ts";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let csrf = "";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? data.detail ?? `Błąd serwera (${response.status})`);
  return data as T;
}

/** Multipart upload (logos). No Content-Type header: the browser sets the boundary. */
export async function upload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const response = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: { "X-CSRFToken": csrf }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? data.detail ?? `Błąd serwera (${response.status})`);
  return data as T;
}

export const api = {
  get: <T,>(path: string) => call<T>(path),
  post: <T,>(path: string, body: unknown = {}) => call<T>(path, "POST", body),
  patch: <T,>(path: string, body: unknown) => call<T>(path, "PATCH", body),
  delete: <T,>(path: string, body: unknown) => call<T>(path, "DELETE", body),
};

type Session = { user: string | null; csrf: string };

export async function loadSession(): Promise<string | null> {
  const s = await call<Session>("/session/");
  csrf = s.csrf;
  return s.user;
}

export async function logIn(username: string, password: string): Promise<string | null> {
  const s = await call<Session>("/session/", "POST", { username, password });
  csrf = s.csrf; // Django rotates the token on login
  return s.user;
}

export async function logOut() {
  await call("/session/", "DELETE");
  await loadSession();
}

// --- shapes (mirror backend/agenda services) ---

export type Hotel = { id: string; name: string; timezone: string; logo: string | null; outputs_enabled: boolean; role: "admin" | "dyrektor" | "kierownik" | null };
export type Space = { id: string; name: string };
export type Kind = { id: string; name: string; card_hints: string[] };
export type Typical = { id: string; kind: string; title: string; start_time: string; end_time: string | null; space: string | null };

export type Placement = {
  space: string;
  subgroup: string;
  headcount: number | null;
  setup: string;
  menu: string;
  required_items: string[];
  todo: string;
  responsible: string;
  service_from: string | null;
  service_to: string | null;
};

export type EditorPoint = {
  id: string;
  kind: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_label: TimeLabel;
  realizer: "hotel" | "organizer";
  visibility: "guests" | "staff";
  guest_note: string;
  placements: Placement[];
};

export type GroupSummary = {
  id: string;
  name: string;
  theme: string;
  fonts: string | null;
  organizer: { name: string; logo: string | null; is_hotel: boolean };
  first_day: string;
  last_day: string;
  announcement: string;
  welcome: string;
  agreed: boolean;
  version: number;
  published_seq: number | null;
  unpublished_changes: boolean;
};

export type GroupDetail = GroupSummary & { points: EditorPoint[] };

export type Link = { id: string; kind: "guest" | "staff" | "screen"; group: string | null; token: string | null; created_at: string };

/** Small loader hook: data, error, reload. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api
      .get<T>(path)
      .then((data) => alive && setState({ data, error: null }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1), set: (data: T) => setState({ data, error: null }) };
}
