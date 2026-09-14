// Analysis providers only receive retrieved excerpts. Content search stays on Zhihu.
const fail=(code,message)=>Object.assign(Error(message),{code});
const presets={
 zhipu:{label:'智谱',baseUrl:'https://open.bigmodel.cn/api/paas/v4'},
 kimi:{label:'Kimi',baseUrl:'https://api.moonshot.cn/v1'},
 compatible:{label:'备用模型'}
};
const number=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;};
export function analysisConfig(env=process.env){
 const name=(env.ANALYSIS_BACKUP_PROVIDER||'').trim();
 return {
  strategy:env.ANALYSIS_STRATEGY||'zhihu-first',
  zhihuTimeout:number(env.ANALYSIS_ZHIHU_TIMEOUT_MS,name?25000:100000,1000,180000),
  backup:name?{provider:name,...presets[name],baseUrl:env.ANALYSIS_BACKUP_BASE_URL||presets[name]?.baseUrl,
   model:(env.ANALYSIS_BACKUP_MODEL||'').trim(),secret:(env.ANALYSIS_BACKUP_API_KEY||'').trim(),
   timeout:number(env.ANALYSIS_BACKUP_TIMEOUT_MS,120000,1000,180000),
   thinking:env.ANALYSIS_BACKUP_THINKING||'default',
   maxTokens:number(env.ANALYSIS_BACKUP_MAX_TOKENS,12000,1024,32000)}:null
 };
}
function endpoint(config){
 if(!['default','enabled','disabled'].includes(config.thinking||'default'))throw fail('BACKUP_CONFIG','备用分析思考模式配置无效');
 if(!presets[config.provider]||!config.secret||/[\r\n]/.test(config.secret)||!config.model||config.model.length>120)throw fail('BACKUP_CONFIG','备用分析接口配置不完整');
 let url;try{url=new URL(config.baseUrl);}catch{throw fail('BACKUP_CONFIG','备用分析地址无效');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw fail('BACKUP_CONFIG','备用分析地址必须是不含凭证和参数的 HTTPS 地址');
 url.pathname=url.pathname.replace(/\/$/,'')+'/chat/completions';return url.href;
}
export async function answerFromBackup(query,{config,signal,fetchImpl=fetch}={}){
 const url=endpoint(config),controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},config.timeout);
 try{
  const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:controller.signal,
   headers:{Authorization:'Bearer '+config.secret,'Content-Type':'application/json'},
   body:JSON.stringify({model:config.model,messages:[{role:'user',content:query}],stream:false,max_tokens:config.maxTokens,...(config.thinking&&config.thinking!=='default'?{thinking:{type:config.thinking}}:{})})});
  if(!response.ok)throw fail(({400:'INVALID_REQUEST',401:'AUTH_FAILED',402:'BILLING_ERROR',403:'AUTH_FAILED',404:'NOT_FOUND',429:'RATE_LIMITED'})[response.status]||'UPSTREAM_ERROR','备用分析接口请求失败');
  const text=await response.text();if(text.length>8*1024*1024)throw fail('INVALID_RESPONSE','备用分析响应过大');
  let result;try{result=JSON.parse(text);}catch{throw fail('INVALID_RESPONSE','备用分析未返回合法响应');}
  if(result.error)throw fail('UPSTREAM_ERROR','备用分析接口返回错误');
  const choice=result.choices?.[0];
  if(choice?.finish_reason==='length')throw fail('INCOMPLETE_RESPONSE','备用分析输出被截断');
  if(choice?.finish_reason!=='stop')throw fail('INCOMPLETE_RESPONSE','备用分析未正常完成');
  if(typeof choice.message?.content!=='string'||!choice.message.content.trim())throw fail('EMPTY_RESPONSE','备用分析没有返回正文');
  return result;
 }catch(e){
  if(signal?.aborted)throw fail('CANCELLED','已取消');
  if(timedOut)throw fail('TIMEOUT','备用分析等待超时');
  if(['INVALID_REQUEST','BILLING_ERROR','NOT_FOUND','AUTH_FAILED','RATE_LIMITED','UPSTREAM_ERROR','INVALID_RESPONSE','INCOMPLETE_RESPONSE','EMPTY_RESPONSE'].includes(e.code))throw e;
  throw fail('NETWORK_ERROR','备用分析连接失败');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export const issueCode=e=>['INVALID_REQUEST','BILLING_ERROR','NOT_FOUND','NETWORK_ERROR','TIMEOUT','AUTH_FAILED','AUTH_REQUIRED','KEYCHAIN_UNAVAILABLE','RATE_LIMITED','UPSTREAM_ERROR','INCOMPLETE_RESPONSE','EMPTY_RESPONSE','INVALID_RESPONSE','ANALYSIS_QUOTA','INVALID_JSON','INSUFFICIENT_EVIDENCE','BACKUP_CONFIG'].includes(e.code)?e.code:String(e.code)==='30001'?'RATE_LIMITED':'ANALYSIS_ERROR';
export async function analyseWithProviders(query,{config=analysisConfig(),zhihu,backup=answerFromBackup,validate,signal,onProgress=()=>{}}){
 const attempts=[];
 if(!['zhihu-first','backup-first','backup-only'].includes(config.strategy))throw fail('BACKUP_CONFIG','分析切换策略无效');
 if(config.strategy!=='zhihu-first'&&!config.backup)throw fail('BACKUP_CONFIG','请先配置备用分析接口');
 const targets=config.strategy==='backup-only'?['backup']:config.strategy==='backup-first'?['backup','zhihu']:config.backup?['zhihu','backup']:['zhihu'];
 for(const target of targets){
  if(signal?.aborted)throw fail('CANCELLED','已取消');
  const engine=target==='zhihu'?{provider:'zhihu',label:'知乎直答',model:'zhida-fast-1p5'}:{provider:config.backup.provider,label:presets[config.backup.provider]?.label||'备用模型',model:config.backup.model};
  onProgress({stage:'analysis',completed:3,total:4,message:attempts.length?'正在使用备用分析继续整理观点，并校验原句…':'正在整理观点，并校验原句…'});
  let stage='request';
  try{
   const answer=target==='zhihu'?await zhihu(query,{signal,timeout:config.zhihuTimeout}):await backup(query,{config:config.backup,signal});
   if(signal?.aborted)throw fail('CANCELLED','已取消');
   stage='validation';const data=validate(answer);
   return {data,engine:{...engine,fallbackUsed:attempts.length>0},attempts};
  }catch(e){
   if(signal?.aborted||e.code==='CANCELLED')throw fail('CANCELLED','已取消');
   attempts.push({provider:engine.provider,label:engine.label,code:issueCode(e),stage:e.stage||stage});
  }
 }
 const last=attempts.at(-1);throw Object.assign(fail(last.code,'所有已配置的分析服务均未完成'),{stage:last.stage,attempts});
}
