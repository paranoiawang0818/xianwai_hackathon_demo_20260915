import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {analysisConfig,answerFromBackup,analyseWithProviders} from '../scripts/analysis-provider.mjs';
import {createSearchService} from '../scripts/search-service.mjs';
const secret='fixture-key-not-a-real-secret';
const config=(provider='kimi',strategy='zhihu-first')=>analysisConfig({ANALYSIS_BACKUP_PROVIDER:provider,ANALYSIS_BACKUP_MODEL:'fixture-model',ANALYSIS_BACKUP_API_KEY:secret,ANALYSIS_STRATEGY:strategy});
const ok=content=>({choices:[{message:{content},finish_reason:'stop'}]});
const throws=code=>async()=>{throw Object.assign(Error('private vendor detail '+secret),{code});};
const saved=JSON.parse(await readFile(new URL('../data/sources.json',import.meta.url),'utf8'));
const answer=ok(JSON.stringify({keywords:saved.keywords.map(k=>({...k,patterns:k.frequency.patterns})),analyses:saved.analyses}));

test('Kimi and Zhipu receive only their own bearer key at the documented endpoint',async()=>{
 for(const [name,url] of [['kimi','https://api.moonshot.cn/v1/chat/completions'],['zhipu','https://open.bigmodel.cn/api/paas/v4/chat/completions']]){
  let request;const result=await answerFromBackup('给定知乎摘录',{config:config(name).backup,fetchImpl:async(endpoint,options)=>{request={endpoint,options};return Response.json(ok('{"keywords":[]}'));}});
  assert.equal(request.endpoint,url);assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,'Bearer '+secret);assert.equal(request.options.headers['X-Request-Timestamp'],undefined);
  assert.deepEqual(JSON.parse(request.options.body).messages,[{role:'user',content:'给定知乎摘录'}]);assert.equal(result.choices[0].message.content,'{"keywords":[]}');
 }
});
test('bad configuration never transmits a request; custom base URL appends one completion path',async()=>{
 for(const changes of [{secret:''},{model:''},{thinking:'typo'},{baseUrl:'http://example.com/v1'},{baseUrl:'https://user:pass@example.com/v1'},{baseUrl:'https://example.com/v1?key=secret'},{provider:'typo'}]){
  await assert.rejects(()=>answerFromBackup('text',{config:{...config().backup,...changes},fetchImpl:()=>assert.fail('must not send')}),e=>e.code==='BACKUP_CONFIG');
 }
 let url;await answerFromBackup('text',{config:{...config('compatible').backup,baseUrl:'https://example.com/v1/'},fetchImpl:async u=>{url=u;return Response.json(ok('{}'));}});assert.equal(url,'https://example.com/v1/chat/completions');
});
test('thinking mode is optional and disabled only when explicitly configured',async()=>{
 for(const thinking of ['default','disabled'])await answerFromBackup('text',{config:{...config().backup,thinking},fetchImpl:async(url,options)=>{assert.deepEqual(JSON.parse(options.body).thinking,thinking==='default'?undefined:{type:'disabled'});return Response.json(ok('{}'));}});
});
test('backup refuses authentication, rate, empty, malformed and truncated responses without leaking upstream text',async()=>{
 for(const [response,code] of [[new Response(secret,{status:400}),'INVALID_REQUEST'],[new Response(secret,{status:402}),'BILLING_ERROR'],[new Response(secret,{status:404}),'NOT_FOUND'],[new Response(secret,{status:401}),'AUTH_FAILED'],[new Response(secret,{status:429}),'RATE_LIMITED'],[Response.json({error:{message:secret}}),'UPSTREAM_ERROR'],[new Response(secret),'INVALID_RESPONSE'],[Response.json(ok('')),'EMPTY_RESPONSE'],[Response.json({choices:[{message:{content:'partial'},finish_reason:'length'}]}),'INCOMPLETE_RESPONSE']]){
  await assert.rejects(()=>answerFromBackup('text',{config:config().backup,fetchImpl:async()=>response}),e=>e.code===code&&!e.message.includes(secret));
 }
});
test('backup deadline includes response body; cancelling never invokes another provider',async()=>{
 const fetchImpl=async(url,{signal})=>new Response(new ReadableStream({start(c){signal.addEventListener('abort',()=>c.error(Error('aborted')),{once:true});}}));
 await assert.rejects(()=>answerFromBackup('text',{config:{...config().backup,timeout:10},fetchImpl}),e=>e.code==='TIMEOUT');
 await assert.rejects(()=>analyseWithProviders('text',{config:config(),zhihu:throws('CANCELLED'),backup:()=>assert.fail('must not switch'),validate:x=>x}),e=>e.code==='CANCELLED');
});
test('fallback occurs after request or evidence failure, with bounded attempts and honest provenance',async()=>{
 for(const code of ['TIMEOUT','INVALID_JSON','INSUFFICIENT_EVIDENCE']){
  const progress=[];let count=0;
  const result=await analyseWithProviders('text',{config:config(),zhihu:code==='TIMEOUT'?throws(code):async()=>({bad:true}),backup:async()=>{count++;return {good:true};},validate:x=>{if(x.bad)throw Object.assign(Error('bad'),{code});return x;},onProgress:p=>progress.push(p.message)});
  assert.equal(count,1);assert.equal(result.engine.provider,'kimi');assert(result.engine.fallbackUsed);assert.deepEqual(result.data,{good:true});assert(progress[1].includes('备用分析'));assert(!progress.join('').includes('Kimi'));assert.equal(result.attempts[0].code,code);assert(!JSON.stringify(result).includes(secret));
 }
 await assert.rejects(()=>analyseWithProviders('text',{config:config(),zhihu:throws('TIMEOUT'),backup:throws('AUTH_FAILED'),validate:x=>x}),e=>e.attempts.length===2&&e.code==='AUTH_FAILED'&&!JSON.stringify(e).includes(secret));
});
test('primary success skips backup; backup-first and backup-only skip unhealthy Zhihu when possible',async()=>{
 const normal=await analyseWithProviders('text',{config:config(),zhihu:async()=>({ok:true}),backup:()=>assert.fail('must not call'),validate:x=>x});assert.equal(normal.engine.provider,'zhihu');assert.equal(normal.engine.fallbackUsed,false);
 for(const strategy of ['backup-first','backup-only']){
  const result=await analyseWithProviders('text',{config:config('zhipu',strategy),zhihu:()=>assert.fail('must not call'),backup:async()=>({ok:true}),validate:x=>x});assert.equal(result.engine.provider,'zhipu');
 }
 let calls=0;await assert.rejects(()=>analyseWithProviders('text',{config:config('kimi','backup-only'),zhihu:()=>assert.fail('must not call'),backup:async()=>{calls++;return throws('TIMEOUT')();},validate:x=>x}),e=>e.code==='TIMEOUT');assert.equal(calls,1);
});
test('real excerpt fixture passes the complete service path after Zhihu failure, keeps sources and cache, and hides secrets',async()=>{
 const dir=await mkdtemp(tmpdir()+'/xianwai-backup-test-');let modelCalls=0;const calls=[];
 const service=createSearchService({runtimeDir:pathToFileURL(dir+'/'),analysisOptions:config(),backupProvider:async()=>{modelCalls++;return answer;},provider:async(args,options)=>{
  calls.push(args[0]);if(args[0]==='quota')return {Data:[{APIID:'zhihu_search',RemainingQuota:100,TotalQuota:100}]};
  if(args[0]==='search')return {Data:{Items:saved.sources.map(s=>({Title:s.title,AuthorName:s.author,ContentType:s.type,Url:s.url,ContentText:s.texts.find(t=>t.id===s.frequencyTextId).text}))}};
  assert.equal(options.timeout,25000);return throws('TIMEOUT')();
 }});
 try{
  const first=await service.search({query:'《反乌托邦》 评价'});assert.equal(first.entry.status,'ready');assert.equal(first.dataset.analysisEngine,undefined);assert(first.dataset.analyses.length>10);
  const stored=JSON.parse(await readFile(dir+'/'+first.entry.id+'.json','utf8'));assert.equal(stored.analysisEngine.provider,'kimi');assert(stored.analysisEngine.fallbackUsed);
  assert.deepEqual(first.dataset.sources.map(s=>s.url),saved.sources.map(s=>s.url));assert(first.dataset.sources.every(s=>!s.texts));assert(!JSON.stringify(first).includes(secret));
  const again=await service.search({query:'《反乌托邦》 评价'});assert(again.cached);assert.equal(modelCalls,1);assert.deepEqual(calls,['quota','search','answer']);
 }finally{await rm(dir,{recursive:true});}
});
