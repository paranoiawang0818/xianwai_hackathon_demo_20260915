import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSearchService} from './search-service.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url));const port=Number(process.env.PORT||4173);const service=createSearchService();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw Error('请求过长');}return JSON.parse(text);}
const server=http.createServer(async(req,res)=>{try{
 const host=req.headers.host;if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){json(res,403,{error:'仅允许本机访问'});return;}
 const url=new URL(req.url,'http://'+host),pathname=decodeURIComponent(url.pathname);
 if(pathname==='/api/catalog'&&req.method==='GET'){json(res,200,await service.getCatalog());return;}
 if(pathname.startsWith('/api/songs/')&&req.method==='GET'){const id=pathname.slice(11);if(!/^(dystopia|song-[a-f0-9]{16})$/.test(id)){json(res,404,{error:'尚未整理该歌曲'});return;}const song=await service.getSong(id);json(res,song?200:404,song||{error:'尚未整理该歌曲'});return;}
 if(pathname==='/api/search'&&req.method==='POST'){
  const origin=req.headers.origin;if((origin&&origin!=='http://'+host)||req.headers['x-songwall-request']!=='1'||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{error:'请从歌墙页面发起检索'});return;}
  let input;try{input=await body(req);}catch{json(res,400,{error:'无效搜索请求'});return;}
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});res.flushHeaders();
  const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});const send=(event,value)=>{if(!res.destroyed&&!res.writableEnded)res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);};
  const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': waiting\n\n');},15000);
  try{const result=await service.search(input,{signal:controller.signal,onProgress:value=>send('progress',value)});send('complete',result);}catch(e){send('error',{code:e.code||'SERVICE_ERROR',message:['AUTH_REQUIRED','CLI_ERROR'].includes(e.code)?'知乎认证在本地服务中不可用，请检查钥匙串访问环境。':e.message||'本次检索未完成'});}finally{clearInterval(heartbeat);res.end();}return;
 }
 if(pathname.startsWith('/api/')){json(res,404,{error:'接口不存在'});return;}
 const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!path.startsWith(root.endsWith(sep)?root:root+sep)||!['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end();return;}
 const content=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:content);
 }catch(error){if(res.headersSent)res.end();else json(res,error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'文件不存在':'本地服务暂时无法完成请求，请重试。'});}});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`端口 ${port} 已被占用，请使用 PORT=4174 npm start`:err.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`歌墙已启动：http://127.0.0.1:${port}`));
