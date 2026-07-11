// Unified fetch client for the data-service.
//
// Base URL defaults to http://localhost:8000 (the data-service host port in
// docker-compose) and can be overridden with VITE_API_BASE. Every response is
// parsed against the {code, data, message} envelope; non-zero code or a
// network/timeout error throws ApiError. We never fabricate data (C1).
//
// 45s timeout mirrors the architecture's single-request ceiling (§7 / C3).

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: controller.signal,
    });
    const json: unknown = await res.json().catch(() => ({}));
    const body = json as { code?: number; data?: T; message?: string };
    if (!res.ok || (typeof body.code === "number" && body.code !== 0)) {
      throw new ApiError(body.code ?? res.status, body.message ?? res.statusText);
    }
    return body.data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(50401, "请求超时");
    }
    throw new ApiError(50001, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export default api;
