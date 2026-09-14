import {execFile} from 'node:child_process';
export const CLI=process.env.ZHIHU_CLI_PATH||'/Users/paranoiawang/Library/Application Support/zhihu-cli/current/zhihu-cli';
const failure=(code,message)=>Object.assign(Error(message),{code});
export function cliFailure(result){
 const code=String(result.error?.code||'CLI_ERROR');
 const messages={NETWORK_ERROR:'知乎接口网络请求失败',TIMEOUT:'知乎接口等待超时',AUTH_REQUIRED:'知乎认证未配置',KEYCHAIN_UNAVAILABLE:'本地钥匙串不可用',CANCELLED:'已取消'};
 return failure(code,messages[code]||'知乎 CLI 调用失败');
}
// Cloud credentials are already supplied by Render. Use the documented Zhihu
// endpoint directly for analysis, with a deadline that also covers the stream.
export async function answerFromZhihu(query,{secret,signal,timeout=100000,fetchImpl=fetch,model='zhida-fast-1p5'}={}){
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
 try{
  const response=await fetchImpl('https://developer.zhihu.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret,'X-Request-Timestamp':String(Math.floor(Date.now()/1000))},body:JSON.stringify({model,messages:[{role:'user',content:query}],stream:true}),signal:controller.signal});
  if(!response.ok)throw failure(response.status===401||response.status===403?'AUTH_FAILED':response.status===429?'RATE_LIMITED':'UPSTREAM_ERROR','知乎直答返回 HTTP '+response.status);
  if(response.headers.get('content-type')?.includes('application/json')){
   const result=await response.json();if(result.error||result.Code)throw failure('UPSTREAM_ERROR','知乎直答返回错误');return result;
  }
  if(!response.headers.get('content-type')?.includes('text/event-stream'))throw failure('UPSTREAM_ERROR','知乎直答响应类型不正确');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',ended=false,bytes=0;
  const consume=frame=>{
   const payload=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
   if(!payload)return;if(payload==='[DONE]'){ended=true;return;}
   let event;try{event=JSON.parse(payload);}catch{throw failure('INVALID_RESPONSE','知乎直答流式数据无法解析');}
   if(event.error||event.choices?.some(c=>c.finish_reason==='error'))throw failure('UPSTREAM_ERROR','知乎直答在生成期间返回错误');
   const choice=event.choices?.[0];if(choice?.finish_reason==='length')throw failure('INCOMPLETE_RESPONSE','知乎直答输出被截断');
   if(typeof choice?.delta?.content==='string')content+=choice.delta.content;
   if(choice?.finish_reason==='stop')ended=true;
  };
  try{while(!ended){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8*1024*1024)throw failure('INVALID_RESPONSE','知乎直答响应过大');buffer+=decoder.decode(value,{stream:true});let match;while((match=/\r?\n\r?\n/.exec(buffer))){consume(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}}buffer+=decoder.decode();if(buffer.trim())consume(buffer);}finally{await reader.cancel().catch(()=>{});}
  if(!ended)throw failure('INCOMPLETE_RESPONSE','知乎直答连接中断，未完成生成');
  if(!content.trim())throw failure('EMPTY_RESPONSE','知乎直答未返回分析正文');
  return {choices:[{message:{content},finish_reason:'stop'}]};
 }catch(e){if(signal?.aborted)throw failure('CANCELLED','已取消');if(timedOut)throw failure('TIMEOUT','知乎直答在等待期限内没有完成分析');if(e.code&&e.code!=='ABORT_ERR')throw e;throw failure('NETWORK_ERROR','知乎直答网络连接失败');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function runCli(args,{signal,timeout=90000}={}){
 if(args[0]==='answer'&&process.env.ZHIHU_ACCESS_SECRET){return answerFromZhihu(args[args.indexOf('--query')+1],{secret:process.env.ZHIHU_ACCESS_SECRET,signal,timeout,model:args.includes('--model')?args[args.indexOf('--model')+1]:undefined});}
 return new Promise((resolve,reject)=>{execFile(CLI,args,{signal,timeout,maxBuffer:8*1024*1024,encoding:'utf8'},(error,stdout)=>{if(signal?.aborted){reject(failure('CANCELLED','已取消'));return;}let result;try{result=JSON.parse(stdout);}catch{reject(failure(error?.killed?'TIMEOUT':'CLI_ERROR',error?.killed?'接口等待超时，请稍后重试':'CLI 未返回有效响应，请检查本地服务环境'));return;}if(result.Code&&result.Code!==0){reject(failure(String(result.Code),'知乎接口返回错误 '+result.Code));return;}if(result.ok===false){reject(cliFailure(result));return;}if(error){reject(failure('CLI_ERROR','知乎 CLI 未正常退出'));return;}resolve(result);});});
}
export function nextQuotaCycle(){const now=Date.now(),day=86400000,shift=8*3600000;return new Date(Math.floor((now+shift)/day)*day+day-shift).toISOString();}
