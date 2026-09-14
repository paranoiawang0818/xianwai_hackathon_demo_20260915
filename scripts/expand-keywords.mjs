// Additional reading angles grounded in the already acquired original-song text.
import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../data/sources.json',import.meta.url),d=JSON.parse(await readFile(path,'utf8'));
const additions=[
 ['pressure','学业压力',['学业压力'],'s2','相当契合了现代大量囿于学业压力的青少年的心理状况（尤其是中学生）','作者将歌曲的吸引力部分归因于它契合受学业压力困扰的青少年。','这是回答作者对受众的解释，未经独立人群调查，不能推定所有听众都有相同经历。'],
 ['video','朴素影像',['手持摄像','实拍','pv'],'s2','手持摄像的廉价pv、平白如话的现实填词、朴实无华的向上内核','作者把朴素的影像、直白填词和向上内核一起看作歌曲触达听众的因素。','“廉价”是原作者措辞，歌墙概括为朴素影像；不提供未核验的制作成本。'],
 ['production','制作细节',['midi味','编混细节','无参'],'s5','吉他突出刺耳的midi味、粗糙的编混细节和无参的歌声都是严重的减分项','作者从制作角度具体批评音色、编混和歌声细节。','同一段随后认为主题与平实词曲仍能吸引听众；技术批评不是对歌曲全部价值的否定，也不是实测技术报告。'],
 ['comfort','文字的安慰',['安慰','纸条','写诗'],'s3','拿了一张纸条写了一首诗给她（那篇诗的原文我暂时不知道了），算是安慰她','作者用自己曾写诗安慰朋友的经历，解释对歌曲中以文字帮助他人的感受。','这是回答作者明确自述的经历，不能当作歌曲作者的创作经历。'],
 ['light','光与暗',['光明','黑暗'],'s3','眼前的光明并非真的和善，眼前的黑暗也并非完全冰冷','作者不把光与暗简单视作善恶两端，强调要找到属于自己的答案。','这是其对歌词意象的解释；不推定为歌曲作者唯一意图。'],
 ['expression','表达困境',['话语权','没法说'],'s4','因为我的话语权被剥夺了，我想要说，但是又没法说','作者以话语权受限来理解歌词主体的表达困境。','原文这里的“我”是作者在理论化解读中代入的歌词主体，不当作回答作者的个人遭遇。'],
 ['reflection','创作反思',['创作者视角','心境','认同感'],'s1','从创作者视角看创作心境十分不同。','作者自己开始写作后，重新审视了先前批评其他创作者的心境。','同篇明确写出不再急于指责，并反问自己是否也在复读；不能将其旧批评当作最终立场。'],
 ['cost','创作成本',['成本低','制作水准','效率'],'s5','观众爱听，新人爱做，成本低效率高，自然滚成了雪球。','作者把低成本、易于制作与受众偏好联系起来，解释模仿扩散。','这是创作生态回答的解释模型，不是对每位新人创作者动机的核实。']
];
for(const [id,label,patterns,sid,quote,summary,context] of additions){
 const s=d.sources.find(s=>s.id===sid),t=s.texts.find(t=>t.id===s.frequencyTextId);if(!t.text.includes(quote))throw Error('Quote missing: '+id);
 if(!d.keywords.some(k=>k.id===id))d.keywords.push({id,label,description:summary,group:'继续探索',frequency:{patterns,method:'exact_alias_nonoverlap',coverage:'每篇唯一搜索摘录中对应词语的精确匹配，含转述和歌词；非全站热度。'}});
 if(!d.analyses.some(a=>a.sourceId===sid&&a.keywordId===id))d.analyses.push({sourceId:sid,keywordId:id,status:'sufficient',summary,quote,context,voice:id==='expression'?'歌词主体解读':id==='reflection'?'回顾过去立场后反思':id==='comfort'?'作者自述':'作者当前表达',evidenceTextId:t.id,sourceUrl:s.url});
}
await writeFile(path,JSON.stringify(d,null,2)+'\n');
console.log('原有 8 词扩展为 '+d.keywords.length+' 词；每个新增角度都有对应短摘录。');
