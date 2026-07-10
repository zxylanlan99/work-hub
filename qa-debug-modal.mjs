import { chromium } from 'playwright';
const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:8090/';
const b = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const page = await ctx.newPage();
await page.route('**/cloudbase.full.js**', r => r.abort());
await page.goto(BASE+'index.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.DB&&window.db,{timeout:20000});
await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('studymind')).forEach(k=>localStorage.removeItem(k));});
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.DB&&window.db,{timeout:20000});
await page.evaluate(()=>window.navigateTo('ai-chat'));
await page.waitForSelector('#chat-list',{timeout:8000});
await page.evaluate(()=>window.DB.createChat({title:'D1',agentId:'general'}));
await page.evaluate(()=>window.loadChatList());
await page.waitForTimeout(500);
const it = page.locator('#chat-list .conversation-item',{has:page.locator('.conv-title',{hasText:'D1'})});
await it.hover(); await page.waitForTimeout(200);
await it.locator('.conv-delete-btn').click();
await page.waitForSelector('.modal-overlay',{timeout:4000}).catch(e=>console.log('no overlay visible:',e.message));
await page.waitForTimeout(500);
const info = await page.evaluate(()=>{
  const ov = document.querySelector('.modal-overlay');
  if(!ov) return {found:false};
  const cs = getComputedStyle(ov);
  const rect = ov.getBoundingClientRect();
  // walk ancestors for display:none / visibility:hidden
  let hiddenAncestor=null, p=ov.parentElement;
  while(p){ const pc=getComputedStyle(p); if(pc.display==='none'||pc.visibility==='hidden'){hiddenAncestor={tag:p.tagName,cls:p.className,disp:pc.display,vis:pc.visibility};break;} p=p.parentElement; }
  return { found:true, display:cs.display, visibility:cs.visibility, opacity:cs.opacity, position:cs.position, top:cs.top, left:cs.left, right:cs.right, bottom:cs.bottom, inset:cs.inset, rectW:rect.width, rectH:rect.height, bodyOverflow:getComputedStyle(document.body).overflow, bodyDisplay:getComputedStyle(document.body).display, hiddenAncestor };
});
console.log('OVERLAY INFO', JSON.stringify(info,null,2));
await page.screenshot({path:'/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1/qa-results/debug-modal.png'});
await b.close();
console.log('DONE');
