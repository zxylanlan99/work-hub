// C1/C2/C3 强制校验模块（T17 / 架构 §8 T17）。
//
// 本模块聚焦 C1（禁止前端写死 mock，架构 §10 / PRD §7）：
//   - assertNoMock()      开发期/构建期/QA 断言 web/src 无 `const mockData` /
//                        硬编码示例数组 / `MOCK_*` 等写死 mock。
//   - assertRealService() 断言 API 层未配置服务时走引导空态/真实错误，而非返回假列表
//                        （即不存在 mock 兜底）。
//
// C2（服务端红线，R1–R5）/ C3（FastGPT 仅检索后端）的断言点在 e2e
// （web/src/tests/e2e/c1c2c3.spec.ts），因其涉及 Python 后端源码，无法在浏览器运行期校验。
//
// 注意：本文件本身允许出现 "mock" 字样（仅用于断言逻辑），故扫描时排除自身。

import { SERVICE_BASE } from "./api";

// 扫描 web/src 全部源码（排除测试文件与自身，避免把测试里的 vi.mock 当违规）。
// `?raw` 仅读取文本，不执行模块，无副作用。
const SOURCE_FILES = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SELF = "/src/lib/c1c2c3_checks.ts";

// 禁止模式（保守，避免误报正常业务变量）。
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(const|let|var)\s+mock\w*\s*=/i, label: "const/let/var mock…=" },
  { re: /\bMOCK_[A-Z_]+\b/, label: "MOCK_DATA / MOCK_NEWS …" },
  { re: /\b(fake|dummy)(Data|News|Items|List)\b/i, label: "fakeData / dummyData …" },
  { re: /\.isMock\b|\bmock:\s*true\b/i, label: "isMock / mock:true" },
];

function scanSources(): Array<{ path: string; reasons: string[] }> {
  const violations: Array<{ path: string; reasons: string[] }> = [];
  for (const [path, src] of Object.entries(SOURCE_FILES)) {
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts")) continue;
    if (path === SELF) continue;
    const reasons = new Set<string>();
    for (const { re, label } of FORBIDDEN_PATTERNS) {
      if (re.test(src)) reasons.add(label);
    }
    if (reasons.size) violations.push({ path, reasons: [...reasons] });
  }
  return violations;
}

export interface C1Report {
  pass: boolean;
  violations: Array<{ path: string; reasons: string[] }>;
}

/** 检查 web/src 是否写死 mock（不抛错，返回报告）。 */
export function checkNoMock(): C1Report {
  const violations = scanSources();
  return { pass: violations.length === 0, violations };
}

/** C1 断言：web/src 中不得出现写死 mock。命中则抛出，附带命中的文件与模式。 */
export function assertNoMock(): void {
  const report = checkNoMock();
  if (!report.pass) {
    const detail = report.violations
      .map((v) => `  - ${v.path}: ${v.reasons.join(", ")}`)
      .join("\n");
    throw new Error(`[C1] 检测到前端写死 mock 数据，违反 C1 硬约束：\n${detail}`);
  }
}

// API 层真实服务断言（C1 强化）：未配置服务时不应返回假列表。
const API_FILES = import.meta.glob("/src/lib/api/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const API_FORBIDDEN: Array<{ re: RegExp; label: string }> = [
  { re: /\bMOCK_[A-Z_]+\b/, label: "MOCK_* 常量" },
  { re: /\b(const|let|var)\s+mock\w*\s*=/i, label: "mock 兜底数据" },
  { re: /\bfallbackToMock\b|\buseMockData\b|\bmockMode\b/i, label: "mock 兜底开关" },
];

export interface RealServiceReport {
  pass: boolean;
  issues: Array<{ path: string; reasons: string[] }>;
  serviceBaseOk: boolean;
}

/** 检查 API 层是否存在 mock 兜底（不抛错，返回报告）。 */
export function checkRealService(): RealServiceReport {
  const issues: Array<{ path: string; reasons: string[] }> = [];
  for (const [path, src] of Object.entries(API_FILES)) {
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts")) continue;
    if (path === SELF) continue;
    const reasons = new Set<string>();
    for (const { re, label } of API_FORBIDDEN) {
      if (re.test(src)) reasons.add(label);
    }
    if (reasons.size) issues.push({ path, reasons: [...reasons] });
  }
  // SERVICE_BASE 不得指向 mock/fake；必须为真实 http(s) 地址。
  const serviceBaseOk = Object.values(SERVICE_BASE).every(
    (u) => typeof u === "string" && !/mock|fake/i.test(u) && /^https?:\/\//.test(u)
  );
  return { pass: issues.length === 0 && serviceBaseOk, issues, serviceBaseOk };
}

/** C1 断言：API 层未配置服务时走真实接口/引导空态，而非返回假列表。 */
export function assertRealService(): void {
  const report = checkRealService();
  if (!report.pass) {
    const detail = report.issues
      .map((v) => `  - ${v.path}: ${v.reasons.join(", ")}`)
      .join("\n");
    const baseMsg = report.serviceBaseOk
      ? ""
      : "  - SERVICE_BASE 含 mock/fake 地址（应指向真实服务）";
    throw new Error(
      `[C1] 检测到 API 层存在 mock 兜底，违反 C1（未配置服务应返回引导空态而非假列表）：\n${detail}\n${baseMsg}`
    );
  }
}

/** QA 统一入口：执行 C1 全部断言，返回结构化报告（便于 CI 汇总）。 */
export const c1c2c3 = {
  assertNoMock,
  assertRealService,
  checkNoMock,
  checkRealService,
};

export default c1c2c3;
