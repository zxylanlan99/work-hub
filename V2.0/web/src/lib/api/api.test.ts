// request() 与统一信封 / 服务路由回归测试。
// request / ApiError / SERVICE_BASE 定义在 src/lib/api.ts（本目录上层文件），
// 通过 "../api" 解析到该文件（文件优先级高于同名的 api/ 目录）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { request, ApiError, SERVICE_BASE } from "../api";
import { categoriesApi } from "./categories";
import { agentsApi } from "./agents";
import { kbApi } from "./kb";
import { crawlerApi } from "./crawler";

/** 构造一个可被当作 Response 使用的轻量 mock（仅覆盖 request 实际用到的方法）。 */
function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json: unknown;
}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? "OK",
    json: async () => opts.json,
  } as unknown as Response;
}

describe("request() 统一信封处理", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("code===0 时返回 data 原值", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ json: { code: 0, data: { foo: "bar" }, message: "ok" } })
    );
    const data = await request<{ foo: string }>("data", "/x");
    expect(data).toEqual({ foo: "bar" });
  });

  it("code!==0 时抛出 ApiError 且携带 message 与 code", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ json: { code: 409, data: null, message: "业务错误" } })
    );
    await expect(request("data", "/x")).rejects.toThrow(ApiError);
    await expect(request("data", "/x")).rejects.toThrow("业务错误");
  });

  it("HTTP 非 2xx 时抛出 ApiError（code 取后端信封 code）", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: { code: 500, message: "服务器开小差" },
      })
    );
    await expect(request("data", "/x")).rejects.toThrow(ApiError);
    await expect(request("data", "/x")).rejects.toThrow("服务器开小差");
  });

  it("网络错误（fetch reject）时抛出 ApiError 且 message 透传", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(request("data", "/x")).rejects.toThrow(ApiError);
    await expect(request("data", "/x")).rejects.toThrow("network down");
  });

  it("超时（AbortError）时抛出 ApiError(50401)", async () => {
    fetchMock.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(request("data", "/x")).rejects.toThrow(ApiError);
    await expect(request("data", "/x")).rejects.toThrow("超时");
  });
});

describe("服务路由（base 端口）", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse({ json: { code: 0, data: [] } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("categoriesApi.list 打到 data 服务 (:8000)", async () => {
    await categoriesApi.list();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("localhost:8000");
    expect(url).toContain("/api/db/categories");
  });

  it("agentsApi.list 打到 agent 服务 (:8001)", async () => {
    await agentsApi.list();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("localhost:8001");
    expect(url).toContain("/api/agents");
  });

  it("kbApi.listDatasets 打到 kb 服务 (:8002)", async () => {
    await kbApi.listDatasets();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("localhost:8002");
    expect(url).toContain("/api/kb/datasets");
  });

  it("crawlerApi.search 打到 crawler 服务 (:8003)", async () => {
    await crawlerApi.search("量子计算");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("localhost:8003");
    expect(url).toContain("/api/crawler/search");
  });

  it("SERVICE_BASE 默认端口符合架构约定 (8000/8001/8002/8003)", () => {
    expect(SERVICE_BASE.data).toBe("http://localhost:8000");
    expect(SERVICE_BASE.agent).toBe("http://localhost:8001");
    expect(SERVICE_BASE.kb).toBe("http://localhost:8002");
    expect(SERVICE_BASE.crawler).toBe("http://localhost:8003");
  });
});
