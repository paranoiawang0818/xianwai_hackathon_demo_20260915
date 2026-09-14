import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const data=await read('../data/sources.json'),publicData=await read('../dist/data/demo.json');
const sourceIds=data.sources.map(s=>s.id),keyIds=data.keywords.map(k=>k.id),pairs=new Set();
assert.equal(new Set(sourceIds).size,sourceIds.length);assert.equal(new Set(keyIds).size,keyIds.length);
assert.equal(new Set(data.sources.map(s=>new URL(s.url).pathname)).size,data.sources.length,'重复来源');
for(const s of data.sources){assert(s.author.trim());assert(['article','answer'].includes(s.type));assert(s.title);assert(s.coverage.includes('非全文'));assert(!Number.isNaN(Date.parse(s.retrievedAt)));assert(['www.zhihu.com','zhuanlan.zhihu.com'].includes(new URL(s.url).hostname));assert(s.texts.some(t=>t.sourceUrl===s.url));}
for(const a of data.analyses){assert(sourceIds.includes(a.sourceId));assert(keyIds.includes(a.keywordId));assert(!pairs.has(a.sourceId+':'+a.keywordId));pairs.add(a.sourceId+':'+a.keywordId);assert(['sufficient','insufficient'].includes(a.status));assert(a.summary&&a.context&&a.voice);const s=data.sources.find(s=>s.id===a.sourceId),t=s.texts.find(t=>t.id===a.evidenceTextId);assert(t);assert.equal(t.method,'search zhihu');assert.equal(a.sourceUrl,s.url);if(a.quote)assert(t.text.includes(a.quote),`摘录无法回溯：${a.sourceId}/${a.keywordId}`);if(a.status==='sufficient')assert(a.quote);}
for(const id of keyIds)assert(data.analyses.some(a=>a.keywordId===id&&a.status==='sufficient'));
for(const k of data.keywords){const f=k.frequency;assert.equal(f.count,f.matches.length);assert.equal(f.sourceCount,new Set(f.matches.map(m=>m.sourceId)).size);const locations=new Set();for(const m of f.matches){const s=data.sources.find(s=>s.id===m.sourceId),t=s.texts.find(t=>t.id===s.frequencyTextId);assert.equal(t.id,m.textId);assert.equal(t.text.slice(m.offset,m.offset+m.term.length),m.term);assert(f.patterns.includes(m.term));const location=m.textId+':'+m.offset;assert(!locations.has(location));locations.add(location);}}

assert(data.analyses.some(a=>a.status==='insufficient'));assert(data.analyses.length<data.sources.length*data.keywords.length);
assert.deepEqual(publicData,{...data,sources:data.sources.map(({texts,authorVerifiedFrom,...rest})=>rest)});
assert(!JSON.stringify(publicData).includes('CommentInfoList'));assert(!JSON.stringify(publicData).includes('Access Secret'));
assert(data.analyses.find(a=>a.sourceId==='s1'&&a.keywordId==='imitation').voice.includes('过去'));
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
for(const path of ['styles.css','app.js','data/demo.json'])await readFile(new URL('../dist/'+path,import.meta.url));
assert(html.includes('lang="zh-CN"'));
console.log(`PASS: ${data.sources.length} 个真实来源 / ${data.keywords.length} 个有依据的关键词 / ${data.analyses.length} 条可追溯分析；短摘录、覆盖范围、作者、链接、稀疏矩阵与公开数据隔离均通过。`);
