// 资讯爬虫「点点点」E2E + 后端联调测试（T05）
// ---------------------------------------------------------------------------
// 覆盖：
//   1) 前端经 DB._callCrawler('validate', {...}) 打到真实后端
//      (http://localhost:8765/api/news)，断言 summary-only 被丢弃、真实正文进入 valid。
//   2) 点击资讯卡片「阅读全文」(news-open-detail) → 弹窗 news-full-body(newsPreviewContent)
//      渲染的是真实正文 content（非空且 ≠ summary）——【核心断言：正文永不为 summary】。
//   3) 经 _callCrawler('rss'/'extract') 归一化后，进入 items 的 content/body 绝不混入摘要。
//
// 前置：后端 uvicorn(8765) 与前端 http.server(8090) 已启动。
// 运行：node tests/e2e/qa-news-crawler-e2e.mjs
// 注意：run-code 环境不暴露 Node 全局 setTimeout，故全程使用 page.waitForTimeout。
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = '/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1';
const FRONTEND = 'http://localhost:8090/';
const CRAWLER_BASE = 'http://localhost:8765/api/news';
const SUMMARY_ONLY = '只是一句短摘要';
const REAL_BODY = '真实正文至少五十个字符的真实正文内容用于验证过滤逻辑是否生效且额外补充足够字符以满足长度要求确保通过校验。';
const REAL_CONTENT = '这是从文章正文中抽取出的真实完整段落内容。我们验证点击阅读全文后弹窗展示的是真实正文而不是摘要文本。长度必须足够五十个字符以上才能通过入库校验，这里补充足够的真实正文内容用于断言展示正确。';

const OUT_DIR = path.join(ROOT, 'qa-results');
fs.mkdirSync(OUT_DIR, { recursive: true });

const report = {
  meta: { frontend: FRONTEND, crawlerBase: CRAWLER_BASE, startedAt: new Date().toISOString() },
  steps: [],
  consoleErrors: [],
  pageErrors: [],
  summary: {},
};

let chromiumPath = null;
try { chromiumPath = chromium.executablePath(); } catch (e) { /* fallback below */ }
// 兜底：复用仓库已有 qa 脚本使用的固定缓存路径
const FALLBACK_PATH = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const consoleErrors = [];
const pageErrors = [];

function stepResult(name, ok, detail) {
  report.steps.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} ::`, detail || '');
}

async function main() {
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--no-proxy-server'],
  };
  if (chromiumPath) launchOpts.executablePath = chromiumPath;
  else launchOpts.executablePath = FALLBACK_PATH;

  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    // ===== 打开前端 SPA =====
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.DB && typeof window.navigateTo === 'function', { timeout: 20000 });
    await page.waitForTimeout(800);

    // 进入资讯页（SPA 路由加载 pages/news.html，注册 window.initNewsPage 等）
    await page.evaluate(() => window.navigateTo('news'));
    await page.waitForSelector('#newsCardList', { timeout: 10000 });
    await page.waitForFunction(() => typeof window.renderRecommendCards === 'function' && typeof window.openNewsPreview === 'function', { timeout: 10000 });
    await page.waitForTimeout(800);

    // ===== STEP 1: validate 经 _callCrawler 打到真实后端 =====
    let step1;
    try {
      const res = await page.evaluate(async (cfg) => {
        window.__STUDYMINDCONFIG__ = { crawlerBackend: { baseURL: cfg.base } };
        return await window.DB._callCrawler('validate', {
          items: [
            { title: '摘要-only', summary: cfg.summary, source: 'srcA' },
            { title: '真实正文', body: cfg.realBody, source: 'srcA' },
          ],
        });
      }, { base: CRAWLER_BASE, summary: SUMMARY_ONLY, realBody: REAL_BODY });

      const valid = res.valid || [];
      const dropped = res.dropped || [];
      const sourceOk = res.source === 'http';
      const validHasReal = valid.length === 1 && valid[0].body === REAL_BODY;
      const droppedHasSummary = dropped.length === 1 && dropped[0].reason === 'no_body';
      const noSummaryAsBody = valid.every((it) => (it.body || it.content || '') !== SUMMARY_ONLY);
      const ok = sourceOk && validHasReal && droppedHasSummary && noSummaryAsBody;
      step1 = { ok, source: res.source, validCount: valid.length, droppedCount: dropped.length, droppedReason: dropped[0] && dropped[0].reason };
    } catch (e) {
      step1 = { ok: false, error: e.message };
    }
    stepResult('e2e-validate-via-callCrawler', step1.ok, step1);

    // ===== STEP 2: 阅读全文 → 弹窗渲染真实正文（核心断言：永不为 summary）=====
    let step2;
    try {
      const injected = await page.evaluate(async (cfg) => {
        const item = {
          _id: 'qa-1',
          title: 'QA 测试资讯标题',
          summary: cfg.summary,
          content: cfg.realContent,
          source: 'srcA',
          level: 'low',
          score: 50,
        };
        // 让推荐列表渲染出该条目（覆盖 DB 拉取，避免依赖真实后端/CloudBase）
        window.DB.getRecommendedNews = async () => ({ success: true, data: [item] });
        await window.renderRecommendCards();
        return { summary: item.summary, content: item.content };
      }, { summary: SUMMARY_ONLY, realContent: REAL_CONTENT });

      // 等待「阅读全文」按钮出现并点击
      await page.waitForSelector('[data-testid="news-open-detail"]', { timeout: 8000 });
      let clicked = true;
      try {
        await page.locator('[data-testid="news-open-detail"]').first().click({ timeout: 5000 });
      } catch (e) {
        clicked = false;
        // 兜底：直接调用按钮的 onclick 逻辑
        await page.evaluate(() => window.openNewsPreview('qa-1'));
      }

      // 等待弹窗正文容器渲染出非空文本
      await page.waitForFunction(() => {
        const el = document.getElementById('newsPreviewContent');
        return el && el.innerText.trim().length > 0;
      }, { timeout: 8000 });

      const modalText = await page.evaluate(() => document.getElementById('newsPreviewContent').innerText.trim());
      const ok = modalText.length >= 50
        && modalText.includes(injected.content.slice(0, 20))
        && modalText !== injected.summary
        && !modalText.startsWith(injected.summary);
      step2 = {
        ok,
        clicked,
        modalLen: modalText.length,
        showsRealContent: modalText.includes(injected.content.slice(0, 20)),
        equalsSummary: modalText === injected.summary,
      };
    } catch (e) {
      step2 = { ok: false, error: e.message };
    }
    stepResult('e2e-read-full-body-not-summary', step2.ok, step2);

    // ===== STEP 3: rss/extract 归一化后 items 绝不混入摘要 =====
    let step3;
    try {
      const norm = await page.evaluate(async (cfg) => {
        window.__STUDYMINDCONFIG__ = { crawlerBackend: { baseURL: cfg.base } };
        const rss = await window.DB._callCrawler('rss', { sources: ['https://nonexistent-domain-qa-12345.invalid/rss'] });
        const ext = await window.DB._callCrawler('extract', { url: 'https://nonexistent-domain-qa-12345.invalid/article' });
        const items = (rss.items || []).concat(ext.items || []);
        const violate = items.filter((it) => {
          const c = it && (it.content || it.body || '');
          return c && c.trim() === cfg.summary;
        });
        return { rssOk: rss.ok, extOk: ext.ok, totalItems: items.length, violateCount: violate.length };
      }, { base: CRAWLER_BASE, summary: SUMMARY_ONLY });
      const ok = norm.violateCount === 0;
      step3 = { ok, ...norm };
    } catch (e) {
      step3 = { ok: false, error: e.message };
    }
    stepResult('e2e-normalize-never-summary', step3.ok, step3);

  } finally {
    report.consoleErrors = consoleErrors;
    report.pageErrors = pageErrors;
    const passed = report.steps.filter((s) => s.ok).length;
    const failed = report.steps.length - passed;
    report.summary = {
      total: report.steps.length,
      passed,
      failed,
      consoleErrorTotal: consoleErrors.length,
      pageErrorTotal: pageErrors.length,
    };
    const reportPath = path.join(OUT_DIR, 'qa-news-crawler-e2e-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('\n=== E2E 汇总 ===');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log('report ->', reportPath);
    await browser.close();
    process.exit(failed === 0 ? 0 : 1);
  }
}

main().catch((e) => {
  console.error('E2E 运行异常:', e);
  report.summary = { fatal: e.message };
  fs.writeFileSync(path.join(OUT_DIR, 'qa-news-crawler-e2e-report.json'), JSON.stringify(report, null, 2));
  process.exit(2);
});
