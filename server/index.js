import {createServer} from 'node:http';
import {analyze,demoCases,paymentFields} from './analysis.js';

const port=Number(process.env.PORT||3001);
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':process.env.CORS_ORIGIN||'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'});res.end(JSON.stringify(body));};
const readJson=async req=>{let raw='';for await(const part of req){raw+=part;if(raw.length>100_000)throw Error('Слишком большой запрос');}return JSON.parse(raw||'{}');};
const explain=async item=>{
  const analysis=analyze(item);
  if(!process.env.ANTHROPIC_API_KEY||!process.env.ANTHROPIC_MODEL){
    return {mode:'deterministic',text:[...analysis.issues.map(x=>`${x.message} ${x.nextStep}`),analysis.nextStep].join(' ')};
  }
  const response=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',signal:AbortSignal.timeout(15000),
    headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:process.env.ANTHROPIC_MODEL,max_tokens:250,
      system:'Ты объясняешь только результат проверки учебного валютного платежа. Не добавляй фактов, правил, реквизитов или юридических выводов. Напиши 2-3 коротких предложения по-русски. Решение и подтверждение остаются за пользователем.',
      messages:[{role:'user',content:JSON.stringify({issues:analysis.issues,nextStep:analysis.nextStep,status:analysis.status})}]})
  });
  if(!response.ok)throw Error(`Claude API: HTTP ${response.status}`);
  const data=await response.json();
  return {mode:'claude',text:data.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n')||analysis.nextStep};
};
createServer(async(req,res)=>{
  if(req.method==='OPTIONS')return send(res,204,{});
  const path=new URL(req.url,'http://localhost').pathname;
  try{
    if(req.method==='GET'&&path==='/api/health')return send(res,200,{ok:true});
    if(req.method==='GET'&&path==='/api/fields')return send(res,200,paymentFields);
    if(req.method==='GET'&&path==='/api/cases')return send(res,200,demoCases.map(({id,title,description})=>({id,title,description})));
    if(req.method==='GET'&&path.startsWith('/api/cases/')){const item=demoCases.find(x=>x.id===path.split('/')[3]);return item?send(res,200,{...item,analysis:analyze(item)}):send(res,404,{error:'Кейс не найден'});}
    if(req.method==='POST'&&path==='/api/analyze'){const body=await readJson(req);const item=body.caseId?demoCases.find(x=>x.id===body.caseId):body;if(!item?.contract||!item?.invoice)return send(res,400,{error:'Нужны contract и invoice или допустимый caseId'});return send(res,200,analyze({...item,edits:body.edits||{}}));}
    if(req.method==='POST'&&path==='/api/explain'){const body=await readJson(req);const item=demoCases.find(x=>x.id===body.caseId);if(!item)return send(res,400,{error:'Нужен допустимый caseId'});return send(res,200,await explain(item));}
    return send(res,404,{error:'Маршрут не найден'});
  }catch(error){return send(res,400,{error:error.message});}
}).listen(port,'127.0.0.1',()=>console.log(`BCC demo API: http://127.0.0.1:${port}`));
