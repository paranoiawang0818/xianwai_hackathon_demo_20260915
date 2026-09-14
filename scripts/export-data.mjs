import {readFile,writeFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/sources.json',import.meta.url),'utf8'));
const sources=data.sources.map(({texts,authorVerifiedFrom,...publicSource})=>publicSource);
await writeFile(new URL('../dist/data/demo.json',import.meta.url),JSON.stringify({...data,sources},null,2)+'\n');
console.log('已导出展示数据；浏览器不接收完整搜索摘录、评论或凭证。');
