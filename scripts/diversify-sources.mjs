import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
function addSource(data,record,author,id){const item=record.Data.Items.find(s=>s.AuthorName===author);if(!item)throw Error('Missing author');let source=data.sources.find(s=>new URL(s.url).pathname===new URL(item.Url).pathname);if(source)return source;source={id,title:item.Title.replace(/ - 知乎$/,''),author:item.AuthorName,type:item.ContentType.toLowerCase(),url:item.Url,scope:'单曲解读',intro:'补充不同阅读方法的真实回答。',retrievedAt:record.retrievedAt,coverage:'搜索摘录，非全文',frequencyTextId:'supplement:'+id,texts:[{id:'supplement:'+id,method:'search zhihu',retrievedAt:record.retrievedAt,coverage:'搜索 ContentText 摘录，非全文',sourceUrl:item.Url,text:item.ContentText}]};data.sources.push(source);return source;}
function addAnalysis(data,sid,kid,quote,summary,context,voice='作者当前表达'){const s=data.sources.find(s=>s.id===sid),t=s.texts.find(t=>t.id===s.frequencyTextId);if(!t.text.includes(quote))throw Error('Missing quote '+sid+'/'+kid);const a={sourceId:sid,keywordId:kid,quote,summary,context,voice,status:'sufficient',evidenceTextId:t.id,sourceUrl:s.url};data.analyses=data.analyses.filter(x=>!(x.sourceId===sid&&x.keywordId===kid));data.analyses.push(a);}
function key(data,id,label,patterns){const k={id,label,description:'来自补充材料的阅读角度',group:'不同的阅读方法',frequency:{patterns,method:'exact_alias_nonoverlap'}};const i=data.keywords.findIndex(k=>k.id===id);if(i<0)data.keywords.push(k);else data.keywords[i]=k;}
function recount(data){for(const k of data.keywords){const patterns=[...new Set(k.frequency.patterns)],regex=new RegExp([...patterns].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu'),matches=[];for(const s of data.sources){const t=s.texts.find(t=>t.id===s.frequencyTextId);for(const m of t.text.matchAll(regex))matches.push({sourceId:s.id,textId:t.id,offset:m.index,term:m[0]});}k.frequency={...k.frequency,patterns,count:matches.length,sourceCount:new Set(matches.map(m=>m.sourceId)).size,matches};}}
const white=await read('data/runtime/song-398a1ab18ce9fb88.json'),wr=await read('data/raw/white-more.json');
addSource(white,wr,'果哥','s4');addSource(white,wr,'萧葳','s5');
key(white,'narrative','叙事留白',['框架','模糊','填充']);key(white,'classical','古典形式',['对仗','诗经','形式']);
addAnalysis(white,'s4','narrative','白石溪笔墨较清秀但是却给人模糊的印象。但我认为它是给我们一个框架，希望我们用思想去填充。','作者把模糊感理解为可由听者填充的叙事框架。','这是该答主的阅读方式，不证明词作者有意如此；后文包含大量自行补足的故事情景。');
addAnalysis(white,'s4','wording','而词中说轻解莲舟。显得不准确，可能小舟不押韵或莲舟形容和采莲舟一样小巧的舟。','作者先质疑“莲舟”的准确性，又提出押韵或舟形比喻的可能解释。','这些是作者提出的假设；前段地貌说法及词源未独立核实，不作为确定事实。');
addAnalysis(white,'s4','meaning','但我认为它是给我们一个框架，希望我们用思想去填充。','作者倾向于通过想象补足故事，从字面之外寻找连贯解释。','区别于逐字判定准确性，这是一种允许读者参与补全的解读方法，不补造完整官方剧情。');
addAnalysis(white,'s5','classical','这一首不论从形式上（通篇对仗）、还是内容上（叙事风格很像诗经），都是非常标准的「古」。','作者从对仗形式与类似《诗经》的叙事风格理解本曲的古典感。','这是其个人的形式比较，不等于歌曲严格符合古代诗体规范。');
addAnalysis(white,'s5','standard','这一首不论从形式上（通篇对仗）、还是内容上（叙事风格很像诗经），都是非常标准的「古」。','作者把形式与叙事风格作为欣赏古风词的两个维度。','与另一位答主反对直接套用四言诗格式的意见可并读，但二者并非必然对立。');
addAnalysis(white,'s5','emotion','接着是一场轰轰烈烈且异常浪漫的告白：','作者把接下来的歌词段落理解成浪漫而强烈的告白。','下文用古诗的誓言作类比；这不是歌曲作者意图的独立核实。');
// Add the actual comparison term used in this source, then recount transparently.
white.keywords.find(k=>k.id==='emotion').frequency.patterns.push('告白');
white.limitations[0]='4 篇来自不同作者的真实搜索摘录，非全文，不代表全部知乎讨论。';white.limitations[1]='包含情感体验、评价标准、字词辨析、叙事留白及古典形式比较；推荐清单与纯歌词未纳入。';
recount(white);await writeFile(new URL('data/runtime/'+white.song.id+'.json',root),JSON.stringify(white,null,2));
const d=await read('data/sources.json'),dr=await read('data/raw/dystopia-more.json');addSource(d,dr,'C6H4Cl2','s6');
// Replace the narrow production-detail subtopic (already represented in craft)
// with the new listener's distinct music/lyrics mismatch reading.
d.analyses=d.analyses.filter(a=>a.keywordId!=='production');key(d,'production','词曲错位',['错位','奔流']);d.keywords.find(k=>k.id==='video').label='影像表达';d.keywords.find(k=>k.id==='video').frequency.patterns=['手持摄像','实拍','PV','pv','快闪','长镜头'];
addAnalysis(d,'s6','production','头一回听《反乌托邦》，我便感到了一种明显的错位。','作者初听时感到曲调、歌词与 PV 之间存在错位。','下文把奔流的曲调与压抑的词、城中村影像并置；属于个人听觉联想，不是制作错误的判定。');
addAnalysis(d,'s6','video','而对于连续编排的音符，我反而觉得长镜头好于快闪；','作者偏好用长镜头呈现连续音符，而非逐音符快闪。','这是从本曲延伸到该 P 主若干作品 PV 的个人节奏偏好，不能当作剪辑的普遍规则。');
addAnalysis(d,'s6','imagery','门锁、楼道和铁网不断出现的画面，我脑中错位的感觉反而上来了。','作者将门锁、楼道与铁网的视觉意象同曲调联想并读。','这些是该答主对 PV 画面的描述，歌墙没有声称独立逐帧核实视频。');
d.keywords.find(k=>k.id==='imagery').frequency.patterns.push('画面');
d.limitations=d.limitations.map(s=>s.replace(/5 篇/g,'6 篇').replace(/五篇/g,'六篇'));
recount(d);await writeFile(new URL('data/sources.json',root),JSON.stringify(d,null,2));
console.log('补充完成：白石溪 4 位作者 / 14 词；反乌托邦 6 位作者 / 16 词。');
