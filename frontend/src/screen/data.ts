// Live JSON for everything opened by a link (lobby screen, guest phone, staff view): never show a
// browser error. On network failure keep the last good copy (also across a restart, via
// localStorage) and quietly retry; a 404 means the link was revoked, so the copy is dropped.
import { useEffect, useState } from "react";
import { demoScreen } from "./demo.ts";
import type { ScreenData } from "./types.ts";

type Cached<T> = { data: T; at: string };

function readCache<T>(key: string): Cached<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: Cached<T> | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* private mode / full storage: the in-memory copy still works */
  }
}

class Revoked extends Error {}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 404) throw new Revoked();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export type Live<T> = { data: T | null; updatedAt: Date | null; offline: boolean; revoked: boolean };

export function useLive<T>(key: string, load: () => Promise<T>, refreshSeconds: number): Live<T> {
  const [state, setState] = useState<Live<T>>(() => {
    const cached = readCache<T>(key);
    return { data: cached?.data ?? null, updatedAt: cached ? new Date(cached.at) : null, offline: false, revoked: false };
  });

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const data = await load();
        if (!alive) return;
        const at = new Date();
        setState({ data, updatedAt: at, offline: false, revoked: false });
        writeCache(key, { data, at: at.toISOString() });
      } catch (error) {
        if (!alive) return;
        if (error instanceof Revoked) {
          setState({ data: null, updatedAt: null, offline: false, revoked: true });
          writeCache(key, null);
        } else {
          console.warn(`${key}: brak połączenia, zostaje ostatnia wersja`, error);
          setState((s) => ({ ...s, offline: true }));
        }
      }
    };
    refresh();
    const id = window.setInterval(refresh, refreshSeconds * 1000);
    // Phones sleep: refresh as soon as the guest comes back to the tab.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, refreshSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

export function useScreenData(token: string): ScreenData | null {
  const [refresh, setRefresh] = useState(60);
  const live = useLive<ScreenData>(
    `ekran:${token}`,
    () => (token === "demo" ? Promise.resolve(demoScreen(new Date())) : fetchJson(`/api/ekran/${encodeURIComponent(token)}/`)),
    refresh,
  );
  const wanted = live.data?.refresh_seconds;
  useEffect(() => {
    if (wanted && wanted !== refresh) setRefresh(wanted);
  }, [wanted, refresh]);
  return live.data;
}
