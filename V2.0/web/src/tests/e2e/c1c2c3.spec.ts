// C1 / C2 / C3 端到端加固断言（T17 / 架构 §8 T17）。
//
// 运行：npm run test:e2e  （或并入现有 vitest：npx vitest run src/tests/e2e）
//
// 说明：
//   C1（禁止前端写死 mock）—— 复用 web/src/lib/c1c2c3_checks.ts 的 assertNoMock /
//       assertRealService（扫描 web/src 源码，浏览器/Node 均可运行）。
//   C2（禁止爬取无正文资讯，R1–R5 服务端执行）—— 静态断言 crawler-service 红线引擎
//       redline.py 强制「无正文拦截（R2）」且 news 入库管线再次双保险；并断言前端
//       news API 调用真实 /api/news/recommend 端点（非 mock）。
//   C3（禁用 FastGPT Agent 应用模块）—— 静态断言 kb-service/fastgpt_client.py 仅使用
//       数据集/文档/检索端点，不出现 FastGPT Agent/Workflow/应用/多轮记忆编排端点。
//
// 这些断言点对后端 Python 源码做静态校验，确保「红线只在服务端」「FastGPT 仅检索」
// 没有被回归破坏。后端运行期行为另由 crawler/kb 单测与接口契约覆盖。

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertNoMock, assertRealService, checkRealService } from "../../lib/c1c2c3_checks";

const HERE = dirname(fileURLToPath(import.meta.url));
// web/src/tests/e2e -> V2.0 根
const REPO_ROOT = resolve(HERE, "../../../../");

function readBackend(relPath: string): string {
  const full = resolve(REPO_ROOT, relPath);
  if (!existsSync(full)) {
    throw new Error(`[e2e] 后端源码缺失，无法断言：${relPath}`);
  }
  return readFileSync(full, "utf-8");
}

describe("C1 · 禁止前端写死 mock", () => {
  it("web/src 中无 const mockData / MOCK_* / fakeData 等写死 mock", () => {
    // 不抛错即通过（命中会在错误信息中列出文件与模式）。
    expect(() => assertNoMock()).not.toThrow();
  });

  it("API 层未配置服务时走真实接口/引导空态，无 mock 兜底", () => {
    expect(() => assertRealService()).not.toThrow();
    const report = checkRealService();
    expect(report.pass).toBe(true);
    expect(report.serviceBaseOk).toBe(true);
  });
});

describe("C2 · 禁止爬取无正文资讯（红线仅服务端执行）", () => {
  const redline = readBackend("services/crawler/app/redline.py");

  it("crawler 红线引擎存在且强制无正文拦截 (R2)", () => {
    expect(redline).toContain("min_body_len");
    expect(redline).toMatch(/R2:.*正文过短|R2:.*正文/);
  });

  it("crawler 红线覆盖 R1–R5（来源/正文/关键词/去重/预算）", () => {
    for (const tag of ["R1:", "R2:", "R3:", "R4:", "R5:"]) {
      expect(redline, `红线应含 ${tag}`).toContain(tag);
    }
  });

  it("news 入库管线再次双保险（T08 红线 re-check）", () => {
    const crawlerRouter = readBackend("services/crawler/app/routers/crawler.py");
    // 入库前再次执行红线校验，避免「资讯已落库但知识未切片」半成品。
    expect(crawlerRouter).toMatch(/红线|redline|RedlineEngine/i);
  });

  it("前端 news API 调用真实 /api/news/recommend（非 mock）", () => {
    const newsApi = readBackend("web/src/lib/api/news.ts");
    // 必须打真实端点，且经由统一 request() 客户端（无本地 mock 兜底）。
    expect(newsApi).toContain("/api/news/recommend");
    expect(newsApi).toMatch(/request\s*</);
  });
});

describe("C3 · 禁用 FastGPT Agent 应用模块（仅检索后端）", () => {
  const fastgpt = readBackend("services/kb-service/app/fastgpt_client.py");

  it("kb-service 仅封装 FastGPT 数据集/文档/检索端点", () => {
    expect(fastgpt).toContain("create_dataset");
    expect(fastgpt).toContain("upload_document");
    expect(fastgpt).toContain("search");
  });

  it("不出现 FastGPT Agent / Workflow / 应用 / 多轮记忆编排端点", () => {
    // 这些端点路径属于 FastGPT 的 Agent 应用模块，C3 明确禁用。
    // （仅比对 FastGPT 专属 API 路径，避免中文注释里的「智能体/agent-service」误判。）
    const forbidden = [
      "/api/core/app",
      "/api/core/workflow",
      "/api/core/chat",
      "/apps/",
    ];
    for (const token of forbidden) {
      expect(
        fastgpt,
        `fastgpt_client.py 不应包含 FastGPT Agent 端点「${token}」(C3 禁用 Agent 模块)`
      ).not.toContain(token);
    }
  });

  it("显式声明 C3 合规（仅数据集/文档/检索，无 Agent）", () => {
    expect(fastgpt).toMatch(/C3|仅.*检索|无状态知识库检索后端/);
  });
});
