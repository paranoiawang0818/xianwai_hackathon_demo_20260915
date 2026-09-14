// Reproducible preparation-stage AI review of actual CLI search excerpts.
// No network calls. Original acquired texts remain in data/raw/*-initial.json.
import {readFile,writeFile} from 'node:fs/promises';
import {applyGroundedAnalysis} from './song-data.mjs';
const root=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL('data/raw/'+name+'-initial.json',root),'utf8'));
const k=(id,label,patterns)=>({id,label,patterns});
const a=(sourceId,keywordId,quote,summary,context,voice='作者当前表达',status='sufficient')=>({sourceId,keywordId,quote,summary,context,voice,status});
async function save(base,ids,keywords,analyses,reason){
 const removed=base.sources.filter(s=>!ids.includes(s.id));base.sources=base.sources.filter(s=>ids.includes(s.id));
 if(base.song.title==='I LOVE U'){
  keywords.push(k('team','创作配合',['配合','铁三角']),k('outside','圈外传播',['圈外']),k('sweet','甜感',['糖']),k('direct','表白措辞',['表白','回应']),k('identity','身份认知',['虚拟歌姬','虚拟歌手']));
  // A one-character word is deliberately not used as a frequency pattern.
  keywords.find(k=>k.id==='sweet').patterns=['真.糖'];
  analyses.push(
   a('s2','team','但铁三角的默契配合可以弥补这部分差距。','作者认为成员间的默契能弥补其眼中的个别水准差距。','前文是作者对词作与绘画水准的主观比较，后文肯定 I LOVE U 对组合风格的呈现；不作为能力排名。'),
   a('s2','outside','I LOVE U，经典之作，偶尔在圈外也能听到它。','作者说自己偶尔能在圈外听到本曲。','这是个人观察，不能据此估算传播量或全体受众范围。'),
   a('s3','sweet','这歌也是阿良良为数不多的真.糖。','作者在自己的作品阅读中，将本曲视为比较纯粹的甜歌。','“糖”是该作者的感受性用语，和同一段的告白主题相连。'),
   a('s2','direct','其实我一直觉得拿“能不能回应我的问题”作为表白有点奇怪……','作者在肯定歌曲的同时，也对其中的表白措辞保留疑问。','这句话出现在对《心加心》呼应 I LOVE U 的讨论括号中；不是对整首歌的否定。'),
   a('s6','identity','当时我也并不知道洛天依是虚拟歌姬，所以我只是单纯的喜欢','作者回忆喜欢本曲发生在了解虚拟歌手身份之前。','这是其个人接触顺序，不推断其他人的认知或动机。','作者回顾个人经历')
  );
 }else{
  keywords.push(k('rhythm','四字节奏',['四字']),k('lasting','听感延续',['今天','小时候']),k('intro','简介辅助',['歌词简介']),k('agreement','局部认同',['赞同','分歧']),k('meaning','字义与意境',['具体含义','感受到']));
  analyses.push(
   a('s1','rhythm','尤其是中间的四字部分以及天依与阿绫的较长的发音','作者点名喜欢中间的四字部分。','四字部分与拉长唱法在同一听感叙述中出现，不额外推断具体节拍或作曲技法。'),
   a('s1','lasting','并且有一种不舍的情绪在内，到了今天也是一样。','作者表示早期听到的不舍感延续到了写回答时。','“今天”指原文写作时，不替换为 Demo 检索日期。','作者回顾并延续的听感'),
   a('s3','intro','虽然用了歌词简介帮助听众理解，这一点有点作弊','作者肯定情感共鸣时，仍对借助歌词简介解释内容有所保留。','这是“虽然……但总的来说……”的让步部分，需要和后文的局部肯定一起读。'),
   a('s1','agreement','首先说明，我是整体上赞同该答案，不过稍有分歧','作者在回应另一篇回答时，声明总体赞同但有部分分歧。','当前摘录只能继续核实一处对冗余用字批评的承认，不足以列出全部分歧，也不补造被引用回答的链接。'),
   a('s3','meaning','感受到了，那就行了，何必纠结每个字的具体含义呢。','作者用另一首歌作为例子，强调感受到意境未必要求逐字解释。','这里直接讨论的是《仙居谣》，用于说明评价标准；随后作者才将“是否传达感情”的问题带回《白石溪》。不能把这段当作白石溪的具体意境描写。')
  );
 }
 let data=applyGroundedAnalysis(base,{keywords,analyses});
 if(data.analyses.length!==analyses.length)throw Error('Some reviewed quotes did not pass: '+base.song.title+' '+JSON.stringify(analyses.filter(a=>!data.analyses.some(b=>a.sourceId===b.sourceId&&a.keywordId===b.keywordId))));
 data.analyses=data.analyses.map(x=>({...x,context:x.context.replace(' 此为自动分析，可能误读语境，请结合原句核对。','')}));
 data.analysisMode='curated';data.analysisNotice='';data.reviewedAt=new Date().toISOString();
 data.song.edition='真实摘录 · 准备阶段核验';
 data.sources=data.sources.map(s=>({...s,intro:base.song.title==='I LOVE U'?(s.id==='s6'?'听众回顾，从这首歌谈起自己的接受过程。':'专辑讨论中明确涉及这首歌的段落。'):'围绕《白石溪》作词与听感的回答。',scope:base.song.title==='I LOVE U'?(s.id==='s6'?'听众经验 · 由单曲延伸':'专辑语境 · 包含单曲分析'):'单曲讨论'}));
 data.excluded=[...(base.excluded||[]),...removed.map(s=>({title:s.title,url:s.url,reason}))];
 data.limitations=[`${data.sources.length} 篇来自不同作者的真实搜索摘录，非全文，不代表全部知乎讨论。`,base.song.title==='I LOVE U'?'三篇在《恋爱理论》专辑语境中讨论单曲，一篇由该曲延伸至听众经验；没有将其他歌曲的单独评价移植到本曲。':'目前只有两篇有展开论述且可署名的有效材料，未为达到目标数量纳入推荐清单。','AI 概括在准备阶段逐条核对原句与上下文；条件判断、转述与过去立场分开标记。','空格表示当前摘录未涉及，不表示整篇没有讨论。词频只代表选定取得文本，不是全站热度。'];
 await writeFile(new URL('data/runtime/'+base.song.id+'.json',root),JSON.stringify(data,null,2));
 console.log(JSON.stringify({song:data.song.title,sources:data.sources.length,keywords:data.keywords.length,analyses:data.analyses.length}));
}
const love=await read('song-17102360c590977c');
// For album reviews, count only the contiguous I LOVE U section, not other songs.
for(const s of love.sources){
 let text=s.texts[0].text;
 if(s.id==='s1')text=text.slice(text.indexOf('2.I LOVE U'),text.indexOf('3.左脑右脑'));
 if(s.id==='s3')text=text.slice(text.indexOf('2 I LOVE U'),text.indexOf('3 远恋'));
 if(s.id==='s2')text=text.slice(0,text.indexOf('有些地方吐字不清'));
 if(['s1','s2','s3'].includes(s.id)){const id='review:'+s.id;s.texts.push({id,method:'准备阶段选择连续相关段落',retrievedAt:s.retrievedAt,coverage:'搜索摘录中的连续相关片段，非全文',text,sourceUrl:s.url});s.frequencyTextId=id;}
}
await save(love,['s1','s2','s3','s6'],[
 k('confession','告白忐忑',['表白','告白','忐忑']),k('emotion','情绪感染',['听哭','心动','感觉']),k('style','小清新风格',['小清新','风格','默契']),k('echo','曲间呼应',['呼应','心加心','彩蛋']),k('acceptance','听众的距离',['疏远','羞耻','喜欢']),k('voice','声音特点',['声音','稚嫩']),k('writing','用词风格',['常见词'])
],[
 a('s1','confession','简直精准的写出了喜欢一个人表白之前那种忐忑嘛!','作者认为歌曲写准了表白前的忐忑。','这是《恋爱理论》逐曲评价中 I LOVE U 小节的直接听感。'),
 a('s1','emotion','这首曲子把我听哭了(当时初三有点心理波动),简直精准的写出了喜欢一个人表白之前那种忐忑嘛!','作者回忆当时听哭的体验，并将其联系到告白前的情绪。','括号是作者对当时个人状态的自述，不能推及其他听众。','作者回顾个人听感'),
 a('s3','confession','告白题材的歌不说流行圈，VC也有很多。但能写好唱好告白那种感觉的，我听过的大概只有I LOVE U了。','作者在自己的听歌范围内，特别认可这首歌对告白感受的表现。','限定语是“我听过的大概”，不是对全部同题材歌曲的客观排名。'),
 a('s3','emotion','但能写好唱好告白那种感觉的，我听过的大概只有I LOVE U了。','作者肯定歌曲把告白的感觉写出来、唱出来。','位于专辑中 I LOVE U 小节；没有把下一节《远恋》的经历和哭泣移植过来。'),
 a('s2','style','I LOVE U，经典之作，偶尔在圈外也能听到它。铁三角风格近乎完美的演绎。A+级','作者高度认可本曲对该创作组合风格的呈现。','“经典”“A+”都是该回答的个人评价，不作为歌墙排序或客观正确性的依据。'),
 a('s2','echo','“想谢谢你 能回应我的问题”一句呼应I LOVE U，算是个彩蛋','作者把《心加心》的一句词理解为对 I LOVE U 的呼应。','这句词属于作者正在讨论的《心加心》，不当作 I LOVE U 的歌词；这里只比较两首之间的关联。'),
 a('s3','echo','和心加心做告白唱的曲子很不错哦。','作者建议将本曲与《心加心》作为告白时唱的歌。','这是作者的使用建议，不代表歌曲作者的创作意图。'),
 a('s6','emotion','所以我只是单纯的喜欢，那是最纯粹的因为一首音乐而心动。','作者回忆初听本曲时还不了解虚拟歌手身份，先因音乐而心动。','此前明确点名阿良良木健／洛天依的 I LOVE U；是个人接受经历。','作者回顾个人经历'),
 a('s6','acceptance','后来了解了洛天依和其他虚拟歌手更多，有一段时间甚至开始疏远。','作者回顾自己了解虚拟歌手后曾一度疏远，随后在文中重新肯定喜欢的感受。','下文称回想起来可笑，并表示无法拒绝好听的作品；不能将旧时疏远当作最终立场。','回顾过去立场后反思'),
 a('s2','writing','苍十三是只使用常见词的词作，对常见词的驾驭力不错。','作者欣赏词作对常见词的运用。','这是对专辑创作组合的评价，为其理解本曲风格提供语境；不是逐句核验全曲词作。'),
 a('s2','voice','洛天依，稚嫩的少女形象，可爱和些许笨拙的声音。','作者将声音中的可爱与些许笨拙纳入对情歌风格的理解。','这是回答作者对声音与角色的描述，不是演唱者或创作者的真实身份判断。')
],'仅推荐歌名、短评或歌词汇编，缺少足够的本曲论述');
const white=await read('song-398a1ab18ce9fb88');
await save(white,['s1','s3'],[
 k('emotion','情感表达',['感情','情感','不舍']),k('standard','评价标准',['歌词','四言诗体','质量']),k('wording','用词争议',['多余','搭配不当','语义重复']),k('sound','拉长发音',['发音','拉长']),k('subjective','主观欣赏',['心态','客观评价']),k('reception','口碑变化',['风评','好评']),k('conditional','条件判断',['硬伤','质量'])
],[
 a('s1','emotion','故意拉长的效果让我感到很好，并且有一种不舍的情绪在内，到了今天也是一样。','作者认为拉长的唱法带来不舍的情绪，并表示至今仍有同样听感。','前文回忆小时候初听的感受；这里是态度延续，不是先批评后反思。','作者回顾并延续的听感'),
 a('s3','emotion','但总的来说，在情感共鸣的角度，白石溪是非常成功的。','作者以情感传达为标准，肯定本曲的情感共鸣。','此前承认使用歌词简介帮助理解“有点作弊”，随后仍给出这一局部肯定；不能据此抹去其提到的用词问题。'),
 a('s3','standard','首先，这是一首歌词，不是诗经里的一首诗。用四言诗体的格式来评价它，我不知道是谁出的馊主意。','作者反对直接用四言诗体格式评价歌词。','下文将评价重心放在歌曲能否让听众体会感情上。'),
 a('s3','conditional','如果没有的话，那么这首词的质量在中文V家属于顶尖级别；如果有，那就得视具体情况而论了……','作者在无法确认有无硬伤的前提下，给出有条件的高度评价。','前一句明确表示不知道有没有硬伤或致命扣分项，不能删去条件当作确定结论。','作者的条件判断'),
 a('s1','wording','之前提及的答主说，微，点，滴多余，是闲笔，是多余的，都是含在“露”这一字内的。','作者转述另一位答主对“微、点、滴”冗余的批评，并在紧接着的段落局部认同。','后文原句是“这一点我承认”，开头又说对该答案整体赞同但稍有分歧；仅能确认这处局部赞同。','转述他人并局部认同'),
 a('s3','wording','心念相谋搭配不当、亦同守不知所云、山水的量词不应该是筹、玉成双偶有语义重复之嫌','摘录末尾列出若干用词问题，但不足以确定作者如何逐项回应。','位于肯定情感共鸣之后，摘录在清单中途结束；不把罗列直接当作最终批评结论。','说话者与最终态度待核实','insufficient'),
 a('s1','sound','尤其是中间的四字部分以及天依与阿绫的较长的发音，故意拉长的效果让我感到很好','作者特别喜欢中段四字部分与两位声库较长的发音。','这是其童年初听至今延续的个人体验，不是音频测量或制作参数。'),
 a('s3','subjective','想要客观评价，确实是有点儿难。那我就随便讲点主观的东西','作者主动说明自己的评价带有主观欣赏心态。','前文用“欣赏女儿作品”比喻自己听天依曲的心态；这是比喻，不推断其家庭经历。'),
 a('s1','reception','关于白石溪，至少多数的看法是持好评的，白石溪的风评在知乎上也是由差到好的过程。','作者描述自己观察到的知乎风评由差到好。','这是该作者对当时讨论氛围的观察，未经独立统计，不代表当前全站共识。')
],'仅在古风歌曲推荐清单中列名，未展开本曲分析');
