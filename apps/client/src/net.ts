export function httpBase() {
  return "";
}

export function wsBase() {
  if (import.meta.env.PROD) return `ws://${location.host}`;
  return `ws://${location.hostname}:2567`;
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${httpBase()}${path}`, { ...options, headers });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Falha na rede");
  return data;
}
