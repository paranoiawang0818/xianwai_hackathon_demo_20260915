const $ = (s) => document.querySelector(s);
const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main = $('#main'), selection = $('#selection'), dialog = $('#evidence-dialog'), wordDialog = $('#keyword-dialog');
let wordOrigin;
let catalog=[], availability={}, searchState={status:'idle'}, searchController, requestVersion=0, currentSongId='dystopia';
const datasets=new Map(), songSelections={};
let data, active = 'resonance', selected = [], searchQuery = '', searchSubmitted = false, toastTimer, evidenceOrigin;
let compareTimer, renderVersion=0;
let focusedAngle=null, inlineOrigin;
const desktopReading=()=>window.matchMedia('(min-width: 900px)').matches;
const wordColors=['#2563cb','#37856c','#a06c20','#6772b7','#ad5876','#8254a7','#377f8c','#a86443','#426694','#657b32','#9b5362','#357a75','#6c5bb0','#966333','#a14878','#44769b'];
const wordColor=id=>wordColors[Math.max(0,data.keywords.findIndex(k=>k.id===id))%wordColors.length];
const isSearch = () => !['#wall','#compare'].includes(location.hash);
const keyword = id => data.keywords.find(k => k.id === id);
const source = id => data.sources.find(s => s.id === id);
const analysis = (sid,kid) => data.analyses.find(a => a.sourceId === sid && a.keywordId === kid);
const related = kid => data.analyses.filter(a => a.keywordId === kid);
const analysisPending = () => ['extractive','pending'].includes(data?.analysisMode);
const isCompare = () => !analysisPending() && location.hash === '#compare' && selected.length >= 2;
const avatar = s => `<span class="avatar" aria-hidden="true">${escape(s.author.slice(0,1))}</span>`;
const sourceLink = s => `<a class="external" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="查看知乎原文：${escape(s.author)}的${s.type==='article'?'文章':'回答'}">查看知乎原文 ↗</a>`;
const quoteHTML = a => a.quote ? `<blockquote class="quote"><span class="quote-label">原文短摘录</span><p>${escape(a.quote)}</p></blockquote>` : '';
const analysisLabel=a=>a.summaryKind==='extractive'?'原句预览 · 自动截取':'AI 概括';
const aiHTML = a => `<p class="ai-summary"><span class="ai-label">${analysisLabel(a)}</span>${escape(a.summary)}</p>`;
function announce(message) { if(wordDialog.open&&$('#word-selection-message')){$('#word-selection-message').textContent=message;$('#word-selection-message').classList.add('limit-warning');} clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200); }
function save() { try {songSelections[currentSongId]={active,selected:[...selected]};sessionStorage.setItem('songwall-state-v2',JSON.stringify({currentSongId,songSelections}));}catch{} }
function resetSearchSession(){
 requestVersion++;searchController?.abort();searchController=null;
 searchQuery='';searchSubmitted=false;searchState={status:'idle'};
 selected=[];focusedAngle=null;active=data.keywords[0]?.id;
 for(const id of Object.keys(songSelections))delete songSelections[id];
 save();
}
function toggle(id) {
  if (analysisPending() || !keyword(id)) return;
  const adding=!selected.includes(id);
  if (selected.includes(id)) selected = selected.filter(k => k !== id);
  else if (selected.length === 5) { announce('最多选择 5 个关键词，请先移除一个再添加。'); return; }
  else selected.push(id);
  clearTimeout(toastTimer); $('#toast').classList.remove('show'); if($('#word-selection-message')){$('#word-selection-message').textContent=`已选 ${selected.length} / 5 个关键词`;$('#word-selection-message').classList.remove('limit-warning');} save(); renderSelection(adding?id:null);
  document.querySelectorAll('[data-add]').forEach(btn => { const on=selected.includes(btn.dataset.add); btn.textContent=on?'✓ 已加入 · 移除':'+ 加入对比'; btn.setAttribute('aria-pressed',String(on)); btn.setAttribute('aria-label',`${on?'移除对比词':'加入对比'}：${keyword(btn.dataset.add).label}`); });
  document.querySelectorAll('.keyword').forEach(el => el.classList.toggle('selected',selected.includes(el.dataset.keyword)));
  if(isCompare()) render();
}
function goCompare() { if(analysisPending()){announce('观点分析尚未完成，请先阅读来源或重新分析。');return;} if(selected.length<2){announce('至少选择 2 个关键词才能比较。');return;} location.hash='compare'; }
function setActive(id,origin) {
  if(!keyword(id)) return; active=id; save(); renderDetail(); wordOrigin=origin;
  document.querySelectorAll('.keyword').forEach(el => el.classList.toggle('active',el.dataset.keyword===id));
  document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===id)));
  wordDialog.style.setProperty('--reading-accent',wordColor(id));
  if(!wordDialog.open){if(desktopReading())wordDialog.show();else wordDialog.showModal();}
  wordDialog.scrollTop=0;document.body.style.overflow=desktopReading()?'':'hidden';
}
function notes() {return `<details class="data-details"><summary>关于这面歌墙的数据与边界 · ${escape(data.preparedAt?.slice(0,10)||"")}</summary><p>${data.limitations.map(text=>escape(text.replaceAll('当前摘录未涉及','当前未整理到对应证据'))).join('<br>')}</p><p>这里只比较一篇具体内容中的表达。AI 概括需结合原句与上下文阅读，点击原文只表示进一步阅读，并不代表已经建立人际连接。提问、评论与交流请回到知乎的原有语境。</p><a href="${currentSongId==='dystopia'?'data/demo.json':'/api/songs/'+currentSongId}" target="_blank" rel="noopener">查看本地展示数据 ↗</a></details><footer class="page-footer"><span>弦外 XIANWAI · 一首歌，不止一种听法</span><span>独立黑客松原型，非知乎官方产品 · 内容版权归原作者所有</span></footer>`;}
function normalizeQuery(value){return String(value).normalize('NFKC').toLowerCase().replace(/[\s《》“”「」_?？!！·.。\-]/g,'');}
function localMatches(query){const needle=normalizeQuery(query);return catalog.filter(song=>[song.title,song.creator,song.title+' '+song.creator,...(song.aliases||[]),...(datasets.get(song.id)?.keywords.map(k=>k.label)||[])].some(v=>normalizeQuery(v).includes(needle)));}
function artTone(song){return song.id==='dystopia'?'blue':song.presetId==='i-love-u'||song.title==='I LOVE U'?'rose':song.presetId==='baishixi'||song.title==='白石溪'?'sage':['blue','rose','sage'][String(song.id).length%3];}
function recordArt(tone,extra=''){return `<span class="record-art tone-${tone} ${extra}" aria-hidden="true"><span class="art-grid"></span><span class="art-orbit"></span><span class="art-disc"><span class="disc-label"><i></i></span></span><span class="art-line"></span><span class="art-caption">MUSIC / WORDS</span></span>`;}
function resultCard(song){const pending=song.status==='needs_analysis';return `<button class="song-result" data-open-song="${escape(song.id)}" aria-label="${pending?'查看来源：':song.status==='ready'?'进入':'检索'}${escape(song.title)}${pending?'':'关键词歌墙'}">${recordArt(artTone(song))}<span class="result-info"><span class="result-type"><i aria-hidden="true"></i>${pending?'已找到来源 · 分析未完成':song.status==='ready'?'已整理 · 可直接阅读':'预设歌曲 · 等待整理'}</span><strong>${escape(song.title)}</strong><span class="result-author">${escape(song.creator||'按输入主题检索')}</span><span class="result-stats">${pending?`${song.sourceCount} 篇候选内容 · 可阅读原文或重新分析`:song.status==='ready'?`${song.sourceCount} 篇知乎文章与回答 · ${song.keywordCount} 个角度`:'尚未取得足够的知乎讨论，不预填观点'}</span></span><span class="result-action">${pending?'查看来源与重试':song.status==='ready'?'走进这面歌墙':'检索这首歌'} <b aria-hidden="true">↗</b></span></button>`;}
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const loadingWave=()=>'<span class="loading-wave" aria-hidden="true">'+Array.from({length:9},(_,i)=>`<i style="--beat:${i}"></i>`).join('')+'</span>';
function beginLoading(query,details={}){
 searchController?.abort();const controller=new AbortController();searchController=controller;
 const token={controller,version:++requestVersion,started:performance.now()};
 searchState={status:'loading',query,completed:0,...details};renderSearchResult();return token;
}
async function finishLoading(token,minimum=650){
 const signal=token.controller.signal,remaining=reducedMotion()?0:Math.max(0,minimum-(performance.now()-token.started));
 if(remaining&&!signal.aborted)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,remaining);signal.addEventListener('abort',done,{once:true});});
 return !signal.aborted&&token.version===requestVersion;
}
function renderSearchResult(){
 const target=$('#search-results');if(!target)return;
 if(searchState.status==='loading'){
  const step=searchState.completed||0;
  const local=searchState.mode==='local'||searchState.mode==='wall';
  target.innerHTML=`<div class="search-progress ${local?'local-progress':'live-progress'}" aria-busy="true"><div class="loading-visual">${loadingWave()}<span>${local?'一面歌墙，正在展开':'寻找这首歌的不同读法'}</span></div><div class="progress-heading">${local?'':'<span class="progress-spinner" aria-hidden="true"></span>'}<strong>${escape(searchState.message||'正在准备检索…')}</strong><button class="text-button" data-cancel-search>取消</button></div>${local?'<div class="loading-sweep" aria-hidden="true"><i></i></div>':`<div class="stage-track" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${step}" aria-valuetext="已完成 ${step} 个阶段，共 4 个；当前阶段等待返回">${['查找缓存','检索来源','筛选文本','整理证据'].map((name,i)=>`<span class="stage-segment ${i<step?'done':i===step?'running':''}"><i></i><b>${name}</b></span>`).join('')}</div>`}<p>当前：${escape(searchState.query)}。${local?'读取已整理的内容。':'进度表示处理阶段；请求返回后才进入下一步。'}</p></div>`;return;
 }
 if(searchState.status==='error'){target.innerHTML=`<div class="search-no-result" role="status"><h2>${searchState.code==='QUOTA_EXHAUSTED'?'今天的搜索额度已用完':searchState.code==='NO_EVIDENCE'?'还没有足够的可用材料':'这次检索没有完成'}</h2><p>${escape(searchState.message)}</p><div class="search-error-actions"><button class="small-button" data-retry-search>重试这次检索</button><button class="text-button" data-show-presets>查看已有歌曲</button></div></div>`;return;}
 if(searchState.status==='cancelled'){target.innerHTML='<p class="search-message" role="status">已取消本次等待，已整理的内容仍保留。你可以重新搜索。</p>';return;}
 if(!searchSubmitted){target.innerHTML=`<div class="result-meta">从这些歌开始 <span>${catalog.filter(s=>s.status==='ready').length} 首已整理 · 也可以搜索其他歌曲</span></div><div class="preset-list">${catalog.map(resultCard).join('')}</div>`;return;}
 const q=searchQuery.trim();if(!q){target.innerHTML='<p class="search-message">请输入歌名或创作者。</p>';return;}
 const songs=searchState.results||localMatches(q);
 target.innerHTML=`<div class="result-meta">${songs.length} 个结果 <span>原文与讨论来自知乎</span></div><div class="preset-list">${songs.map(resultCard).join('')}</div><button class="search-more" data-live-search>继续检索知乎中的「${escape(q)}」 →</button><p class="search-result-note">预设只是起点。其他歌曲按需检索，材料足够时生成歌墙并缓存。</p>`;
}
function cancelSearch(){requestVersion++;searchController?.abort();searchController=null;searchState={status:'cancelled'};renderSearchResult();$('#song-query')?.focus();}
async function runLiveSearch(query,presetId,retryOptions=searchState.retryOptions||{}){
 const token=beginLoading(query,{presetId,retryOptions,message:retryOptions.retryAnalysis?'正在读取已有材料，准备重新分析…':'正在查找歌曲与缓存…'}),{controller,version}=token;
 const handle=async(event,value)=>{if(version!==requestVersion)return;if(event==='progress'){searchState={...searchState,...value};renderSearchResult();}if(event==='error'){searchState={status:'error',query,presetId,retryOptions,...value};renderSearchResult();}if(event==='complete'){
  if(!await finishLoading(token))return;
  datasets.set(value.entry.id,value.dataset);const presetIndex=catalog.findIndex(s=>s.id===presetId);const existing=catalog.findIndex(s=>s.id===value.entry.id);if(presetIndex>=0)catalog[presetIndex]={...catalog[presetIndex],...value.entry};else if(existing>=0)catalog[existing]=value.entry;else catalog.push(value.entry);
  searchState={status:'done',results:[value.entry]};searchSubmitted=true;searchQuery=query;renderSearchResult();save();
 }};
 try{const response=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json','X-Songwall-Request':'1'},body:JSON.stringify({query,presetId,...retryOptions}),signal:controller.signal});if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('检索服务暂时不可用，请稍后重试。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
  while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let end;while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);const event=frame.match(/^event: (.+)$/m)?.[1],body=frame.match(/^data: (.+)$/m)?.[1];if(event&&body)await handle(event,JSON.parse(body));}}
  if(version===requestVersion&&searchState.status==='loading')throw Error('检索连接中断，没有返回完成结果，请重试。');
 }catch(error){if(version!==requestVersion||error.name==='AbortError')return;searchState={status:'error',code:'NETWORK_ERROR',query,presetId,retryOptions,message:error.message};renderSearchResult();}
 finally{if(version===requestVersion)searchController=null;}
}
async function submitSearch(query){
 searchController?.abort();requestVersion++;searchQuery=query.slice(0,100);searchSubmitted=true;searchState={status:'idle'};save();
 if(!searchQuery.trim()){searchController=null;renderSearchResult();return;}
 const matches=localMatches(searchQuery);if(!matches.length){runLiveSearch(searchQuery);return;}
 const token=beginLoading(searchQuery,{mode:'local',message:'正在查找已整理的歌曲…'});
 if(!await finishLoading(token,520))return;
 searchController=null;searchState={status:'done',results:matches};renderSearchResult();
}
async function openSong(id){
 const song=catalog.find(s=>s.id===id);if(!song)return;
 if(!['ready','needs_analysis'].includes(song.status)){searchQuery=song.title;$('#song-query').value=song.title;searchSubmitted=true;runLiveSearch(song.title,song.id);return;}
 const token=beginLoading(song.title,{mode:'wall',openId:id,message:'正在展开关键词与原文证据…'});
 try{
  let next=datasets.get(id);
  if(!next){const response=await fetch(song.path||'/api/songs/'+id,{signal:token.controller.signal});if(!response.ok)throw Error('这首歌的缓存暂时无法读取。');next=await response.json();}
  if(!await finishLoading(token,700))return;
  datasets.set(id,next);save();currentSongId=id;data=next;const state=songSelections[id];selected=(state?.selected||[]).filter(k=>data.keywords.some(word=>word.id===k));active=state?.active&&data.keywords.some(k=>k.id===state.active)?state.active:data.keywords[0]?.id;
  searchController=null;searchState={status:'done',results:[song]};save();location.hash='wall';
 }catch(error){if(token.version!==requestVersion||token.controller.signal.aborted)return;searchState={status:'error',message:error.message,code:'CACHE_ERROR',query:song.title,openId:id};renderSearchResult();}
 finally{if(token.version===requestVersion)searchController=null;}
}
function renderSearch(){
 selection.innerHTML='';const quota=availability.search;const status=quota?.remaining===0?'今日新增检索额度已用完 · 已缓存歌曲可用':'连接知乎公开搜索 · 按需整理并缓存';
 main.innerHTML=`<div class="search-page"><section class="search-intro"><div class="intro-copy"><div class="search-eyebrow"><span></span> A GALLERY OF DIFFERENT VOICES</div><h1>一首歌，<br><span>不止一种听法。</span></h1><p class="intro-description">从音乐出发，在知乎的文字里，<br>发现另一种理解，和想继续读下去的作者。</p><form class="search-form" role="search" id="song-search"><label class="sr-only" for="song-query">搜索歌名或创作者</label><span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span><input type="search" id="song-query" name="q" maxlength="100" value="${escape(searchQuery)}" placeholder="搜一首歌，或一位创作者" autocomplete="off"><button class="primary" type="submit">搜索 <span aria-hidden="true">↗</span></button></form><div class="search-suggestions"><span>试着搜</span>${catalog.filter(s=>s.id==='dystopia'||s.id==='i-love-u'||s.id==='baishixi'||s.presetId).map(s=>`<button data-example="${escape(s.title)}">${escape(s.title)}</button>`).join('')}</div><p class="search-service-status ${quota?.remaining===0?'quota-low':''}">${status}</p></div><div class="hero-exhibit" aria-hidden="true"><span class="exhibit-coordinate">EXHIBITION / 001</span><div class="hero-record">${recordArt('blue')}<span class="record-sleeve-title">一首歌的<br><b>很多种读法</b><small>XIANWAI — OPEN TO INTERPRETATION</small></span></div><span class="exhibit-note">旋律之外，文字之间。</span><span class="exhibit-annotation">音乐与文字的视觉意象</span></div></section><section id="search-results" class="search-results" aria-label="歌曲搜索结果" aria-live="polite"></section><footer class="search-footer"><p>已整理的歌曲可以直接阅读；新歌曲取决于检索范围、额度与可用文本。</p><span>独立黑客松 Demo · 非知乎官方产品 · 检索知乎公开内容，并非完整音乐目录</span></footer></div>`;
 $('#song-search').addEventListener('submit',e=>{e.preventDefault();submitSearch($('#song-query').value);});renderSearchResult();
}
function wordSizing(k){
 const counts=data.keywords.map(word=>word.frequency.count), min=Math.min(...counts), max=Math.max(...counts);
 const ratio=max===min?0.5:(k.frequency.count-min)/(max-min);
 return `--size-desktop:${(30+ratio*34).toFixed(2)}px;--size-tablet:${(24+ratio*22).toFixed(2)}px;--size-mobile:${(21+ratio*15).toFixed(2)}px;--size-small:${(18+ratio*12).toFixed(2)}px`;
}
function frequencyDetails(k){
 const f=k.frequency, counts=f.patterns.map(term=>({term,count:f.matches.filter(m=>m.term===term).length})).filter(x=>x.count);
 return `<details class="frequency-details"><summary>出现 ${f.count} 次 · 覆盖 ${f.sourceCount} 篇 · 查看统计口径</summary><p>关键词是归纳标签，次数按对应词语在已收录摘录中的字面匹配统计：${counts.map(x=>`<span>${escape(x.term)} × ${x.count}</span>`).join('、')}。</p><p>每篇只选一份搜索摘录，重复检索不累加；含作者转引歌词与回顾旧立场的提及，不含评论。次数不代表观点赞同、全文词频或全网热度。</p></details>`;
}
function renderPendingAnalysis(){
 selected=[];selection.innerHTML='';
 main.innerHTML=`<div class="page"><div class="wall-breadcrumb"><a href="#search">← 返回搜索</a><span>${escape(data.song.title)} / 已找到的来源</span></div><section class="song-strip"><div><div class="eyebrow">来源已保留</div><h1>${escape(data.song.title)}</h1><p>${escape(data.song.creator||'知乎中的歌曲讨论')}</p></div></section><section class="search-no-result" role="status"><h2>找到了内容，观点分析尚未完成</h2><p>${escape(data.analysisNotice||'知乎直答本次未完成分析。你可以先阅读来源，稍后重新分析已有材料。')}</p><div class="search-error-actions"><button class="small-button" id="retry-analysis">重新分析已有材料</button><a class="text-button" href="#search">返回搜索</a></div><p>本次重试不重复搜索；只调用知乎直答整理已取得的摘录。分析通过后再生成关键词和对照阅读。</p>${data.analysisIssue?`<details><summary>查看本次状态</summary><p>${escape(data.analysisIssue.code)} · ${escape(data.analysisIssue.checkedAt)}</p></details>`:''}</section><section class="source-list" aria-label="已找到的候选来源">${data.sources.map(s=>`<article class="source-card"><div class="author-line">${avatar(s)}<span>${escape(s.author)}</span><span class="type">${s.type==='article'?'文章':'回答'}</span></div><h3>${escape(s.title)}</h3><p>候选来源，观点与语境尚待整理。</p><span class="scope">${escape(s.coverage)}</span><div class="source-actions">${sourceLink(s)}</div></article>`).join('')}</section>${notes()}</div>`;
 $('#retry-analysis').addEventListener('click',()=>{const query=data.song.query||data.song.title,options={retryAnalysis:true,songId:currentSongId};searchQuery=query;searchSubmitted=true;history.pushState(null,'','#search');render();runLiveSearch(query,undefined,options);});
}
function renderWall() {
  if(analysisPending()){renderPendingAnalysis();return;}
  main.innerHTML=`<div class="page wall-page"><div class="wall-breadcrumb"><a href="#search">← 返回搜索</a><span>搜索 / ${escape(data.song.title)} / 关键词歌墙</span></div><section class="song-strip" aria-labelledby="song-title"><div><div class="eyebrow">${currentSongId==='dystopia'?'已整理歌墙':'歌曲阅读'}</div><h1 id="song-title">${escape(data.song.title)}</h1><p>${escape(data.song.creator||'按输入主题检索')} <span class="sep">/</span> ${data.analysisMode==='extractive'?'原句预览 · 观点待核验':'知乎中的歌曲讨论'}</p></div><div class="song-context"><span class="tiny-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><p>${data.sources.length} 篇知乎文章与回答 <span class="sep">·</span> ${data.keywords.length} 个探索角度<br><span>基于搜索摘录，非全文</span></p></div></section><section class="word-wall" aria-label="关键词歌墙"><div class="word-wall-heading"><h2>关键词歌墙</h2><p>点击一个词，读一读它背后的表达。</p><span>选择 2–5 个词进行比较</span></div><div class="word-canvas ${data.keywords.length>8||currentSongId!=='dystopia'?'auto-layout':''}" aria-label="彩色关键词墙">${data.keywords.map((k,i)=>`<button class="keyword wall-word word-${['resonance','craft','imagery','rescue','realism','imitation','visibility','traffic'][i%8]} ${selected.includes(k.id)?'selected':''}" style="${wordSizing(k)};--word-color:${['#2563cb','#37856c','#a06c20','#6772b7','#ad5876','#8254a7','#377f8c','#a86443','#426694','#657b32','#9b5362','#357a75','#6c5bb0','#966333','#a14878','#44769b'][i%16]}" data-keyword="${k.id}" data-view="${k.id}" aria-label="查看关键词：${escape(k.label)}" aria-haspopup="dialog" aria-pressed="false" title="${escape(k.label)} · 出现 ${k.frequency.count} 次 · ${related(k.id).length} 篇相关内容"><span class="word-label">${escape(k.label)}</span><sup class="word-frequency" aria-hidden="true">${k.frequency.count}</sup><span class="word-check" aria-hidden="true">✓</span></button>`).join('')}</div><div class="word-wall-footer"><span>每个词，都是一种读法。</span><p>字号越大，对应表达在已收录摘录中出现越多。右上角为次数，详情可查看统计口径。</p></div></section>${notes()}</div>`;
  document.querySelectorAll('.wall-word').forEach((el,i)=>el.style.setProperty('--word-delay',Math.min(i*22,330)+'ms'));
  const invitation=document.createElement('aside');invitation.className='wall-invitation';invitation.innerHTML='<span class="detail-kicker">READING ROOM / 阅读角落</span><div class="invitation-glyph" aria-hidden="true">“</div><h2>哪个词，<br>让你想多读一点？</h2><p>点击墙上的词语，在这里读它背后的表达。</p><div class="invitation-steps"><span>01　读原句，看看不同的理解</span><span>02　留下 2–5 个好奇的角度</span><span>03　把具体文章放在一起对照</span></div><small>每个观点都有出处，每段文字都有语境。</small>';
  $('.wall-page').append(invitation);
  renderSelection();
}
function renderDetail() {
  const k=keyword(active), entries=related(active).slice().sort((a,b)=>(b.status==='sufficient')-(a.status==='sufficient'));
  $('#word-detail').innerHTML=`<div class="detail-header"><button class="close-button close-word" aria-label="关闭关键词详情" data-close-word>×</button><div class="detail-kicker">正在查看 / KEYWORD</div><div class="detail-title-row"><h2 id="word-title">${escape(k.label)}</h2><button class="small-button" data-add="${k.id}" aria-label="${selected.includes(k.id)?'移除对比词':'加入对比'}：${escape(k.label)}" aria-pressed="${selected.includes(k.id)}">${selected.includes(k.id)?'✓ 已加入 · 移除':'+ 加入对比'}</button></div><p>${entries.length} 篇相关内容 · 原句与 ${data.analysisMode==='extractive'?'自动截取说明':'AI 概括'}分开阅读</p>${frequencyDetails(k)}<p class="selection-feedback" id="word-selection-message" role="status" aria-live="polite">已选 ${selected.length} / 5 个关键词</p></div><div class="source-list" tabindex="0" aria-label="${escape(k.label)}的相关来源，可滚动阅读">${entries.map(a=>{const s=source(a.sourceId);return `<article class="source-card"><div class="author-line">${avatar(s)}<span>${escape(s.author)}</span><span class="type">${s.type==='article'?'文章':'回答'}</span></div><h3>${escape(s.title)}</h3><span class="scope">${s.scope} · ${s.coverage}</span>${a.status==='insufficient'?'<div><span class="warning-label">证据不足 · 保留判断</span></div>':''}${quoteHTML(a)}${aiHTML(a)}<div class="source-actions"><button class="text-button" data-evidence="${s.id}:${k.id}">查看上下文</button>${sourceLink(s)}</div></article>`}).join('')}</div>`;
}
function renderSelection(addedId) {
  if(isCompare()||isSearch()||analysisPending()){selection.innerHTML='';return;}
  selection.innerHTML=`<section class="selection-bar" aria-label="已选关键词"><div class="selection-inner"><div class="selection-label">已选关键词 <strong aria-live="polite">${selected.length}<span style="font-size:12px;color:#8a9ab0"> / 5</span></strong><small>至少 2 个即可开始比较</small></div><div class="selected-chips">${selected.length?selected.map(id=>`<button class="selected-chip" data-remove="${id}" aria-label="取消选择：${escape(keyword(id).label)}">${escape(keyword(id).label)}<span aria-hidden="true">×</span></button>`).join(''):'<span class="selection-empty">把好奇的角度，放到这里。</span>'}</div><button class="primary" id="compare-button" ${selected.length<2?'disabled':''}>${selected.length<2?`再选 ${2-selected.length} 个词开始比较`:'进入对比墙 →'}</button></div></section>`;
  selection.querySelectorAll('[data-remove]').forEach(el=>el.style.setProperty('--chip-color',wordColor(el.dataset.remove)));
  if(addedId)selection.querySelector(`[data-remove="${CSS.escape(addedId)}"]`)?.classList.add('just-added');
}
function comparisonSources(){return data.sources.map((s,index)=>({s,index,matches:selected.map(k=>analysis(s.id,k)).filter(Boolean)})).filter(r=>r.matches.length).sort((a,b)=>b.matches.filter(x=>x.status==='sufficient').length-a.matches.filter(x=>x.status==='sufficient').length||b.matches.length-a.matches.length||a.index-b.index).map(r=>r.s);}
function sourceAngles(s){
 const angles=data.keywords.filter(k=>data.analyses.some(a=>a.sourceId===s.id&&a.keywordId===k.id));
 return `<details class="source-angles"><summary>本篇已整理 ${angles.length} 个角度</summary><div>${angles.map(k=>`<span class="${selected.includes(k.id)?'in-comparison':''}">${escape(k.label)}</span>`).join('')}</div><p>依据已取得的摘录整理，不是全文分类；蓝色为本次对比角度。</p></details>`;
}
function loadComparison(version){
 const rows=comparisonSources();selection.innerHTML='';
 main.innerHTML=`<div class="page"><section class="compare-top"><button class="back-button" data-back>← 返回歌墙，调整关键词</button></section><section class="compare-loading" role="status" aria-live="polite" aria-busy="true">${loadingWave()}<h1>正在展开对比墙</h1><p>把 ${rows.length} 篇内容，按 ${selected.length} 个角度放在一起。</p><div class="compare-loading-keywords">${selected.map(id=>`<span class="static-chip">${escape(keyword(id).label)}</span>`).join('')}</div><div class="loading-sweep" aria-hidden="true"><i></i></div><div class="table-skeleton" aria-hidden="true" style="--skeleton-columns:${rows.length+1}">${Array.from({length:(rows.length+1)*(selected.length+1)},()=>'<span><i></i><i></i></span>').join('')}</div><p class="compare-loading-note">正在读取已整理的观点与证据。同一篇内容可以出现在多个角度下。</p></section></div>`;
 if(reducedMotion()){renderCompare();return;}
 compareTimer=setTimeout(()=>{if(version===renderVersion&&isCompare())renderCompare();},650);
}
function comparisonCell(s,id){
 const a=analysis(s.id,id);
 return `<td data-angle="${escape(id)}" data-source="${escape(s.id)}" style="--angle-color:${wordColor(id)}">${a?`<button class="cell-button" data-evidence="${escape(s.id)}:${escape(id)}" aria-expanded="false" aria-label="展开证据：${escape(s.author)} · ${escape(keyword(id).label)}">${a.status==='insufficient'?'<span class="warning-label">证据不足</span>':''}<span class="ai-label">${analysisLabel(a)}</span><span>${escape(a.summary)}</span><span class="cell-more">${a.quote?'展开原句与语境 ＋':'展开证据范围 ＋'}</span></button>`:'<div class="empty-cell"><span aria-hidden="true">—</span>当前未整理到对应证据<small>不代表原文没有讨论</small></div>'}</td>`;
}
function renderCompare(){
 const sources=comparisonSources();focusedAngle=null;
 main.innerHTML=`<div class="page comparison-gallery transposed-gallery"><section class="compare-top"><div class="compare-toolbar"><button class="back-button" data-back>← 返回歌墙，调整关键词</button><span>${sources.length} 篇具体内容 / ${selected.length} 个阅读角度</span></div><div class="comparison-title"><div><div class="eyebrow">READING TOGETHER / 对照阅读</div><h1>${escape(data.song.title)}<span>的不同读法</span></h1></div><p>横向看同一个词的不同表达<br>纵向读一篇内容的多个角度</p></div><div class="focus-toolbar"><span id="focus-status" role="status">点击左侧关键词，聚焦一个角度</span><button class="text-button" data-clear-focus hidden>恢复全部角度 ↗</button></div></section><div class="matrix-wrap" tabindex="0" role="region" aria-label="对照阅读表：文章横向排列，关键词纵向排列，可上下及左右滚动"><table class="matrix" style="--comparison-count:${sources.length};--table-width:${180+sources.length*270}px;--mobile-table-width:${138+sources.length*218}px"><colgroup><col style="width:180px">${sources.map(()=>'<col>').join('')}</colgroup><thead><tr><th scope="col"><span class="source-index">KEYWORDS ↓</span>关键词<small>文章 / 回答 →</small></th>${sources.map((s,i)=>`<th scope="col" data-source-column="${escape(s.id)}"><div class="source-column-heading"><span class="source-index">${String(i+1).padStart(2,'0')} / ${s.type==='article'?'文章':'回答'}</span><div class="author-line">${avatar(s)}<span>${escape(s.author)}</span></div><h3>${escape(s.title)}</h3><span class="scope">${escape(s.scope)}</span>${sourceLink(s)}</div></th>`).join('')}</tr></thead><tbody>${selected.map(id=>`<tr class="source-band keyword-band" data-keyword-row="${escape(id)}"><th scope="row" data-angle="${escape(id)}" style="--angle-color:${wordColor(id)}"><button class="angle-heading" data-focus-angle="${escape(id)}" aria-pressed="false"><span>${escape(keyword(id).label)}</span><small>${escape(keyword(id).group)}</small><span class="focus-hint">聚焦这一行 →</span></button></th>${sources.map(s=>comparisonCell(s,id)).join('')}</tr>`).join('')}</tbody></table></div><p class="compare-note">每列对应一篇具体文章或回答，不代表作者的全部立场；每行对应一个关键词。空格可能来自摘录不全或尚未整理。点击观点，在当前关键词行下方展开该篇内容的原句与上下文。</p>${notes()}</div>`;
 renderSelection();
}
function focusAngle(id){
 focusedAngle=id&&id!==focusedAngle?id:null;
 document.querySelectorAll('[data-angle]').forEach(el=>{el.classList.toggle('angle-muted',!!focusedAngle&&el.dataset.angle!==focusedAngle);el.classList.toggle('angle-focused',el.dataset.angle===focusedAngle);});
 document.querySelectorAll('[data-focus-angle]').forEach(el=>{const on=el.dataset.focusAngle===focusedAngle;el.setAttribute('aria-pressed',String(on));el.querySelector('.focus-hint').textContent=on?'正在聚焦 · 再点恢复':'聚焦这一行 →';});
 $('#focus-status').textContent=focusedAngle?'正在聚焦「'+keyword(focusedAngle).label+'」；其他角度仍可阅读':'点击左侧关键词，聚焦一个角度';
 $('[data-clear-focus]').hidden=!focusedAngle;
}
function closeInlineEvidence(restore=true){
 $('.inline-evidence-row')?.remove();
 document.querySelectorAll('.cell-button[aria-expanded="true"]').forEach(el=>el.setAttribute('aria-expanded','false'));
 if(restore&&inlineOrigin?.isConnected){inlineOrigin.focus({preventScroll:true});inlineOrigin.scrollIntoView({block:'nearest',inline:'nearest'});}
}
function showInlineEvidence(key,origin){
 if(origin.getAttribute('aria-expanded')==='true'){closeInlineEvidence();return;}
 const [sid,kid]=key.split(':'),a=analysis(sid,kid),s=source(sid);if(!a||!s)return;
 closeInlineEvidence(false);inlineOrigin=origin;origin.setAttribute('aria-expanded','true');
 const row=document.createElement('tr');row.className='inline-evidence-row';
 row.innerHTML=`<td colspan="${origin.closest('table').tHead.rows[0].cells.length}"><section class="inline-evidence" tabindex="-1" aria-label="${escape(s.author)}关于${escape(keyword(kid).label)}的证据" style="--angle-color:${wordColor(kid)}"><header><div><span class="detail-kicker">${escape(keyword(kid).label)} / 原句与语境</span><h2>${escape(s.author)}的这段表达</h2><p class="inline-source-title">${escape(s.title)}</p></div><button class="close-button" data-close-inline aria-label="收起行内证据">×</button></header><div class="inline-evidence-columns"><div>${aiHTML(a)}${quoteHTML(a)}${a.status==='insufficient'?'<span class="warning-label">现有证据不足，保留判断</span>':''}</div><div><span class="voice">${escape(a.voice)}</span><p class="context-label">上下文说明 · AI 整理</p><p class="context">${escape(a.context)}</p><p class="context-label">证据覆盖</p><p class="context">${a.status==='sufficient'?'当前摘录支持上面的局部概括，不代表全文结论。':'现有文本不足以支持更完整的判断，请结合知乎原文阅读。'}</p></div></div><div class="inline-source-angles">${sourceAngles(s)}</div><footer><span>知乎搜索摘录，非全文 · ${escape(s.retrievedAt.slice(0,10))} · 未纳入评论</span>${sourceLink(s)}</footer></section></td>`;
 origin.closest('tr').after(row);
 const panel=row.querySelector('.inline-evidence');panel.style.setProperty('--evidence-width',$('.matrix-wrap').clientWidth+'px');panel.focus({preventScroll:true});panel.scrollIntoView({block:'nearest',inline:'nearest',behavior:reducedMotion()?'instant':'smooth'});
}
function showEvidence(key,origin){
 if(isCompare()&&origin?.closest('.matrix')){showInlineEvidence(key,origin);return;}
 const [sid,kid]=key.split(':'),a=analysis(sid,kid),s=source(sid);if(!a||!s)return;evidenceOrigin=origin;
 $('#dialog-content').innerHTML=`<div class="dialog-head"><div><div class="detail-kicker">${escape(keyword(kid).label)} / 证据与语境</div><h2 id="dialog-title">读回这段表达</h2></div><button class="close-button" aria-label="关闭证据" data-close>×</button></div><div class="dialog-body"><div class="author-line">${avatar(s)}<span>${escape(s.author)}</span><span class="type">${s.type==='article'?'文章':'回答'}</span></div><h3>${escape(s.title)}</h3><span class="scope">${s.scope}</span>${a.status==='insufficient'?'<div><span class="warning-label">现有证据不足，保留判断</span></div>':''}${aiHTML(a)}${quoteHTML(a)}<span class="voice">${escape(a.voice)}</span><p class="context-label">上下文说明 · AI 整理</p><p class="context">${escape(a.context)}</p><p class="context-label">证据覆盖</p><p class="context">${a.status==='sufficient'?'当前摘录足以支持上面的局部概括，不代表全文结论。':'现有文本不足以支持更完整的判断，请结合知乎原文阅读。'}</p></div><div class="dialog-footer"><p>来源：知乎搜索摘录，非全文<br>检索于 ${escape(s.retrievedAt.slice(0,10))} · 未纳入评论</p>${sourceLink(s)}</div>`;
 dialog.showModal();document.body.style.overflow='hidden';
}
function render(){clearTimeout(compareTimer);const version=++renderVersion;const view=isSearch()?'search':isCompare()?'compare':'wall';if(view!=='wall'&&wordDialog.open)wordDialog.close();document.body.dataset.view=view;document.querySelectorAll('[data-step]').forEach(el=>{if(el.dataset.step===view)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});document.title=isSearch()?'弦外 · 一首歌，不止一种听法':'弦外 · '+data.song.title;if(isSearch())renderSearch();else if(isCompare())loadComparison(version);else renderWall();}
main.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.openSong){openSong(b.dataset.openSong);return;}if(b.hasAttribute('data-cancel-search')){cancelSearch();return;}if(b.hasAttribute('data-retry-search')){if(searchState.openId)openSong(searchState.openId);else runLiveSearch(searchState.query||searchQuery,searchState.presetId);return;}if(b.hasAttribute('data-show-presets')){searchState={status:'idle'};searchSubmitted=false;renderSearchResult();return;}if(b.hasAttribute('data-live-search')){runLiveSearch(searchQuery);return;}if(b.hasAttribute('data-example')){$('#song-query').value=b.dataset.example||'反乌托邦';submitSearch($('#song-query').value);}if(b.hasAttribute('data-focus-angle')){focusAngle(b.dataset.focusAngle);return;}if(b.hasAttribute('data-clear-focus')){focusAngle(null);return;}if(b.hasAttribute('data-close-inline')){closeInlineEvidence();return;}if(b.dataset.view)setActive(b.dataset.view,b);if(b.dataset.add)toggle(b.dataset.add);if(b.dataset.evidence)showEvidence(b.dataset.evidence,b);if(b.hasAttribute('data-back'))location.hash='wall';});
selection.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.remove){const id=b.dataset.remove;toggle(id); const next=selection.querySelector('[data-remove]')||$('#compare-button');next?.focus();}if(b.id==='compare-button')goCompare();});
wordDialog.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.add)toggle(b.dataset.add);if(b?.dataset.evidence)showEvidence(b.dataset.evidence,b);if(b?.hasAttribute('data-close-word'))wordDialog.close();if(e.target===wordDialog){const r=wordDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)wordDialog.close();}});
wordDialog.addEventListener('close',()=>{if(wordDialog.open)return;document.body.style.overflow=dialog.open?'hidden':'';document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed','false'));if(wordOrigin?.isConnected)wordOrigin.focus();});
dialog.addEventListener('click',e=>{if(e.target.closest('[data-close]'))dialog.close();if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{document.body.style.overflow=wordDialog.open&&!desktopReading()?'hidden':'';if(evidenceOrigin?.isConnected)evidenceOrigin.focus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open){if(isCompare()&&$('.inline-evidence-row'))closeInlineEvidence();else if(wordDialog.open&&desktopReading())wordDialog.close();}});
window.addEventListener('resize',()=>{const panel=$('.inline-evidence');if(panel)panel.style.setProperty('--evidence-width',$('.matrix-wrap').clientWidth+'px');});
window.matchMedia('(min-width: 900px)').addEventListener('change',()=>{if(!wordDialog.open)return;wordDialog.close();queueMicrotask(()=>{if(location.hash==='#wall')setActive(active,wordOrigin);});});
window.addEventListener('hashchange',()=>{if(!data)return;if(!isSearch()&&searchController)cancelSearch();if(dialog.open)dialog.close();if(wordDialog.open)wordDialog.close();clearTimeout(toastTimer);$('#toast').classList.remove('show');if(isSearch())resetSearchSession();if(location.hash==='#compare'&&selected.length<2){history.replaceState(null,'','#wall');announce('至少选择 2 个关键词才能比较。');}render();window.scrollTo(0,0);main.focus({preventScroll:true});});
async function init(){const started=performance.now();try{
 const response=await fetch('data/demo.json');if(!response.ok)throw Error('data');data=await response.json();data.song.id='dystopia';datasets.set('dystopia',data);
 const catalogResponse=await fetch('/api/catalog');if(!catalogResponse.ok)throw Error('service');const info=await catalogResponse.json();catalog=info.songs;availability=info.availability||{};
 try{const restored=!isSearch()&&JSON.parse(sessionStorage.getItem('songwall-state-v2'));if(restored){Object.assign(songSelections,restored.songSelections||{});if(catalog.some(s=>s.id===restored.currentSongId&&['ready','needs_analysis'].includes(s.status))){const id=restored.currentSongId;if(!datasets.has(id)){const r=await fetch('/api/songs/'+id);if(r.ok)datasets.set(id,await r.json());}if(datasets.has(id)){currentSongId=id;data=datasets.get(id);}}}}catch{}
 const state=songSelections[currentSongId];selected=(state?.selected||[]).filter(k=>data.keywords.some(word=>word.id===k)).slice(0,5);active=data.keywords.some(k=>k.id===state?.active)?state.active:data.keywords[0]?.id;
 if(isSearch())resetSearchSession();
 if(location.hash==='#compare'&&selected.length<2)history.replaceState(null,'','#wall');if(!reducedMotion())await new Promise(resolve=>setTimeout(resolve,Math.max(0,450-(performance.now()-started))));render();
 const context=document.modelContext;if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'configure_songwall_comparison',description:'在当前歌曲中选择2至5个有效关键词并进入对比。',inputSchema:{type:'object',properties:{keywordIds:{type:'array',items:{type:'string'},minItems:2,maxItems:5,uniqueItems:true}},required:['keywordIds'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){const ids=input?.keywordIds;if(!Array.isArray(ids)||ids.length<2||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>!keyword(id)))throw Error('请选择2至5个当前歌曲的关键词');selected=[...ids];save();history.pushState(null,'','#compare');render();return{view:'compare',song:data.song.title,keywords:selected};}})).catch(()=>{});}catch{}}
 }catch{main.innerHTML='<section class="error"><h1>弦外服务暂时没有打开</h1><p>请使用 npm start 启动最新本地服务，再重新加载页面。</p><button class="primary" id="retry">重新加载</button></section>';$('#retry').onclick=()=>location.reload();}}
init();
