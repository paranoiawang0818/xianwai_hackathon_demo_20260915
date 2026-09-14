import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {collectSources,extractiveDataset,applyGroundedAnalysis,parseModelOutput,publicDataset,songId,normalize} from './song-data.mjs';
import {runCli,nextQuotaCycle} from './zhihu-provider.mjs';
const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const error=(code,message)=>Object.assign(Error(message),{code});
export function createSearchService({provider=runCli,runtimeDir=new URL('../data/runtime/',import.meta.url),now=()=>Date.now()}={}){
 let catalog,quota,busy=false;const cache=new Map();let quotaPromise;
 async function load(){if(catalog)return;catalog=await read(new URL('data/catalog.json',root));await mkdir(runtimeDir,{recursive:true});try{quota=await read(new URL('availability.json',runtimeDir));}catch{quota={};}for(const name of await readdir(runtimeDir)){if(!/^song-[a-f0-9]{16}\.json$/.test(name))continue;try{const d=await read(new URL(name,runtimeDir));if(d.song&&d.sources?.length)cache.set(d.song.id,d);}catch{}}}
 async function persistQuota(){await writeFile(new URL('availability.json',runtimeDir),JSON.stringify(quota,null,2));}
 async function available(signal){await load();if(quota.search&&now()-Date.parse(quota.search.checkedAt)<300000)return quota.search;
 if(!quotaPromise)quotaPromise=(async()=>{const result=await provider(['quota','--api-id','zhihu_search'],{signal});const q=result.Data?.find(x=>x.APIID==='zhihu_search');if(!q)throw error('QUOTA_UNKNOWN','暂时无法确认知乎搜索额度。');quota.search={remaining:q.RemainingQuota,total:q.TotalQuota,checkedAt:new Date(now()).toISOString(),resetAt:nextQuotaCycle()};await persistQuota();return quota.search;})().finally(()=>{quotaPromise=null;});return quotaPromise;}
 function entryFor(data){return {id:data.song.id,presetId:data.song.presetId||null,title:data.song.title,creator:data.song.creator||'',aliases:[data.song.title],status:'ready',sourceCount:data.sources.length,keywordCount:data.keywords.length,analysisMode:data.analysisMode||'curated',preparedAt:data.preparedAt,path:'/api/songs/'+data.song.id};}
 async function getCatalog(){await load();const songs=[];for(const s of catalog.songs){const cached=[...cache.values()].find(d=>d.song.presetId===s.id);if(cached){songs.push({...s,...entryFor(cached)});continue;}if(s.path){const d=await read(new URL('dist/'+s.path,root));songs.push({...s,sourceCount:d.sources.length,keywordCount:d.keywords.length});}else songs.push({...s,sourceCount:0,keywordCount:0});}for(const d of cache.values())if(!d.song.presetId)songs.push(entryFor(d));return {songs,availability:quota,searchScope:'知乎公开搜索索引，按需查询；不是已下载的完整音乐曲库'};}
 async function getSong(id){await load();if(cache.has(id))return publicDataset(cache.get(id));const s=catalog.songs.find(s=>s.id===id);if(s?.path){const d=await read(new URL('dist/'+s.path,root));d.song.id=s.id;return d;}return null;}
 async function search(input,{signal,onProgress=()=>{}}={}){
 await load();input=input||{};const query=typeof input.query==='string'?input.query.trim():'';if(query.length<2||query.length>100||/[\x00-\x1f]/.test(query))throw error('INVALID_QUERY','请输入 2–100 个字符的歌名，可同时填写创作者。');
 const preset=input.presetId?catalog.songs.find(s=>s.id===input.presetId):catalog.songs.find(s=>s.aliases.some(a=>normalize(a)===normalize(query)));
 if(input.presetId&&!preset)throw error('INVALID_QUERY','预设歌曲不存在。');const id=songId(preset?preset.title+' '+preset.creator:query);
 onProgress({stage:'cache',completed:0,total:4,message:'正在查找已整理的歌曲…'});
 if(preset?.path){const d=await getSong(preset.id);return {dataset:d,entry:(await getCatalog()).songs.find(s=>s.id===preset.id),cached:true};}
 if(cache.has(id))return {dataset:publicDataset(cache.get(id)),entry:entryFor(cache.get(id)),cached:true};
 if(busy)throw error('BUSY','另一首歌正在整理中，请完成或取消当前任务后重试。');busy=true;
 try{
 onProgress({stage:'search',completed:1,total:4,message:'正在检索知乎公开文章与回答…'});
 const q=await available(signal);if(q.remaining===0)throw error('QUOTA_EXHAUSTED',`今日知乎搜索额度已用完（${q.total}/${q.total}）。已缓存歌曲仍可使用，新增歌曲需待额度恢复后重试。`);
 const lookup=preset?`${preset.title} ${preset.creator} 歌曲 评价`: `${query} 歌曲 评价`;
 let response;try{response=await provider(['search','zhihu','--query',lookup,'--count','10'],{signal});}catch(e){if(e.code==='30001'){quota.search={...quota.search,checkedAt:'1970-01-01T00:00:00Z'};const status=await available(signal);if(status.remaining===0)throw error('QUOTA_EXHAUSTED','今日知乎搜索额度已用完，已有缓存仍可使用。');throw error('RATE_LIMITED','知乎暂时限制了请求频率，已停止检索，请稍后手动重试。');}throw e;}
 quota.search.remaining=Math.max(0,quota.search.remaining-1);await persistQuota();
 const retrievedAt=new Date(now()).toISOString();const parts=query.split(/\s*[-—–]\s*/);const spaced=query.split(/\s+/);const hasChineseParts=spaced.length>1&&/^[\p{Script=Han}]+$/u.test(spaced[0]);const title=preset?.title||query.match(/《([^》]+)》/)?.[1]||(parts.length>1?parts[0]:hasChineseParts?spaced[0]:query);const creator=preset?.creator||(parts.length>1?parts.slice(1).join(' - '):hasChineseParts?spaced.slice(1).join(' '):'');const song={id,presetId:preset?.id||null,title,creator,query,metadataOrigin:preset?'用户指定预设':'用户输入检索主题，歌曲身份未经目录核验'};
 onProgress({stage:'filter',completed:2,total:4,message:'正在去重、核对歌曲指向并提取原句…'});
 const {sources,excluded}=collectSources(response.Data?.Items,song,retrievedAt);
 if(!sources.length)throw error('NO_EVIDENCE','本次没有取得足够、可署名的相关文章或回答。可以在歌名后补充创作者再试；这不代表知乎没有相关内容。');
 let data=extractiveDataset(song,sources,excluded,retrievedAt);let analysisNotice='';
 onProgress({stage:'analysis',completed:3,total:4,message:'正在整理阅读角度，并校验每条证据…'});
 try{if(quota.analysis?.remaining===0&&Date.parse(quota.analysis.resetAt)>now())throw error('ANALYSIS_QUOTA','分析额度用完');const prompt=await readFile(new URL('prompts/runtime-analysis.md',root),'utf8');const context=JSON.stringify({song, sources:sources.map(s=>({id:s.id,title:s.title,author:s.author,text:s.texts[0].text.slice(0,2400)}))});const answer=await provider(['answer','--model','zhida-fast-1p5','--query',prompt+'\n资料：\n'+context,'--timeout','100s'],{signal,timeout:105000});data=applyGroundedAnalysis(data,parseModelOutput(answer));}catch(e){if(signal?.aborted)throw e;if(e.code==='30001'){try{const response=await provider(['quota','--api-id','zhida_openai'],{signal});const a=response.Data?.find(q=>q.APIID==='zhida_openai');if(a){quota.analysis={remaining:a.RemainingQuota,total:a.TotalQuota,checkedAt:new Date(now()).toISOString(),resetAt:nextQuotaCycle()};await persistQuota();}}catch{}}analysisNotice='自动观点分析暂不可用，当前展示有出处的原句预览，未生成作者结论。';}
 if(data.keywords.length<2)throw error('NO_EVIDENCE','取得的文本不足以生成两个有效角度，请补充创作者或使用其他歌曲。');
 if(signal?.aborted)throw error('CANCELLED','已取消');
 data.analysisNotice=analysisNotice;const file=new URL(id+'.json',runtimeDir),temp=new URL(id+'.tmp',runtimeDir);await writeFile(temp,JSON.stringify(data,null,2));await rename(temp,file);cache.set(id,data);
 return {dataset:publicDataset(data),entry:entryFor(data),cached:false};
 }finally{busy=false;}
 }
 return {getCatalog,getSong,search};
}
