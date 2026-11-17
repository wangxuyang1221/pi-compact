import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, tui, waitFor, sourceHashes } from '../fixture/runtime.mjs';
import { options, count, entries } from './common.mjs';
const base = join(root,'artifacts/P3/faults',String(Date.now()));
mkdirSync(base,{recursive:true});
const results=[];
for(const kind of ['partial','fsync','idle-rename','commit-unlink','kill']) {
  const dir=join(base,kind);
  let t=await tui(dir,options);
  try {
    await t.text('/p3-seed 8000');await waitFor(()=>count(t,'seed'),'seed');
    await t.text('/compact');await waitFor(()=>count(t,'extension-success'),'initial checkpoint');
    const prior=entries(dir).findLast(e=>e.type==='compaction').id;
    await t.text('/p3-seed 4000');await waitFor(()=>count(t,'seed')===2,'new source');
    const before=readFileSync(join(dir,'session.jsonl'));writeFileSync(join(dir,'before-fault.jsonl'),before);
    await t.text('/p3-fault '+kind);await waitFor(()=>count(t,'disk-fault-armed'),'armed');
    await t.text('/compact');await waitFor(()=>count(t,'disk-fault-fired'),'fault');
    if(kind==='kill') {
      await waitFor(()=>existsSync(join(dir,'exit-code')),'killed process exit');
      copyFileSync(join(dir,'session.jsonl'),join(dir,'partial.jsonl'));
      copyFileSync(join(dir,'session.jsonl.pi-compact-pending.json'),join(dir,'pending-before-recovery.json'));
      await t.stop();
      for(const name of ['events.jsonl','raw.ansi','cleanup.json','exit-code'])if(existsSync(join(dir,name)))copyFileSync(join(dir,name),join(dir,'first-'+name));
      if(existsSync(join(dir,'control.json.fault'))) { const c=JSON.parse(readFileSync(join(dir,'control.json.fault'))); c.kind='none';writeFileSync(join(dir,'control.json.fault'),JSON.stringify(c)); }
      t=await tui(dir,options);
      await t.text('/p3-state');await waitFor(()=>count(t,'state'),'restarted state');
      assert.equal(t.log().find(e=>e.event==='state').state,'blocked');
      assert(readFileSync(join(dir,'session.jsonl')).subarray(0,before.length).equals(before));
      assert.equal(entries(dir).filter(e=>e.type==='compaction').length,1);
      assert.equal(entries(dir).find(e=>e.type==='compaction').id,prior);
      assert.equal(count(t,'remote-request'),0);
    } else {
      await waitFor(()=>count(t,'compaction_end')===2,'failed completion');
      assert.equal(count(t,'extension-success'),1);
      await waitFor(()=>!existsSync(join(dir,'session.jsonl.pi-compact-pending.json'))&&readFileSync(join(dir,'session.jsonl')).equals(before),'rollback settled');
      assert(readFileSync(join(dir,'session.jsonl')).equals(before));
      assert.equal(entries(dir).filter(e=>e.type==='compaction').length,1);
      await t.text('/p3-restore');await waitFor(()=>count(t,'disk-restored'),'restore disk');
    }
    await t.text('BLOCKED_NORMAL');await t.text('/p3-state');await waitFor(()=>count(t,'state')>=(kind==='kill'?2:1),'blocked barrier');
    assert.equal(count(t,'normal-request'),0);
    const successes=count(t,'extension-success');
    await t.text('/compact');await waitFor(()=>count(t,'extension-success')>successes,'explicit retry');
    assert.equal(entries(dir).filter(e=>e.type==='compaction').length,2);
    const settled=count(t,'agent_settled');
    await t.text('CURRENT_INPUT_MARKER recovered');await waitFor(()=>count(t,'agent_settled')>settled,'continuation');
    assert.equal(count(t,'normal-request'),1);assert.equal(count(t,'native-request'),0);
    await t.capture('recovered');
    results.push({kind,pass:true,dir,prior,source:sourceHashes()});
  }catch(error){results.push({kind,pass:false,dir,error:String(error),stack:error.stack});}
  finally{await t.stop();}
  console.log(JSON.stringify({...results.at(-1),source:undefined}));
  writeFileSync(join(base,'result.json'),JSON.stringify(results,null,2));
}
assert(results.every(r=>r.pass));
