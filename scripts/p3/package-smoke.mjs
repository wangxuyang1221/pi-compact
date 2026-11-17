import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root,tui,waitFor } from '../fixture/runtime.mjs';
import { options,count } from './common.mjs';
const dir=join(root,'artifacts/P3/package');mkdirSync(dir,{recursive:true});
execFileSync('pnpm',['pack','--pack-destination',dir],{cwd:root});
const archive=join(dir,'pi-compact-0.1.0.tgz');
execFileSync('tar',['-xzf',archive,'-C',dir]);
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const files=readdirSync(join(dir,'package'),{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name));
const audited=files.map(file=>{
  const relative=file.slice(join(dir,'package').length+1);
  if(relative==='package.json'){
    const packed=JSON.parse(readFileSync(file));const source=JSON.parse(readFileSync(join(root,relative)));delete source.packageManager;assert.deepEqual(packed,source);
  }else assert.equal(sha(file),sha(join(root,relative)));
  return{file:relative,sha256:sha(file)};
});
for(const enabled of [false,true]){
  const t=await tui(join(dir,enabled?'remote':'default'),{...options,variant:'baseline',extensions:[join(dir,'package/src/index.ts'),...options.extensions],extraEnv:{...options.extraEnv,PI_COMPACT_P3_DEV:enabled?'fixture-only':''}});
  try{
    await t.text('/p3-seed 8000');await waitFor(()=>count(t,'seed'),'package seed');
    await t.text('/compact');await waitFor(()=>count(t,'compaction_end'),'package compact');assert.equal(count(t,'extension-success'),1);
    await t.text('CURRENT_INPUT_MARKER package');await waitFor(()=>count(t,'agent_settled'),'package continuation');
    assert.equal(count(t,'normal-request'),1);assert.equal(count(t,'native-request'),enabled?0:1);assert.equal(count(t,'remote-request'),enabled?1:0);assert.equal(count(t,'network-blocked'),0);
    await t.capture('package');
  }finally{await t.stop();}
}
writeFileSync(join(dir,'audit.json'),JSON.stringify({pass:true,sha256:sha(archive),files:audited},null,2));console.log(JSON.stringify({pass:true,archive,sha256:sha(archive),files:audited.length}));
