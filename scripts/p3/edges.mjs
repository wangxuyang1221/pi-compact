import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root,tui,waitFor,sourceHashes } from '../fixture/runtime.mjs';
import { options,count,entries } from './common.mjs';
const base=join(root,'artifacts/P3/edges',String(Date.now()));mkdirSync(base,{recursive:true});
const results=[];
for(const kind of ['native-baseline','default-disabled','bad-output','returned-tools','edit','delete','branch','large-fallback','auto-remote','auto-fallback','tools']) {
  const t=await tui(join(base,kind),{...options,...(kind==='native-baseline'?{variant:'baseline'}:{}),...(kind==='tools'?{tools:true}:{}),...(kind==='default-disabled'?{extraEnv:{...options.extraEnv,PI_COMPACT_P3_DEV:''}}:{})});
  try {
    await t.text('/p3-seed 8000');await waitFor(()=>count(t,'seed'),'seed');
    t.control({mode:'success',remote:kind==='bad-output'?'bad':kind==='returned-tools'?'tools':'success'});
    await t.text('/compact');await waitFor(()=>count(t,'compaction_end'),'first compact');
    assert.equal(count(t,'extension-success'),1);
    if(['native-baseline','default-disabled','bad-output'].includes(kind))assert.equal(count(t,'native-request'),1);
    else assert.equal(count(t,'native-request'),0);
    if(['edit','delete','branch'].includes(kind)){
      await t.text('/p3-'+kind);await waitFor(()=>count(t,{edit:'edited',delete:'deleted',branch:'branched'}[kind]),'context change');
      if(kind!=='branch'){
        await t.text('/compact');await waitFor(()=>count(t,'compaction_end')===2,'readable conversion');
        assert.equal(count(t,'native-request'),1);
        const body=JSON.stringify(t.log().find(e=>e.event==='native-request').body);
        assert(!body.includes('SYNTHETIC_OPAQUE'));
        assert(!body.includes('Codex remote checkpoint'));
        assert(!body.includes('SYNTHETIC_FACT database='));
        if(kind==='edit')assert(body.includes('EDITED_SYNTHETIC_SOURCE'));
      }
    }
    if(kind==='large-fallback'){
      await t.text('/p3-seed 90000');await waitFor(()=>count(t,'seed')===2,'large source');
      t.control({mode:'success',remote:'failure'});
      await t.text('/compact');await waitFor(()=>count(t,'compaction_end')===2,'segmented fallback');
      const checkpoint=entries(t.dir).findLast(e=>e.type==='compaction').details.piCompact;
      assert.equal(checkpoint.kind,'text');assert(checkpoint.segments.length>1);
      assert.equal(count(t,'native-request'),checkpoint.segments.length);
      const bodies=t.log().filter(e=>e.event==='native-request').map(e=>JSON.stringify(e.body)).join('');
      assert(!bodies.includes('Codex remote checkpoint'));assert(!bodies.includes('SYNTHETIC_OPAQUE'));assert(bodies.includes('SYNTHETIC_FACT database='));
    }
    if(kind.startsWith('auto-')) {
      await t.text('/p3-seed 70000');await waitFor(()=>count(t,'seed')===2,'automatic source');
      t.control({mode:'success',remote:kind==='auto-fallback'?'failure':'success'});
    }
    const settled=count(t,'agent_settled');
    if(kind==='tools')t.control({mode:'success',remote:'success',tools:true});
    await t.text('CURRENT_INPUT_MARKER edge continue');await waitFor(()=>count(t,'agent_settled')>settled,'continued');
    assert.equal(count(t,'normal-request'),kind==='tools'?2:1);
    if(kind.startsWith('auto-')) {
      assert.equal(count(t,'compaction_end'),2);
      const checkpoint=entries(t.dir).findLast(e=>e.type==='compaction').details.piCompact;
      assert.equal(checkpoint.kind,kind==='auto-remote'?'opaque':'text');
      const request=t.log().find(e=>e.event==='normal-request');
      assert.equal(request.input.filter(e=>e.type==='compaction').length,kind==='auto-remote'?1:0);
      assert.equal(JSON.stringify(request.input).split('CURRENT_INPUT_MARKER').length-1,1);
    }
    if(kind==='tools'){
      const calls=t.log().filter(e=>e.event==='tool-complete');assert.deepEqual(calls.map(e=>e.name),['gamma','beta','alpha']);
      await t.text('/p3-seed 1000');await waitFor(()=>count(t,'seed')===2,'post-tool source');
      await t.text('/compact');await waitFor(()=>count(t,'compaction_end')===2,'post-tool compact');
      const remote=t.log().filter(e=>e.event==='remote-request').at(-1);assert(remote.at>calls.at(-1).at);
      assert.equal(remote.body.input.filter(e=>e.type==='function_call').length,3);assert.equal(remote.body.input.filter(e=>e.type==='function_call_output').length,3);
    }
    if(kind==='branch')assert.equal(t.log().find(e=>e.event==='normal-request').input.filter(e=>e.type==='compaction').length,0);
    assert.equal(count(t,'network-blocked'),0);await t.capture('outcome');
    results.push({kind,pass:true,dir:t.dir,source:sourceHashes(),remote:count(t,'remote-request'),native:count(t,'native-request'),normal:count(t,'normal-request')});
  }catch(error){await t.capture('failure');results.push({kind,pass:false,dir:t.dir,error:String(error),stack:error.stack});}
  finally{await t.stop();}
  console.log(JSON.stringify({...results.at(-1),source:undefined}));writeFileSync(join(base,'result.json'),JSON.stringify(results,null,2));
}
assert(results.every(r=>r.pass));
