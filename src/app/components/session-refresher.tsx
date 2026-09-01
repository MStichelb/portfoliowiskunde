"use client";

import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function SessionRefresher() {
  useEffect(() => {
    const refresh = () => { void fetch("/api/auth/session/refresh", { method: "POST", credentials: "same-origin" }).catch(() => undefined); };
    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  return null;
}
