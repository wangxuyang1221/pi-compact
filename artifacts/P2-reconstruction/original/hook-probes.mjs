import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tui,waitFor,provenance} from '../../../scripts/fixture/runtime.mjs';
import {options,count,input} from '../../../scripts/p2/common.mjs';
const base=resolve('artifacts/P2-reconstruction/original/probes-'+Date.now());mkdirSync(base,{recursive:true});const results=[];
for(const kind of ['duplicate','modify','remove','reorder','tool-modify','system','public-cancel','manual-empty']){
  const t=await tui(join(base,kind),{...options,extensions:[...options.extensions,resolve('artifacts/P2-reconstruction/original/hooks.ts')]});
  try{
    t.control({mode:'success',probe:kind});
    if(kind==='manual-empty'){
      await t.text('/compact');await waitFor(()=>count(t,'compaction_end'),'manual result');
    }else{
      await t.text('/compact-config threshold 1');await waitFor(()=>t.tmux('capture-pane','-p','-t','fixture').includes('threshold: 1%'),'config');
      await t.text('/ind-seed');await waitFor(()=>count(t,'ind-seeded'),'seed');
      await t.text(input);await waitFor(()=>count(t,'agent_settled'),'settled');
    }
    const events=t.log();const normal=events.filter(e=>e.event==='normal-request');
    const journal=JSON.parse(readFileSync(join(t.dir,'session.jsonl.pi-compact-state.json')));
    const payload=JSON.stringify(normal);
    const result={kind,native:count(t,'native-request'),normal:normal.length,hook:count(t,'ind-hook'),before:count(t,'ind-before'),journal,
      old:payload.includes('OLD_HOOK_MARKER'),modified:payload.includes('MODIFIED_HOOK_MARKER'),recent:payload.includes('RECENT_HOOK_MARKER'),current:payload.includes('CURRENT_INPUT_MARKER'),
      toolCall:payload.includes('function_call\"'),toolResult:payload.includes('function_call_output'),modifiedTool:payload.includes('MODIFIED_TOOL_MARKER'),first:payload.includes('ADDED_FIRST'),last:payload.includes('ADDED_LAST'),system:payload.includes('INDEPENDENT_SYSTEM')};
    assert.equal(count(t,'network-blocked'),0);results.push(result);await t.capture('result');
  }catch(error){results.push({kind,error:String(error),stack:error.stack});await t.capture('failure');}
  finally{await t.stop();}
  writeFileSync(join(base,'results.json'),JSON.stringify({provenance,results},null,2));console.log(JSON.stringify(results.at(-1)));
}
