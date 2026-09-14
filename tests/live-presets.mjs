// Actual local service and actual acquired song data. No HTTP/provider mocks.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173';
const output=new URL('./screenshots/',import.meta.url);await mkdir(output,{recursive:true});
const catalog=await (await fetch(base+'/api/catalog')).json();
const presets=catalog.songs.filter(s=>['反乌托邦','I LOVE U','白石溪'].includes(s.title));assert.equal(presets.length,3);assert(presets.every(s=>s.status==='ready'));
const checks=['真实目录三首歌全部可读，额度已恢复'],errors=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/?v=expanded#search');await page.locator('#song-query').waitFor();assert.equal(await page.locator('[data-example]').count(),3);
 await page.screenshot({path:fileURLToPath(new URL('search.png',output)),fullPage:true});
 for(const entry of presets){
  const data=await (await fetch(base+(entry.id==='dystopia'?'/data/demo.json':'/api/songs/'+entry.id))).json();
  const research=JSON.parse(await readFile(new URL(entry.id==='dystopia'?'../data/sources.json':'../data/runtime/'+entry.id+'.json',import.meta.url),'utf8'));
  assert.equal(data.keywords.length,entry.id==='dystopia'?16:entry.presetId==='baishixi'?14:12);
  for(const a of data.analyses){const source=research.sources.find(s=>s.id===a.sourceId),text=source.texts.find(t=>t.id===a.evidenceTextId);if(a.quote)assert(text.text.includes(a.quote));assert.equal(a.sourceUrl,source.url);}
  assert(data.sources.every(s=>!s.texts));
  await page.locator('#song-query').fill(entry.title);await page.locator('#song-query').press('Enter');await page.locator(`[data-open-song="${entry.id}"]`).click();await page.locator('#song-title').waitFor();assert.equal(await page.locator('#song-title').innerText(),entry.title);
  const ids=data.keywords.slice(0,5).map(k=>k.id);
  for(const id of ids){await page.locator(`[data-view="${id}"]`).click();assert.match(await page.locator('#word-detail').innerText(),/AI 概括/);await page.locator(`#keyword-dialog [data-add="${id}"]`).click();await page.locator('[data-close-word]').click();}
  const sixth=data.keywords[5].id;await page.locator(`[data-view="${sixth}"]`).click();await page.locator(`#keyword-dialog [data-add="${sixth}"]`).click();assert.match(await page.locator('#word-selection-message').innerText(),/最多选择 5/);await page.locator('[data-close-word]').click();
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:width===1440?1050:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const boxes=await page.locator('.wall-word').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,id:el.dataset.keyword,size:parseFloat(getComputedStyle(el.querySelector('.word-label')).fontSize)};}));
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(!(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y),'word overlap: '+entry.title+' '+width);const ca=data.keywords.find(k=>k.id===a.id).frequency.count,cb=data.keywords.find(k=>k.id===b.id).frequency.count;if(ca>cb)assert(a.size>b.size);if(ca===cb)assert.equal(a.size,b.size);}
   if(width!==320)await page.screenshot({path:fileURLToPath(new URL(entry.id+'-'+width+'-wall.png',output)),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1050});await page.locator('#compare-button').click();await page.locator('.matrix').waitFor();assert.equal(await page.locator('[data-keyword-row]').count(),5);
  const evidence=page.locator('.matrix [data-evidence]').first(),pair=await evidence.getAttribute('data-evidence');await evidence.click();const [sid,kid]=pair.split(':'),a=data.analyses.find(a=>a.sourceId===sid&&a.keywordId===kid);assert((await page.locator('.inline-evidence').innerText()).includes(a.quote));assert.equal(await page.locator('.inline-evidence a.external').getAttribute('href'),a.sourceUrl);await page.locator('[data-close-inline]').click();
  await page.screenshot({path:fileURLToPath(new URL(entry.id+'-compare.png',output)),fullPage:true});
  await page.locator('[data-back]').first().click();await page.locator('.wall-word').first().waitFor();assert.equal(await page.locator('.selected-chip').count(),5);await page.locator(`[data-remove="${ids[0]}"]`).click();assert.equal(await page.locator('.selected-chip').count(),4);await page.locator('.wall-breadcrumb a').click();await page.locator('#song-query').waitFor();
  checks.push(`${entry.title}：${data.sources.length} 篇真实来源，${data.keywords.length} 词；引文核验、桌面/390/320 无重叠、字号随词频、五词上限、比较证据、原文 href、返回移除通过`);
 }
 await page.locator('#song-query').fill('I LOVE U');await page.locator('#song-query').press('Enter');await page.locator('.song-result').click();await page.locator('.wall-word').first().waitFor();assert.equal(await page.locator('.selected-chip').count(),0);checks.push('返回首页后重新进歌墙，选择清空');
 assert.deepEqual(errors,[]);checks.push('浏览器无未捕获错误');
 const result={at:new Date().toISOString(),browser:await browser.version(),checks,errors,note:'使用恢复额度后实际 CLI 取得的来源及准备阶段逐条核验分析，无模拟来源。只验证原文准确 href，不声称外部全文加载。'};
 await writeFile(new URL('./live-presets-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
