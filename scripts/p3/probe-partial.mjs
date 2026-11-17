import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {root,tui,waitFor} from '../fixture/runtime.mjs';
import {options,count} from '../p2/common.mjs';
const dir=join(root,'artifacts/P3/partial-baseline');
const t=await tui(dir,{...options,extensions:[...options.extensions,join(root,'scripts/p3/partial-fault.ts')]});
try {await t.text('/p2-budget 9000');await waitFor(()=>count(t,'budget'),'seed');await t.text('/p2-disk-fail');await waitFor(()=>count(t,'disk-fault-armed'),'arm');await t.text('/compact');await waitFor(()=>count(t,'compaction_end'),'failed append');
const bytes=readFileSync(join(dir,'session.jsonl'),'utf8');let parseError;try{bytes.trim().split('\n').forEach(JSON.parse)}catch(e){parseError=String(e)}
writeFileSync(join(dir,'fault.json'),JSON.stringify({parseError,tail:bytes.slice(-100),normal:count(t,'normal-request')},null,2));console.log({dir,parseError});
}finally{await t.stop()}
