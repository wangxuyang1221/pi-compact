import {appendFileSync,readFileSync} from 'node:fs';
const note=(event,data={})=>appendFileSync(process.env.PI_FIXTURE_LOG,JSON.stringify({at:performance.now(),event,...data})+'\n');
const mode=()=>JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL,'utf8')).probe;
const text=m=>typeof m.content==='string'?m.content:JSON.stringify(m.content);
export default function probe(pi){
  pi.registerCommand('ind-seed',{description:'Independent synthetic hook fixture',handler:async(_args,ctx)=>{
    const usage={input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
    const assistant=content=>({role:'assistant',content,api:'openai-responses',provider:'fixture',model:'fixture-model',usage,stopReason:'stop',timestamp:0});
    ctx.sessionManager.appendMessage({role:'user',content:'OLD_HOOK_MARKER '+'x'.repeat(3600),timestamp:0});
    ctx.sessionManager.appendMessage(assistant([{type:'toolCall',id:'call_independent',name:'alpha',arguments:{}}]));
    ctx.sessionManager.appendMessage({role:'toolResult',toolCallId:'call_independent',toolName:'alpha',content:[{type:'text',text:'OLD_TOOL_MARKER'}],isError:false,timestamp:0});
    ctx.sessionManager.appendMessage(assistant([{type:'text',text:'Old complete.'}]));
    ctx.sessionManager.appendMessage({role:'user',content:'RECENT_HOOK_MARKER '+ 'r'.repeat(250),timestamp:1});
    note('ind-seeded');ctx.ui.notify('INDEPENDENT_SEEDED','info');
  }});
  pi.on('before_agent_start',()=>{note('ind-before');if(mode()==='system')return {systemPrompt:'INDEPENDENT_SYSTEM '+ 's'.repeat(22000)};});
  pi.on('context',event=>{
    const kind=mode();let messages=event.messages;
    if(kind==='duplicate')messages=[...messages,structuredClone(messages.find(m=>m.role==='user'&&text(m).includes('OLD_HOOK_MARKER')))];
    if(kind==='modify')messages=messages.map(m=>m.role==='user'&&text(m).includes('OLD_HOOK_MARKER')?{...m,content:'MODIFIED_HOOK_MARKER'}:m);
    if(kind==='remove')messages=messages.filter(m=>!text(m).includes('RECENT_HOOK_MARKER'));
    if(kind==='reorder')messages=[{role:'user',content:'ADDED_FIRST',timestamp:9},...messages.slice().reverse(),{role:'user',content:'ADDED_LAST',timestamp:10}];
    if(kind==='tool-modify')messages=messages.map(m=>m.role==='toolResult'?{...m,content:[{type:'text',text:'MODIFIED_TOOL_MARKER'}]}:m);
    note('ind-hook',{kind,messages});return {messages};
  });
  pi.on('session_before_compact',()=>{if(mode()==='public-cancel'){note('ind-cancel');return {cancel:true};}});
  pi.on('before_provider_request',event=>note('ind-payload',{payload:event.payload}));
}
