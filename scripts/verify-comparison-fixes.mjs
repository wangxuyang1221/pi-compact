import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {ComparisonLedger,GRANT_SCHEMA} from './comparison/budget.mjs';
import {tasks,models,profiles,schedule,targetFor} from './comparison/spec.mjs';
import {reportData} from './comparison/report.mjs';
import {comparisonFetch,usageVector} from './comparison/transport.mjs';
import {privateTree,digest} from './live/guard.mjs';
process.umask(0o077);
const root=resolve(process.argv[2] ?? ('scratch/comparison/fix-probes-' + Date.now())), out=join(root,'probes');
assert.equal(fs.existsSync(out),false);privateTree(out,{create:true});
const evidence={syntheticOnly:true,providerRequests:0,realAuthReads:0,effectiveRealGrants:0,checks:[],findings:[],pids:[]};
const save=()=>fs.writeFileSync(join(root,'probe-results.json'),JSON.stringify(evidence,null,2)+'\n');
const check=async(name,fn)=>{const detail=await fn();evidence.checks.push({name,detail});save();console.log('CHECK',name);};
const grantFor=(name,profile='quality-observation')=>{const p=profiles.find(p=>p.id===profile);return{schema:GRANT_SCHEMA,mode:'offline-fixture',authorized:true,grantId:name,expiresAt:new Date(Date.now()+3600000).toISOString(),syntheticOnly:true,allowAuthRefresh:false,profile,binding:{independent:true},evidenceDir:join(out,name),targets:models.map(targetFor),maxDispatches:p.dispatches,maxEstimatedInputTokens:p.dispatches*64000,maxReservedOutputTokens:p.dispatches*1000,perRequestOutputTokens:1000};};
await check('pre-registered-report-adversarial-vectors',()=>{
 const build=(kind)=>{const lanes=schedule('paired-five').map(l=>({...l,status:'passed',strictSuccess:true,assignedArm:l.arm,effectiveArm:l.arm,fallback:false,compactStartMonoMs:0,finishedMonoMs:100,record:{facts:{tp:6,fp:0,fn:0},state:{tp:5,fp:0,fn:0},pending:{tp:2,fp:0,fn:0},stale:{adopted:0,opportunities:3}},behavior:{passed:7,total:7},workspace:{protectedPassed:102,protectedTotal:102,unauthorizedChanges:[],extraFiles:[],sourceChanged:true},capturedFirst:true}));const rows=[];
 for(const l of lanes){const remote=l.arm==='pi-compact-remote';if(l.phase==='comparison'&&remote&&kind==='quality-drop'){l.strictSuccess=false;l.record.facts={tp:5,fp:1,fn:1};l.behavior.passed=0;}
 if(l.phase==='comparison'&&kind==='workspace-drop'){l.strictSuccess=false;l.workspace.protectedPassed=remote?101:102;}
 if(l.phase==='comparison'&&kind==='checkpoint-drop'){l.strictSuccess=false;l.capturedFirst=!remote;}
 if(l.phase==='comparison'&&kind==='subscore-drop'){l.strictSuccess=false;l.behavior.passed=remote?0:6;}
 rows.push({laneId:l.id,stage:'continuation',experimentPhase:l.phase,serverUsage:{input:remote&&['quality-drop','smaller'].includes(kind)?80:100,cacheRead:0,cacheWrite:0,output:20,reasoning:0,total:remote&&['quality-drop','smaller'].includes(kind)?100:120},knownSent:true,serverConfirmed:true});}
 return reportData({mode:'real',fixture:false,profile:'paired-five',lanes},rows);};
 const drop=build('quality-drop'),subscore=build('subscore-drop');
 assert.ok(drop.cells.every(c=>c.qualityVerdict==='remote-quality-loss-in-this-cell'));
 assert.ok(drop.cells.every(c=>c.contextComparison.verdict==='tradeoff-smaller-input-quality-regression'));
 assert.ok(subscore.cells.every(c=>c.contextComparison.verdict==='inconclusive'));
 for(const kind of ['workspace-drop','checkpoint-drop']) assert.ok(build(kind).cells.every(c=>c.contextComparison.verdict==='inconclusive'));
 assert.ok(build('equal').cells.every(c=>c.contextComparison.verdict==='no-measurable-difference-not-equivalence'));
 assert.ok(build('smaller').cells.every(c=>c.contextComparison.verdict==='remote-smaller-in-this-cell'));
 assert.equal(drop.cells[0].pairs[0].remote.qualityVector.behavior.passed,0);
 evidence.findings.push({id:'R1',title:'CMP-2 regression closed: quality constraints and full vectors',drop:drop.cells[0],subscore:subscore.cells[0],expected:'quality drop must explicitly be tradeoff, not preregistered unconditional context benefit; ties require full quality vector'});
 return {syntheticReportInputsOnly:true,qualityLoss:drop.cells[0].qualityVerdict,contextDespiteQualityLoss:drop.cells[0].contextComparison.verdict,subscoreDifferenceCalledTie:subscore.cells[0].contextComparison.verdict};
});
const terminal=(raw={input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}})=>new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',usage:raw}})+'\n\n',{headers:{'content-type':'text/event-stream'}});
await check('actual-fetch-classification-and-wire-gate',async()=>{
 const observations=[];
 for(const marker of ['ordinary text','# Conversation','<conversation>','Convert this checkpoint to a complete readable continuation summary.']){
 const grant=grantFor('marker-'+observations.length),ledger=new ComparisonLedger(grant),lane=schedule(grant.profile).find(l=>l.phase==='comparison'),target=targetFor(lane.model);let sent=0;
 ledger.setLane(lane,'compact');ledger.reserve({model:lane.model,inputTokens:10,outputTokens:1000,operation:'native'});ledger.setLane(lane,'continuation');
 const fetch=comparisonFetch(ledger,target,async()=>{sent++;return terminal();});const errors=[];
 for(let i=0;i<5;i++){try{const response=await fetch(target.endpoint,{method:'POST',body:JSON.stringify({model:lane.model,stream:true,max_output_tokens:1000,reasoning:{effort:'none'},instructions:'fixed',input:[{role:'assistant',content:marker}],tools:[]})});await response.text();}catch(e){errors.push(e.message);}}
 observations.push({marker,sent,stages:ledger.rows.map(r=>r.stage),errors});ledger.close();
 }
 assert.equal(observations[0].sent,5);assert.ok(observations.every(r=>r.sent===5&&r.errors.length===0&&r.stages[0]==='compact'&&r.stages.slice(1).every(s=>s==='continuation')));
 const gate=[];
 for(const marker of ['ordinary text','# Conversation']){
 const grant=grantFor('wire-'+gate.length),ledger=new ComparisonLedger(grant),lanes=schedule(grant.profile).filter(l=>l.phase==='comparison'&&l.model===models[0]&&l.task===tasks[0]);
 ledger.setLane(lanes[0],'continuation');const r=ledger.reserve({model:lanes[0].model,inputTokens:10,outputTokens:1000,operation:'normal'});ledger.finish(r,{encoded:{instructionsHash:digest('same'),toolsHash:digest('[]'),systemMessagesHash:digest('[]')}});ledger.setLane(lanes[1],'continuation');let sent=0,error=null;
 try{const response=await comparisonFetch(ledger,targetFor(lanes[1].model),async()=>{sent++;return terminal();})(targetFor(lanes[1].model).endpoint,{method:'POST',body:JSON.stringify({model:lanes[1].model,stream:true,max_output_tokens:1000,reasoning:{effort:'none'},instructions:'different',input:[{role:'assistant',content:marker}],tools:[{name:'different'}]})});await response.text();}catch(e){error=e.message;}gate.push({marker,sent,error});ledger.close();}
 assert.equal(gate[0].sent,0);assert.equal(gate[1].sent,0);assert.ok(gate.every(r=>r.error==='MATCHED_PAIR_WIRE_MISMATCH'));
 evidence.findings.push({id:'R2',title:'CMP-1 regression closed: body markers do not control stage or wire gate',observations,gate});return{observations,gate};
});
await check('raw-usage-invalid-cache-and-extra-fields',async()=>{
 const raw={input_tokens:100,output_tokens:20,total_tokens:120,input_tokens_details:{cached_tokens:999},private_debug:'SYNTHETIC_SHOULD_NOT_BE_PUBLIC'};
 const grant=grantFor('usage'),ledger=new ComparisonLedger(grant),lane=schedule(grant.profile)[0];ledger.setLane(lane,'continuation');
 const response=await comparisonFetch(ledger,targetFor(lane.model),async()=>terminal(raw))(targetFor(lane.model).endpoint,{method:'POST',body:JSON.stringify({model:lane.model,stream:true,reasoning:{effort:'none'},max_output_tokens:1000,input:[],tools:[]})});await assert.rejects(response.text());
 const row=ledger.rows[0];assert.equal(row.auditFailure,'USAGE_UNAUDITABLE');assert.equal(row.rawUsage.private_debug,undefined);assert.ok(!fs.readFileSync(ledger.path,'utf8').includes(raw.private_debug));ledger.close();
 evidence.findings.push({id:'N1',title:'N1 regression closed: invalid cache rejected and private fields omitted',usage:row.serverUsage,extraFieldPersisted:false});return {usage:row.serverUsage,extraFieldPersisted:false,missing:usageVector(null)};
});
save();
