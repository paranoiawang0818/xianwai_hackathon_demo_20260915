import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const pass=s=>{checks.push(s);console.log('PASS',s);};
const shot=name=>page.screenshot({path:fileURLToPath(new URL('./screenshots/'+name+'.png',import.meta.url)),fullPage:true});
try{
 await page.goto('http://127.0.0.1:4173/?v=compare-motion#search');await page.locator('[data-open-song="dystopia"]').click();await page.locator('.wall-word').first().waitFor();
 for(const id of ['resonance','craft']){await page.locator(`[data-view="${id}"]`).click();await page.locator(`#keyword-dialog [data-add="${id}"]`).click();await page.locator('[data-close-word]').click();}
 await page.locator('#compare-button').click();await page.locator('.compare-loading').waitFor();assert.equal(await page.locator('.table-skeleton>span').count(),15);assert.equal(await page.locator('.loading-wave i').first().evaluate(e=>getComputedStyle(e).animationName),'loading-beat');
 await page.waitForTimeout(230);await shot('compare-loading');pass('进入对比表显示声波、流动条与随列数变化的骨架');
 await page.locator('[data-back]').click();await page.locator('.wall-word').first().waitFor();await page.waitForTimeout(720);assert.equal(await page.locator('.matrix').count(),0);assert.equal(await page.locator('.selected-chip').count(),2);pass('加载时返回会取消延迟展示，并保留选择');
 await page.locator('#compare-button').click();await page.locator('.matrix').waitFor();assert.equal(await page.locator('.matrix-wrap').evaluate(e=>getComputedStyle(e).animationName),'table-reveal');assert.equal(await page.locator('[data-keyword-row]').count(),2);pass('加载完成后平滑展开准确的两词对比');
 await page.locator('[data-evidence="s2:craft"]').click();const row=page.locator('.inline-evidence');await row.locator('.source-angles summary').click();assert.equal(await row.locator('.source-angles span').count(),7);assert.equal(await row.locator('.source-angles .in-comparison').count(),2);assert.match(await row.locator('.source-angles').innerText(),/影像表达/);pass('一篇内容展示全部七个已整理角度，并标识本次两行');await page.locator('[data-close-inline]').click();
 assert.match(await page.locator('.empty-cell').first().innerText(),/当前未整理到对应证据/);pass('空格不再断言取得文本未涉及该主题');
 await page.locator('.matrix [data-evidence="s2:craft"]').click();assert.match(await page.locator('.inline-evidence').innerText(),/作曲简略/);await page.locator('[data-close-inline]').click();pass('动画后仍能展开对应观点的准确原句');
 await page.locator('[data-back]').first().click();await page.locator('.wall-word').first().waitFor();for(const id of ['imagery','rescue','realism']){await page.locator(`[data-view="${id}"]`).click();await page.locator(`#keyword-dialog [data-add="${id}"]`).click();await page.locator('[data-close-word]').click();}
 await page.setViewportSize({width:390,height:844});await page.locator('#compare-button').click();await page.locator('.compare-loading').waitFor();assert.equal(await page.locator('.table-skeleton>span').count(),42);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(220);await shot('compare-loading-mobile');await page.locator('.matrix').waitFor();assert.equal(await page.locator('[data-keyword-row]').count(),5);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('手机五词加载与五行表格均无页面溢出');
 await page.reload();await page.locator('.compare-loading').waitFor();await page.locator('.matrix').waitFor();assert.equal(await page.locator('[data-keyword-row]').count(),5);pass('刷新对比页也有加载过渡并保留五个词');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-back]').first().click();await page.locator('.wall-word').first().waitFor();await page.locator('#compare-button').click();await page.locator('.matrix').waitFor();assert.equal(await page.locator('.matrix-wrap').evaluate(e=>getComputedStyle(e).animationName),'none');pass('减少动态效果时直接显示表格');
 assert.deepEqual(errors,[]);pass('没有未捕获浏览器错误');
 await writeFile(new URL('./comparison-loading-results.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),checks,errors},null,2));
}finally{await browser.close();}
