import '../../scripts/fixture/relative-socket.mjs';
import fs from 'node:fs';import {resolve,join} from 'node:path';
import {tui,waitFor,sourceHashes} from '../../scripts/fixture/runtime.mjs';
import {options,count,entries} from '../../scripts/p3/common.mjs';
const out=resolve('artifacts/P3-fixes/small-'+Date.now());fs.mkdirSync(out,{recursive:true});let results=[];
for(const variant of ['baseline','head']){
 const dir=join(out,'small-window-'+variant);const t=await tui(dir,{...options,variant,extraEnv:{...options.extraEnv,PI_COMPACT_P3_DEV:''},configure(dir){options.configure(dir);let f=join(dir,'agent/models.json');let m=JSON.parse(fs.readFileSync(f));m.providers['openai-codex'].models[0].contextWindow=4096;fs.writeFileSync(f,JSON.stringify(m));}});
 try{await t.text('/p3-seed 1000');await waitFor(()=>count(t,'seed'),'seed');fs.copyFileSync(join(dir,'session.jsonl'),join(dir,'before.jsonl'));await t.text('/compact');await waitFor(()=>count(t,'compaction_end'),'end');await t.text('CURRENT_INPUT_MARKER small-window');await waitFor(()=>count(t,'agent_settled'),'settled');await t.capture('outcome');results.push({kind:'small-window',variant,source:sourceHashes(),events:t.log().filter(e=>['compaction_end','extension-success','normal-request','native-request'].includes(e.event)),checkpoints:entries(dir).filter(e=>e.type==='compaction').length});}
 catch(e){results.push({variant,error:String(e),stack:e.stack});}finally{await t.stop();}
 fs.writeFileSync(join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({variant,native:count(t,'native-request'),normal:count(t,'normal-request'),end:t.log().filter(e=>e.event==='compaction_end')}));
}
