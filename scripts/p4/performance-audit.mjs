import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, sourceHashes, events, provenance } from '../fixture/runtime.mjs';
const json = file => JSON.parse(readFileSync(file));
const final = name => JSON.parse(readFileSync(join(root,'artifacts/P4',name),'utf8').trim().split('\n').at(-1));
const perf = final('perf-final.log'); const hot = final('hotpath-final.log');
const product = source => Object.fromEntries(Object.entries(source).filter(([name])=>name.startsWith('src/')));
const current = product(sourceHashes());
const stats = values => { const sorted=[...values].sort((a,b)=>a-b);return{n:sorted.length,median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],min:sorted[0],max:sorted.at(-1)}; };
const samples = json(join(perf.base,'samples.json')); const hotSamples=json(join(hot.base,'samples.json'));
assert.equal(samples.length,140); assert.equal(hotSamples.length,80);
for(const sample of [...samples,...hotSamples]) { assert(sample.pass); assert.deepEqual(product(sample.source),current); }
const migration=[];
for(const sample of samples.filter(sample=>sample.variant==='migration')) {
  const log=events(sample.dir);const requests=log.filter(event=>event.event==='actual-request');
  const source=requests.find(event=>event.phase==='source');const sourceDone=log.find(event=>event.event==='source-fixture-success');
  const native=requests.filter(event=>event.phase==='native');const nativeDone=log.filter(event=>event.event==='fixture-success');
  assert.equal(native.length,nativeDone.length);
  migration.push({bytes:sample.bytes,index:sample.index,sourceWaitMs:sourceDone.at-source.at,nativeWaitMs:native.reduce((sum,event,i)=>sum+nativeDone[i].at-event.at,0),sourceRequests:1,nativeRequests:native.length,inputJsonBytes:requests.filter(event=>event.phase!=='normal').reduce((sum,event)=>sum+Buffer.byteLength(JSON.stringify(event.body)),0),resumeMs:sample.resumeMs,fullRequestMs:sample.requestMs});
}
const summary=[1048576,10485760].map(bytes=>{
  const subset=samples.filter(sample=>sample.bytes===bytes);const extra=migration.filter(row=>row.bytes===bytes);
  const paired=Array.from({length:30},(_,i)=>subset.find(row=>row.index===i&&row.variant==='head').localMs-subset.find(row=>row.index===i&&row.variant==='baseline').localMs);
  assert.equal(stats(paired).p95,perf.summary.find(row=>row.bytes===bytes).added.p95);
  assert(stats(paired).p95<=200);assert(stats(extra.map(row=>row.resumeMs)).p95<=500);
  return{bytes,selection:Object.fromEntries(['baseline','head'].map(variant=>[variant,stats(subset.filter(row=>row.variant===variant).map(row=>row.selectMs))])),wall:Object.fromEntries(['baseline','head'].map(variant=>[variant,stats(subset.filter(row=>row.variant===variant).map(row=>row.wallMs))])),migration:Object.fromEntries(['sourceWaitMs','nativeWaitMs','inputJsonBytes','fullRequestMs'].map(field=>[field,stats(extra.map(row=>row[field]))]))};
});
const earliest=json(join(root,'artifacts/P4/perf/1794827885356/1048576-0-baseline/result.json')).provenance;
for(const key of ['cliHash','packageHash','installedSources','bundle'])assert.deepEqual(earliest[key],provenance[key],'installed host unchanged');
const output={pass:true,role:'owner measurement audit',product:current,formal:perf,hotpath:hot,additional:summary,migrationSamples:migration,installedUnchanged:true,provenance};
writeFileSync(join(root,'artifacts/P4/performance-audit.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({pass:true,samples:samples.length,hotSamples:hotSamples.length,summary}));
