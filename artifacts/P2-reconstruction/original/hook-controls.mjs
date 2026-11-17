import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tui,waitFor,provenance} from '../../../scripts/fixture/runtime.mjs';
import {options,count,input} from '../../../scripts/p2/common.mjs';
const base=resolve('artifacts/P2-reconstruction/original/controls-'+Date.now());mkdirSync(base,{recursive:true});const results=[];
for(const kind of ['duplicate','tool-modify']){
  const t=await tui(join(base,kind),{...options,variant:'baseline',extensions:[...options.extensions,resolve('artifacts/P2-reconstruction/original/hooks.ts')]});
  try{t.control({mode:'success',probe:kind});await t.text('/ind-seed');await waitFor(()=>count(t,'ind-seeded'),'seed');await t.text(input);await waitFor(()=>count(t,'agent_settled'),'settled');
    const normal=t.log().filter(e=>e.event==='normal-request');const payload=JSON.stringify(normal);assert.equal(normal.length,1);assert.equal(count(t,'native-request'),0);
    const result={kind,native:0,normal:1,hook:count(t,'ind-hook'),oldOccurrences:payload.split('OLD_HOOK_MARKER').length-1,toolCall:payload.includes('"type":"function_call"'),toolResult:payload.includes('function_call_output'),modifiedTool:payload.includes('MODIFIED_TOOL_MARKER')};
    if(kind==='duplicate')assert.equal(result.oldOccurrences,2);else{assert(result.toolCall);assert(result.toolResult);assert(result.modifiedTool);}results.push(result);await t.capture('control');
  }finally{await t.stop();}
  writeFileSync(join(base,'results.json'),JSON.stringify({provenance,results},null,2));console.log(JSON.stringify(results.at(-1)));
}
