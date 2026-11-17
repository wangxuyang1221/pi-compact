import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {resolve} from 'node:path';
import {fixtureGrant} from './live-acceptance.mjs';import {digest} from './live/guard.mjs';
const spawn=cp.spawn;cp.spawn=function(file,args,options){if(args[0]?.endsWith('/scripts/live/worker.mjs'))args=['--import='+resolve('scripts/p6-fix-independent-auth-inject.mjs'),...args];return spawn.call(this,file,args,options);};syncBuiltinESMExports();
const {execute}=await import('./live/executor.mjs');const evidenceDir=resolve('artifacts/P6-isolation-fixes/before/auth-command-network-stop');const packageFile=resolve('artifacts/P6-executor/release/pi-compact-0.1.0.tgz');
const grant=fixtureGrant(evidenceDir,digest(fs.readFileSync(packageFile)));
const result=await execute({grant,packageFile});const markers=fs.readFileSync(evidenceDir+'/raw/auth-command-marker.jsonl','utf8').trim().split('\n').map(JSON.parse);
fs.writeFileSync(evidenceDir+'/independent-observation.json',JSON.stringify({status:result.status,reservations:result.dispatches,unusedProvider:'openai',markers},null,2));console.log({status:result.status,reservations:result.dispatches,commandRuns:markers.length,markers});
