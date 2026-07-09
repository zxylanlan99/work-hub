/**
 * menu-route.test.js — 验证"去外链 CDN 依赖"修复后，页面能
 * 在无外网的情况下完成初始化并切换侧边栏菜单。
 *
 * 背景：原 bug 根因是 index.html 在本地脚本（含 framework.js）之前
 * 同步加载 jsdelivr 的 marked / DOMPurify 外链，国内网络超时/被墙时
 * 会阻塞后续脚本 → window.navigateTo 永不存在 → 菜单内联 onclick 短路、
 * 首页 fetch 不发生。本修复将两库本地化（src/vendor/）并改为 defer。
 *
 * 本测试用 jsdom 真实加载 src/index.html，确认：
 *  1) 加载后 typeof window.navigateTo === 'function'（framework.js 已执行）
 *  2) 点击 [data-page="plan"] 后 fetch 至少命中 pages/plan.html
 *  3) page-title 文本含 "学习计划"
 *  4) 无 jsdomError
 * 由于已本地化，jsdom 不再请求任何外部 CDN，验证的正是"无外链也能初始化并切换"。
 *
 * 运行（项目约定 NODE_PATH 指向上层 node_modules，内含 jsdom）：
 *   node --test tests/unit/menu-route.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const INDEX = path.join(ROOT, 'src', 'index.html');
const INDEX_URL = 'file://' + INDEX;

test('menu-route.test.js — 去外链后初始化并切换学习计划页面', { timeout: 20000 }, () => {
  const vc = new VirtualConsole();
  const jsdomErrors = [];
  vc.on('jsdomError', (e) => {
    const msg = (e && (e.detail && e.detail.message)) || (e && e.message) || String(e);
    jsdomErrors.push(msg);
  });

  const html = fs.readFileSync(INDEX, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: INDEX_URL,
    virtualConsole: vc,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // 覆盖 fetch，记录所有调用 URL（在脚本执行前覆盖，确保初始首页导航与后续点击均被捕获）
  const fetchCalls = [];
  window.fetch = (url, opts) => {
    fetchCalls.push(String(url));
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve('<div class="x">loaded</div>'),
      json: () => Promise.resolve({}),
    });
  };

  return new Promise((resolve, reject) => {
    window.addEventListener('load', () => {
      // 等待 DOMContentLoaded 触发的 initApp + 首页导航完成
      setTimeout(() => {
        try {
          // 1. window.navigateTo 必须已定义（去外链后 framework.js 必须执行）
          assert.strictEqual(
            typeof window.navigateTo,
            'function',
            'DOMContentLoaded 后 window.navigateTo 应为 function（去外链后 framework.js 必须执行）'
          );

          // 2. 模拟点击侧边栏"学习计划"菜单
          const planItem = window.document.querySelector('[data-page="plan"]');
          assert.ok(planItem, '侧边栏应存在 data-page="plan" 菜单项');
          planItem.click();

          // 3. 等待点击触发的 fetch 完成
          setTimeout(() => {
            try {
              // fetch 至少命中 pages/plan.html
              assert.ok(
                fetchCalls.some((u) => u.includes('pages/plan.html')),
                '点击学习计划后应 fetch pages/plan.html，实际调用: ' + JSON.stringify(fetchCalls)
              );

              // page-title 文本含"学习计划"
              const title = window.document.getElementById('page-title').textContent || '';
              assert.ok(
                title.includes('学习计划'),
                'page-title 应含"学习计划"，实际: ' + title
              );

              // 无 jsdomError
              assert.strictEqual(
                jsdomErrors.length,
                0,
                '不应有 jsdomError，实际: ' + jsdomErrors.join(' | ')
              );

              console.log(
                '[PASS] menu-route: navigateTo=' + typeof window.navigateTo +
                ' | fetch=' + JSON.stringify(fetchCalls) +
                ' | page-title="' + title + '" | jsdomErrors=' + jsdomErrors.length
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 600);
        } catch (err) {
          reject(err);
        }
      }, 1200);
    });
  });
});
