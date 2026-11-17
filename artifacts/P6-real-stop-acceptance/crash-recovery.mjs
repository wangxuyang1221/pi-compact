import fs from 'node:fs';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ComparisonLedger, GRANT_SCHEMA } from '../../scripts/comparison/budget.mjs';
import { comparisonFetch } from '../../scripts/comparison/transport.mjs';
import { models, schedule, targetFor } from '../../scripts/comparison/spec.mjs';
process.umask(0o077);
const root=resolve(process.argv[2]), child=process.argv.includes('--child'), file=join(root,'fixture-config.json');
if(!child) {
  assert(!fs.existsSync(root)); fs.mkdirSync(root,{mode:0o700});
  const grant={schema:GRANT_SCHEMA,mode:'offline-fixture',authorized:true,grantId:'independent-crash',expiresAt:new Date(Date.now()+3600000).toISOString(),syntheticOnly:true,allowAuthRefresh:false,profile:'compatibility-only',binding:{},evidenceDir:join(root,'evidence'),targets:models.map(targetFor),maxDispatches:8,maxEstimatedInputTokens:512000,maxReservedOutputTokens:8000,perRequestOutputTokens:1000};
  fs.writeFileSync(file,JSON.stringify(grant));
  const run=spawnSync(process.execPath,[...process.execArgv,process.argv[1],root,'--child'],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,23); assert(fs.existsSync(join(grant.evidenceDir,'owner.lock')));
  const before=JSON.parse(fs.readFileSync(join(grant.evidenceDir,'ledger.json')));
  const ledger=new ComparisonLedger(grant); ledger.setLane(schedule(grant.profile)[1],'compact'); let sends=0;
  await assert.rejects(()=>comparisonFetch(ledger,targetFor(models[0]),async()=>{sends++;throw new Error('must not send');})(targetFor(models[0]).endpoint,{method:'POST',body:JSON.stringify({model:models[0],stream:true,max_output_tokens:1000,reasoning:{effort:'none'},input:[],tools:[]})}),/COMPARISON_AUDIT_STOP/);
  assert.equal(sends,0); assert.deepEqual(ledger.rows,before.rows); ledger.close();
  fs.writeFileSync(join(root,'result.json'),JSON.stringify({passed:true,deadOwnerPID:run.pid,parentPID:process.pid,exitCode:23,lockRecovered:true,failedDispatches:1,additionalSends:0,reservationsUnchanged:true,realRequests:0},null,2));
  console.log('crash recovery PASS');
} else {
  const grant=JSON.parse(fs.readFileSync(file));const ledger=new ComparisonLedger(grant);ledger.setLane(schedule(grant.profile)[0],'compact');
  await assert.rejects(()=>comparisonFetch(ledger,targetFor(models[0]),async()=>new Response('{}',{headers:{'content-type':'application/json'}}))(targetFor(models[0]).endpoint,{method:'POST',body:JSON.stringify({model:models[0],stream:true,max_output_tokens:1000,reasoning:{effort:'none'},input:[],tools:[]})}),/NON_SSE_RESPONSE/);
  process.exit(23);
}
