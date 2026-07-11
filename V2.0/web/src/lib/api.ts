// StudyMind V2.0 — 统一 API 客户端（四服务）
//
// 服务 base URL（以 team-lead 交接为准，覆盖架构稿旧端口号）：
//   data-service  :8000   agent-service :8001
//   kb-service    :8002   crawler-service :8003
// 默认读 import.meta.env.VITE_*_API，缺省回落到 VITE_API_BASE，再回落到 localhost 默认端口。
//
// 统一信封：{ code: 0, data: <T>, message }；code != 0 抛 ApiError。
// 单请求 45s 超时（AbortController），超时不重试。绝不编造 data（C1）。

export type ServiceName = "data" | "agent" | "kb" | "crawler";

const DEFAULTS: Record<ServiceName, string> = {
  data: "http://localhost:8000",
  agent: "http://localhost:8001",
  kb: "http://localhost:8002",
  crawler: "http://localhost:8003",
};

function env(name: keyof ImportMetaEnv): string | undefined {
  return import.meta.env[name];
}

export const SERVICE_BASE: Record<ServiceName, string> = {
  data:
    env("VITE_DATA_API") ?? env("VITE_API_BASE") ?? DEFAULTS.data,
  agent:
    env("VITE_AGENT_API") ?? env("VITE_API_BASE") ?? DEFAULTS.agent,
  kb: env("VITE_KB_API") ?? env("VITE_API_BASE") ?? DEFAULTS.kb,
  crawler:
    env("VITE_CRAWLER_API") ?? env("VITE_API_BASE") ?? DEFAULTS.crawler,
};

/** 统一错误类型：携带后端错误码（无码时为 HTTP 状态或前端约定码）。 */
export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  params?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(base: string, path: string, params?: RequestOptions["params"]): string {
  const safeBase = base.endsWith("/") ? base : base + "/";
  const url = new URL(path, safeBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * 向指定服务发起请求并解析统一信封。
 * - 非 2xx 或 code != 0 → 抛 ApiError
 * - 网络/超时错误 → 抛 ApiError（50401 超时）
 * - 返回体中的 data 字段原样返回（调用方按契约类型化）
 */
export async function request<T>(
  service: ServiceName,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const external = options.signal;
  if (external) {
    external.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(buildUrl(SERVICE_BASE[service], path, options.params), {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const json: unknown = await res.json().catch(() => null);
    const body = (json ?? {}) as { code?: number; data?: T; message?: string };
    if (!res.ok || (typeof body.code === "number" && body.code !== 0)) {
      throw new ApiError(body.code ?? res.status, body.message ?? res.statusText);
    }
    return body.data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(50401, "请求超时（>45s），请稍后重试");
    }
    throw new ApiError(50001, (err as Error)?.message || "网络错误");
  } finally {
    clearTimeout(timer);
  }
}

/** 兼容旧版 / 直接取信封（debug 用）。 */
export const api = {
  get: <T>(service: ServiceName, path: string, params?: RequestOptions["params"]) =>
    request<T>(service, path, { method: "GET", params }),
  post: <T>(service: ServiceName, path: string, body?: unknown) =>
    request<T>(service, path, { method: "POST", body }),
  put: <T>(service: ServiceName, path: string, body?: unknown) =>
    request<T>(service, path, { method: "PUT", body }),
  del: <T>(service: ServiceName, path: string) =>
    request<T>(service, path, { method: "DELETE" }),
};

export default api;
