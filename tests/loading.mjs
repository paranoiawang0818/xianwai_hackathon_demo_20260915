import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173';
const catalog=await (await fetch(base+'/api/catalog')).json();
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));const pass=s=>{checks.push(s);console.log('PASS',s);};
let navigation=0;const goto=async()=>{await page.goto(base+'/?v=motion-'+(++navigation)+'#search');await page.locator('#song-query').waitFor();};
const ready=()=>page.locator('.song-result').first().waitFor();
try{
 await page.goto(base+'/?v=motion#search',{waitUntil:'domcontentloaded'});await page.locator('.boot-loading').waitFor();assert.equal(await page.locator('.boot-loading .loading-wave i').first().evaluate(e=>getComputedStyle(e).animationName),'loading-beat');await page.locator('#song-query').waitFor();pass('首次加载有声波与流动条');
 for(const song of catalog.songs){
  await goto();const start=Date.now();await page.locator(`[data-open-song="${song.id}"]`).click();await page.locator('.local-progress').waitFor();assert.equal(await page.locator('.local-progress .loading-wave i').first().evaluate(e=>getComputedStyle(e).animationName),'loading-beat');assert.equal(await page.locator('.local-progress [role="progressbar"]').count(),0);
  if(song.id==='dystopia')await page.waitForTimeout(240);if(song.id==='dystopia')await page.screenshot({path:fileURLToPath(new URL('./screenshots/loading-preset.png',import.meta.url)),fullPage:true});
  await page.locator('#song-title').waitFor();assert.equal(await page.locator('#song-title').innerText(),song.title);assert(Date.now()-start>=650);assert.equal(await page.locator('.wall-word').first().evaluate(e=>getComputedStyle(e).animationName),'word-fade');pass(song.title+'：预设加载动画可见，随后展开正确歌墙');
 }
 await goto();await page.locator('#song-query').fill('反乌托邦');await page.locator('#song-query').press('Enter');await page.locator('.local-progress').waitFor();await ready();pass('搜索已整理歌曲也显示过渡');
 await page.locator('[data-open-song="dystopia"]').click();await page.locator('[data-cancel-search]').click();await page.waitForTimeout(760);assert.match(await page.locator('#search-results').innerText(),/已取消/);assert(!page.url().endsWith('#wall'));assert(await page.locator('#song-query').evaluate(e=>e===document.activeElement));pass('内存缓存加载可取消，延迟结束后不跳转');
 // Slow cache and network failure are isolated test scenarios, without a new search.
 const love=catalog.songs.find(s=>s.title==='I LOVE U');await context.clearCookies();await page.evaluate(()=>sessionStorage.clear());await goto();
 await page.route('**/api/songs/'+love.id,async route=>{await new Promise(r=>setTimeout(r,950));await route.continue().catch(()=>{});});
 await page.locator(`[data-open-song="${love.id}"]`).click();await page.locator('.local-progress').waitFor();await page.locator('#song-query').fill('白石溪');await page.locator('#song-query').press('Enter');await ready();await page.waitForTimeout(600);assert.match(await page.locator('#search-results').innerText(),/白石溪/);assert(!page.url().endsWith('#wall'));await page.unroute('**/api/songs/'+love.id);pass('旧缓存请求迟到不会覆盖新搜索');
 await page.evaluate(()=>sessionStorage.clear());await goto();await page.route('**/api/songs/'+love.id,route=>route.fulfill({status:500,body:''}));await page.locator(`[data-open-song="${love.id}"]`).click();await page.locator('[data-retry-search]').waitFor();await page.unroute('**/api/songs/'+love.id);await page.locator('[data-retry-search]').click();await page.locator('.local-progress').waitFor();await page.locator('#song-title').waitFor();assert.equal(await page.locator('#song-title').innerText(),love.title);pass('缓存失败可重试，重试仍显示动画');
 await goto();
 const d=await (await fetch(base+'/data/demo.json')).json(),entry=catalog.songs.find(s=>s.id==='dystopia');
 await page.route('**/api/search',async route=>{await new Promise(r=>setTimeout(r,850));await route.fulfill({status:200,contentType:'text/event-stream',body:'event: progress\ndata: '+JSON.stringify({completed:2,message:'测试：来源已返回'})+'\n\nevent: complete\ndata: '+JSON.stringify({dataset:d,entry,cached:true})+'\n\n'}).catch(()=>{});});
 await page.locator('#song-query').fill('用于加载测试的检索主题');await page.locator('#song-query').press('Enter');await page.locator('.live-progress').waitFor();assert.equal(await page.locator('.stage-segment').count(),4);assert.equal(await page.locator('.live-progress .loading-wave i').first().evaluate(e=>getComputedStyle(e).animationName),'loading-beat');
 await page.screenshot({path:fileURLToPath(new URL('./screenshots/loading-live-fixture.png',import.meta.url)),fullPage:true});await ready();pass('非预设查询显示同款声波和真实阶段容器（响应为测试桩）');
 await page.setViewportSize({width:390,height:844});await page.locator('.song-result').click();await page.locator('.local-progress').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:fileURLToPath(new URL('./screenshots/loading-mobile.png',import.meta.url)),fullPage:true});await page.locator('[data-cancel-search]').click();pass('手机加载布局与取消按钮可用');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#song-query').fill('用于加载测试的检索主题');await page.locator('#song-query').press('Enter');await page.locator('.live-progress').waitFor();assert.equal(await page.locator('.loading-wave i').first().evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await page.locator('.progress-spinner').evaluate(e=>getComputedStyle(e).animationName),'none');await page.locator('[data-cancel-search]').click();pass('减少动态效果偏好下停止动画');
 assert.deepEqual(errors,[]);pass('无未捕获浏览器错误');
 await writeFile(new URL('./loading-results.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),checks,errors,note:'预设读取为实际服务；慢请求、失败、非预设 SSE 成功使用明确测试桩，不新增业务调用。'},null,2));
}finally{await browser.close();}
