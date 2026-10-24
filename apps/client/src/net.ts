export function httpBase() {
  return "";
}

export function wsBase() {
  if (import.meta.env.PROD) return `ws://${location.host}`;
  return `ws://${location.hostname}:2567`;
}

export class ServerDown extends Error {
  constructor() {
    super("O servidor caiu.");
    this.name = "ServerDown";
  }
}

export async function serverReachable(token?: string | null) {
  try {
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${httpBase()}/api/me`, { headers, signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${httpBase()}${path}`, { ...options, headers });
  } catch {
    throw new ServerDown();
  }
  if (response.status >= 500) throw new ServerDown();
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Falha na rede");
  return data;
}
