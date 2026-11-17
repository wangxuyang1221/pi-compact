import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tui,waitFor,provenance} from '../../../scripts/fixture/runtime.mjs';
import {options,count,input} from '../../../scripts/p2/common.mjs';
const base=resolve('artifacts/P2-reconstruction/original/boundary-'+Date.now());mkdirSync(base,{recursive:true});const results=[];
for(const name of ['context-edit','overflow-failure']){
const t=await tui(join(base,name),{...options,extensions:[...options.extensions,...(name==='context-edit'?[resolve('artifacts/P2-reconstruction/original/context-edit-observer.ts')]:[])]});
try{await t.text('/p2-budget 1000');await waitFor(()=>count(t,'budget'),'seed');t.control(name==='context-edit'?{mode:'success',editSize:36000}:{mode:'failure',usageTokens:12000});await t.text(input);await waitFor(()=>count(t,'agent_settled'),'settled');
const journal=JSON.parse(readFileSync(join(t.dir,'session.jsonl.pi-compact-state.json')));assert.equal(count(t,'native-request'),1);assert.equal(count(t,'normal-request'),1);
if(name==='context-edit'){assert.equal(journal.kind,'idle');assert.equal(count(t,'edit-probe'),1);const read=t.log().find(e=>e.event==='read-probe');assert(read.independent&&read.unchanged);const scope=t.log().find(e=>e.event==='scope-probe');assert.equal(scope.before.reserveTokens,1001);assert.equal(scope.after.reserveTokens,1001);assert.equal(scope.nested,false);}else{assert.equal(journal.kind,'blocked');await t.text('BLOCKED_OVERFLOW');await t.text('/p2-state');await waitFor(()=>count(t,'state'),'state');assert.equal(count(t,'normal-request'),1);}
results.push({name,pass:true,journal,native:count(t,'native-request'),normal:count(t,'normal-request')});await t.capture('boundary');
}catch(error){results.push({name,error:String(error),stack:error.stack});}finally{await t.stop();}writeFileSync(join(base,'result.json'),JSON.stringify({provenance,results},null,2));console.log(JSON.stringify(results.at(-1)));}
