import { useEffect, useState } from "react";

export class APIError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new APIError(typeof data?.error === "string" ? data.error : data?.error?.message || `Request failed (${response.status})`, response.status, data?.error?.code);
  return data as T;
}
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: APIError; loading: boolean }>({ loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision(value => value + 1);
    window.addEventListener("capi:refresh", listener);
    return () => window.removeEventListener("capi:refresh", listener);
  }, []);
  useEffect(() => {
    if (!path) { setState({ loading: false }); return; }
    let active = true;
    const controller = new AbortController();
    setState({ loading: true });
    api<T>(path, { signal: controller.signal }).then(data => { if (active) setState({ data, loading: false }); }).catch(error => { if (active) setState({ error, loading: false }); });
    return () => { active = false; controller.abort(); };
  }, [path, revision]);
  return state;
}
export type User = { id: string; name: string; email: string; role: string };
export type Workspace = { id: string; name: string; kind: string; role: string };
