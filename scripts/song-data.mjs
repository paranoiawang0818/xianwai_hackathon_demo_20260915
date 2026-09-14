import {createHash} from 'node:crypto';
export const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s《》“”「」_?？!！·.。\-]/g,'');
export const songId=query=>'song-'+createHash('sha256').update(normalize(query)).digest('hex').slice(0,16);
export function safeSourceUrl(raw){try{const url=new URL(raw);return url.protocol==='https:'&&((url.hostname==='www.zhihu.com'&&/^\/(?:question\/\d+\/)?answer\/\d+\/?$/.test(url.pathname))||(url.hostname==='zhuanlan.zhihu.com'&&/^\/p\/\d+\/?$/.test(url.pathname)))&&!url.username&&!url.password;}catch{return false;}}
export function collectSources(items,song,retrievedAt){
 const seen=new Set(),sources=[],excluded=[];const title=normalize(song.title),artist=normalize(song.creator||'');
 for(const item of items||[]){
  const text=String(item.ContentText||'').replace(/<\/?em>/gi,'');const contentTitle=String(item.Title||'').replace(/ - 知乎$/,'');const author=String(item.AuthorName||'').trim();const type=String(item.ContentType||'').toLowerCase();const url=String(item.Url||'');
  let reason='';
  if(!['article','answer'].includes(type)||!safeSourceUrl(url))reason='只纳入可追溯的知乎文章或回答';
  else if(!author)reason='作者未核实';
  else if(text.trim().length<140)reason='当前摘录过短，不足以比较';
  else if(!normalize(contentTitle+' '+text).includes(title))reason='未直接匹配歌曲名称';
  else if(!/歌|曲|音乐|旋律|歌词|编曲|听|Vocaloid|VOCALOID/i.test(contentTitle+' '+text))reason='缺少音乐语境';
  else if(artist&&!normalize(contentTitle+' '+text).includes(artist)&&!normalize(contentTitle).includes(title))reason='创作者或歌曲指向不足';
  else if(/^(歌词[：:]?|.*歌词欣赏)/.test(contentTitle))reason='纯歌词内容不纳入';
  else if(song.id==='dystopia'&&/pt[.\s]*2/i.test(contentTitle))reason='不同歌曲版本';
  const key=safeSourceUrl(url)?new URL(url).origin+new URL(url).pathname:url;
  if(seen.has(key))reason='重复来源';
  if(reason){excluded.push({title:contentTitle,url:safeSourceUrl(url)?url:null,reason});continue;}
  seen.add(key);const id='s'+(sources.length+1),textId='search:'+id;
  sources.push({id,title:contentTitle,author,type,url,scope:normalize(contentTitle).includes(title)?'歌曲相关讨论':'延伸讨论 · 提及该曲',intro:'实时检索所得，需结合原文语境阅读。',retrievedAt,coverage:'搜索摘录，非全文',frequencyTextId:textId,texts:[{id:textId,method:'search zhihu',retrievedAt,coverage:'搜索 ContentText 摘录，非全文',text,sourceUrl:url}]});
  if(sources.length===6)break;
 }
 return {sources,excluded};
}
const stop=new Set('这个 那个 一种 一个 一些 所以 但是 因为 就是 其实 可以 还是 已经 没有 什么 怎么 这样 那样 然后 现在 觉得 感觉 比较 非常 可能 自己 我们 他们 大家 你们 时候 之后 之前 一直 真的 不是 而且 只是 也是 这些 那些 其中 多少 如何 评价 知乎 歌曲 音乐 作者 回答 原文 以及 对于 来说 如果 当然 不能 应该 进行 不过 这么 那么 今天 目前 每个 发现 认为 许多 听到 一首 这首 这首歌 这篇 文章 一样 还有 这样子'.split(' '));
function matchedText(source){return source.texts.find(t=>t.id===source.frequencyTextId);}
function frequency(sources,patterns){const matches=[];for(const source of sources){const t=matchedText(source);const regex=new RegExp(patterns.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|'),'gu');for(const match of t.text.matchAll(regex))matches.push({sourceId:source.id,textId:t.id,offset:match.index,term:match[0]});}return {count:matches.length,sourceCount:new Set(matches.map(m=>m.sourceId)).size,patterns,matches,method:'exact_alias_nonoverlap'};}
function quoteAround(text,offset,max=88){let start=Math.max(0,offset-22);const punctuation=Math.max(text.lastIndexOf('。',offset),text.lastIndexOf('\n',offset));if(punctuation>=start)start=punctuation+1;return text.slice(start,Math.min(text.length,start+max)).trim();}
export function extractiveDataset(song,sources,excluded,retrievedAt){
 return {schemaVersion:2,song:{...song,edition:'实时检索'},preparedAt:retrievedAt,analysisMode:'pending',keywords:[],sources,analyses:[],excluded,limitations:[`${sources.length} 篇文章与回答来自本次搜索，非全文，不代表全部知乎讨论。`,'已找到候选来源，观点分析尚未完成；不会用普通词频生成对比角度。','候选来源可能包含歌词或推荐内容，分析完成前请结合原文核对。','原文与交流入口仍在知乎；不收录评论。']};
}
export function parseModelOutput(result){let text=result?.choices?.[0]?.message?.content||result?.Data?.choices?.[0]?.message?.content;if(typeof text!=='string')throw Error('模型未返回可解析内容');text=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');return JSON.parse(text);}
export function applyGroundedAnalysis(base,output){
 if(!Array.isArray(output.keywords)||!Array.isArray(output.analyses))throw Error('分析结构不完整');const keywords=[],ids=new Set();
 for(const k of output.keywords.slice(0,16)){if(typeof k.id!=='string'||!/^[a-z0-9_-]{1,30}$/.test(k.id)||ids.has(k.id)||typeof k.label!=='string'||k.label.length<2||k.label.length>8||!Array.isArray(k.patterns))continue;const patterns=[...new Set(k.patterns.filter(p=>typeof p==='string'&&p.length>=2&&p.length<=12&&base.sources.some(s=>matchedText(s).text.includes(p))))].slice(0,16);if(!patterns.length)continue;ids.add(k.id);keywords.push({id:k.id,label:k.label,description:'从本次摘录归纳',group:'不同的阅读角度',frequency:frequency(base.sources,patterns)});}
 const analyses=[],pairs=new Set();for(const a of output.analyses){const source=base.sources.find(s=>s.id===a.sourceId),key=keywords.find(k=>k.id===a.keywordId);if(!source||!key||pairs.has(a.sourceId+':'+a.keywordId))continue;const text=matchedText(source);if(typeof a.quote!=='string'||a.quote.length<8||a.quote.length>110||!text.text.includes(a.quote)||!key.frequency.patterns.some(term=>a.quote.includes(term))||typeof a.summary!=='string'||a.summary.length>180||typeof a.context!=='string'||a.context.length>500||typeof a.voice!=='string')continue;if(!['sufficient','insufficient'].includes(a.status))continue;pairs.add(a.sourceId+':'+a.keywordId);analyses.push({sourceId:source.id,keywordId:key.id,quote:a.quote,summary:a.summary,context:a.context+' 此为自动分析，可能误读语境，请结合原句核对。',voice:a.voice,status:a.status,summaryKind:'ai',evidenceTextId:text.id,sourceUrl:source.url});}
 const usedKeywords=keywords.filter(k=>analyses.some(a=>a.keywordId===k.id));if(usedKeywords.filter(k=>analyses.some(a=>a.keywordId===k.id&&a.status==='sufficient')).length<2)throw Error('通过证据校验的分析不足');
 return {...base,keywords:usedKeywords,analyses,analysisMode:'ai',limitations:[`${base.sources.length} 篇真实搜索摘录，非全文；不代表知乎全部内容。`,'AI 概括来自本次取得的文本，原句已做逐字校验；语境仍可能误读，请核对。','搜索可能混入同名曲目，原文中的作者观点、转述和过去立场需结合上下文。','空格表示当前摘录未涉及，不表示整篇没有讨论。']};
}
export function publicDataset(data){const {excluded,...rest}=data;const legacy=data.analysisMode==='extractive';return {...rest,...(legacy?{analysisMode:'pending',keywords:[],analyses:[],analysisNotice:'这首歌的旧结果尚未完成观点分析，可以复用已有材料重新分析。',limitations:['候选来源来自知乎搜索摘录，非全文；旧版自动分词结果已停用。']}:{}),sources:data.sources.map(({texts,authorVerifiedFrom,...source})=>source)};}
