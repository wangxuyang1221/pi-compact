import '../../scripts/fixture/relative-socket.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tui,waitFor} from '../../scripts/fixture/runtime.mjs';
import {options,count,entries} from '../../scripts/p4/common.mjs';
const base=join(dirname(fileURLToPath(import.meta.url)),'probes',String(Date.now()));mkdirSync(base,{recursive:true});
const results=[];
const command=async(t,text,event)=>{const before=count(t,event);await t.text(text);await waitFor(()=>count(t,event)>before,text);};
const modes=process.argv.slice(2);for(const mode of modes.length?modes:['reload-source','reload-native','auth-model-aba','auth-branch','late-aba','cache-reload','source-branch','native-edit','split-source','split-raw']){
 const dir=join(base,mode);let t;try{
 t=await tui(dir,{...options,extensions:[...options.extensions,join(dirname(fileURLToPath(import.meta.url)),'probe-observer.ts')]});
 await command(t,'/p3-seed 8000','seed');await command(t,'/compact','compaction_end');
 if(mode.includes('multi')){await command(t,'/p3-seed 4000','seed');await command(t,'/compact','compaction_end');}
 if(mode.startsWith('split')){await command(t,'/ind-split','ind-split-seeded');if(mode.includes('raw'))await command(t,'/p4-auth missing','auth-changed');}
 if(['reload-source','reload-native','source-branch','native-edit','auth-source-aba'].includes(mode)||mode.startsWith('split'))await command(t,'/p4-model deepseek/deepseek-chat','selected');
 if(mode==='reload-source'||mode==='source-branch')t.control({mode:'success',source:'delay'});
 if(mode==='reload-native'||mode==='native-edit')t.control({mode:'delay',source:'success'});
 if(mode.startsWith('auth-')){t.control({mode:'success',indWait:true});await command(t,'/ind-authwait','ind-armed');}
 if(mode==='cache-failed-edit')t.control({mode:'success',indLate:'failed-edit'});
 if(mode==='late-aba')t.control({mode:'success',indLate:'aba'});
 if(mode==='cache-reload')t.control({mode:'success',indLate:'reload'});
 if(mode==='split-failure')t.control({mode:'success',source:'failure'});
 const cpCount=count(t,'compaction_end');const settled=count(t,'agent_settled');
 if(mode.startsWith('split'))await t.text('/compact');else await t.text('CURRENT_INPUT_MARKER independent probe');
 if(mode.startsWith('reload-')||mode==='source-branch'||mode==='native-edit'){
 await waitFor(()=>count(t,mode==='reload-native'||mode==='native-edit'?'native-request':'source-request')>0,'migration held');
 await command(t,mode.startsWith('reload-')?'/ind-reload':mode==='source-branch'?'/ind-branch one':'/p3-delete',mode.startsWith('reload-')?'ind-reloaded':mode==='source-branch'?'ind-branched':'deleted');t.control({mode:'success',source:'success'});
 }
 if(mode.startsWith('auth-')){await waitFor(()=>count(t,'ind-auth-wait'),'auth held');if(mode==='auth-source-aba'){await command(t,'/p4-model openai-codex/gpt-6.1-sol','selected');await command(t,'/p4-model deepseek/deepseek-chat','selected');}else if(mode==='auth-model-aba'){await command(t,'/p4-model deepseek/deepseek-chat','selected');await command(t,'/p4-model openai-codex/gpt-6-astra','selected');}else await command(t,'/ind-branch one','ind-branched');t.control({mode:'success'});}
 if(mode.startsWith('split')){await waitFor(()=>count(t,'compaction_end')===cpCount+1,'split migration');await t.text('CURRENT_INPUT_MARKER after split');}
 await waitFor(()=>count(t,'agent_settled')>settled,'settled');
 const all=entries(dir),log=t.log(),cp=all.filter(e=>e.type==='compaction'),requests=log.filter(e=>e.event==='actual-request');
 const row={mode,dir,completed:true,checkpoints:cp.map(e=>({id:e.id,kind:e.details?.piCompact?.kind,summary:e.summary,method:e.details?.method})),requests:requests.map(e=>({phase:e.phase,model:e.model,bytes:Buffer.byteLength(JSON.stringify(e.body))})),errors:log.filter(e=>e.event==='compaction_end').map(e=>e.error),sourceHash:cp.at(-1)?.details?.piCompact?.source?.hash};results.push(row);await t.capture('outcome');
 }catch(e){results.push({mode,dir,completed:false,error:String(e),stack:e.stack});}finally{if(t)await t.stop();writeFileSync(join(base,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));}
}
