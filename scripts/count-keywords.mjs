import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../data/sources.json',import.meta.url);
const data=JSON.parse(await readFile(path,'utf8'));
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
for(const keyword of data.keywords){
 const frequency=keyword.frequency;
 if(!frequency?.patterns?.length)throw new Error(`${keyword.label} 缺少已核验的匹配词表`);
 const patterns=[...new Set(frequency.patterns)].sort((a,b)=>b.length-a.length);
 const matches=[];
 for(const source of data.sources){
  const text=source.texts.find(text=>text.id===source.frequencyTextId);
  if(!text||text.method!=='search zhihu')throw new Error(`${source.id} 缺少用于计数的唯一搜索摘录`);
  const regex=new RegExp(patterns.map(escapeRegExp).join('|'),'gu');
  for(const match of text.text.matchAll(regex))matches.push({sourceId:source.id,textId:text.id,offset:match.index,term:match[0]});
 }
 frequency.matches=matches;frequency.count=matches.length;frequency.sourceCount=new Set(matches.map(match=>match.sourceId)).size;
}
await writeFile(path,JSON.stringify(data,null,2)+'\n');
console.log('已按每篇唯一搜索摘录重新统计词频：'+data.keywords.map(k=>`${k.label} ${k.frequency.count}`).join('；'));
