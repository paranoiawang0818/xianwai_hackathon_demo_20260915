import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {answerFromZhihu,cliFailure} from '../scripts/zhihu-provider.mjs';
import {createSearchService} from '../scripts/search-service.mjs';
import {publicDataset} from '../scripts/song-data.mjs';
const saved=JSON.parse(await readFile(new URL('../data/sources.json',import.meta.url),'utf8'));
const answer={choices:[{message:{content:JSON.stringify({keywords:saved.keywords.map(k=>({...k,patterns:k.frequency.patterns})),analyses:saved.analyses})}}]};
const query='《反乌托邦》 音乐评价';
const search={Code:0,Data:{Items:saved.sources.map(s=>({Title:s.title,AuthorName:s.author,ContentType:s.type,Url:s.url,ContentText:s.texts.find(t=>t.id===s.frequencyTextId).text}))}};
const quota={Code:0,Data:[{APIID:'zhihu_search',RemainingQuota:10,TotalQuota:10}]};
function sse(text){return new Response(new ReadableStream({start(controller){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
test('native Zhihu analysis handles split UTF-8, CRLF, heartbeats and final content',async()=>{
 let request;
 const response=await answerFromZhihu('仅分析给定材料',{secret:'test-only-secret',fetchImpl:async(url,options)=>{request={url,options};return sse(': keep-alive\r\n\r\ndata: '+JSON.stringify({choices:[{delta:{reasoning_content:'不当作结果',content:'{"中文":'}}]})+'\r\n\r\ndata: '+JSON.stringify({choices:[{delta:{content:'true}'},finish_reason:'stop'}]})+'\r\n\r\ndata: [DONE]\r\n\r\n');}});
 assert.equal(response.choices[0].message.content,'{"中文":true}');assert.equal(request.url,'https://developer.zhihu.com/v1/chat/completions');assert.equal(request.options.headers.Authorization,'Bearer test-only-secret');assert.equal(JSON.parse(request.options.body).stream,true);
});
test('empty, broken and erroneous upstream responses never count as successful analysis',async()=>{
 for(const [body,code] of [[': keep-alive\n\n','INCOMPLETE_RESPONSE'],['data: [DONE]\n\n','EMPTY_RESPONSE'],['data: {"error":{"message":"private upstream detail"}}\n\n','UPSTREAM_ERROR'],['data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n','INCOMPLETE_RESPONSE']])await assert.rejects(()=>answerFromZhihu('test',{secret:'test',fetchImpl:async()=>sse(body)}),e=>e.code===code&&!e.message.includes('private'));
 await assert.rejects(()=>answerFromZhihu('test',{secret:'test',fetchImpl:async()=>new Response('',{status:401})}),e=>e.code==='AUTH_FAILED');
 assert.equal(cliFailure({error:{code:'NETWORK_ERROR'}}).message,'知乎接口网络请求失败');
});
test('deadline covers waiting for the stream body and user cancellation is distinct',async()=>{
 const fetchImpl=async(url,{signal})=>new Response(new ReadableStream({start(controller){if(signal.aborted)controller.error(Error('aborted'));else signal.addEventListener('abort',()=>controller.error(Error('aborted')),{once:true});}}),{headers:{'content-type':'text/event-stream'}});
 await assert.rejects(()=>answerFromZhihu('test',{secret:'test',timeout:10,fetchImpl}),e=>e.code==='TIMEOUT');
 const controller=new AbortController();controller.abort();await assert.rejects(()=>answerFromZhihu('test',{secret:'test',signal:controller.signal,fetchImpl}),e=>e.code==='CANCELLED');
});
test('manual retry reuses archived excerpts; old failures recover without another search',async()=>{
 const dir=await mkdtemp(tmpdir()+'/xianwai-recovery-test-');let now=Date.now(),answerCalls=0;const calls=[];
 const service=createSearchService({runtimeDir:pathToFileURL(dir+'/'),now:()=>now,provider:async args=>{calls.push(args[0]);if(args[0]==='quota')return quota;if(args[0]==='search')return search;if(++answerCalls===1)throw Object.assign(Error('test'),{code:'NETWORK_ERROR'});return answer;}});
 try{
  const failed=await service.search({query});const input={query,retryAnalysis:true,songId:failed.entry.id};
  await assert.rejects(()=>service.search(input),e=>e.code==='RETRY_LATER');now+=31000;
  const recovered=await service.search(input);assert.equal(recovered.dataset.analysisMode,'ai');assert.equal(recovered.entry.status,'ready');assert(recovered.dataset.analyses.length>10);assert.equal(recovered.dataset.analysisIssue,undefined);assert.deepEqual(calls,['quota','search','answer','answer']);
  assert.equal((await service.search(input)).cached,true);assert.equal(answerCalls,2);
  const stored=JSON.parse(await readFile(dir+'/'+failed.entry.id+'.json','utf8'));assert(stored.sources.every(s=>s.texts.length));assert(recovered.dataset.sources.every(s=>!s.texts));
 }finally{await rm(dir,{recursive:true});}
});
test('legacy extractive caches are hidden as unanalysed sources and can be retried',async()=>{
 const dir=await mkdtemp(tmpdir()+'/xianwai-legacy-test-');const id='song-0123456789abcdef';
 const legacy={...saved,song:{...saved.song,id,query},analysisMode:'extractive',keywords:[{id:'bad',label:'你是'}],analyses:[]};
 try{await writeFile(dir+'/'+id+'.json',JSON.stringify(legacy));const service=createSearchService({runtimeDir:pathToFileURL(dir+'/'),provider:async args=>{assert.equal(args[0],'answer');return answer;}});
  const view=await service.getSong(id);assert.equal(view.analysisMode,'pending');assert.deepEqual(view.keywords,[]);assert.equal((await service.getCatalog()).songs.find(s=>s.id===id).status,'needs_analysis');
  assert.equal((await service.search({query,songId:id,retryAnalysis:true})).dataset.analysisMode,'ai');
  assert.deepEqual(publicDataset(saved).keywords,saved.keywords);
 }finally{await rm(dir,{recursive:true});}
});
