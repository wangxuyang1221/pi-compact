import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, cli, sourceHashes } from './fixture/runtime.mjs';
import { options } from './p2/common.mjs';
const pairs=Number(process.env.P4_HOT_PAIRS??20);
const base=join(root,'artifacts/P4/hotpath',String(Date.now()));mkdirSync(base,{recursive:true});
const rows=[];
writeFileSync(join(base,'method.json'),JSON.stringify({pairs,sizes:[1000,10000],source:sourceHashes(),load:execFileSync('uptime',{encoding:'utf8'}),
 claim:'Keep the accepted P2 request boundary delta p95 <=10ms. Also report first prepare entry through actual fixture fetch, including asynchronous encoding and payload checks. Neither is startup or model latency.',
 boundary:'Awaited prepareRequest plus awaited transformContext plus synchronous streamFunction invocation, exactly the previous metric.',
 full:'First prepare start inferred from its measured duration, through normal-request recorded at fixture fetch. Includes gaps, runtime auth, async encoding and payload guard.',
 workload:'Alternating one-character messages, real launcher and loader, identical 200000-token windows. One normal request and zero compaction per sample. Paired native/head.'},null,2));
for(const size of [1000,10000])for(let index=0;index<pairs;index++)for(const variant of ['baseline','head']){
 const dir=join(base,`${size}-${index}-${variant}`);
 const result=await cli(dir,{...options,variant,extensions:[...options.extensions,join(root,'scripts/p2/perf-observer.ts')],extraEnv:{PI_P2_MESSAGES:String(size)},configure(dir){options.configure(dir);const file=join(dir,'agent/models.json');const data=JSON.parse(readFileSync(file));data.providers.fixture.models[0].contextWindow=200000;writeFileSync(file,JSON.stringify(data));}});
 const get=name=>result.events.filter(e=>e.event===name);const prepare=get('prepare-duration')[0],normal=get('normal-request')[0];
 const pass=result.code===0&&get('normal-request').length===1&&get('native-request').length===0&&get('network-blocked').length===0&&get('perf-seed')[0]?.messages===size&&JSON.stringify(normal).includes('CURRENT_INPUT_MARKER')&&readFileSync(join(dir,'session.jsonl'),'utf8').includes('Synthetic complete.');
 const boundaryMs=['prepare-duration','transform-duration','stream-duration'].reduce((sum,name)=>sum+get(name).reduce((s,e)=>s+e.ms,0),0);
 const row={size,index,variant,dir,pid:result.pid,pass,boundaryMs,fullMs:normal?.at-(prepare?.at-prepare?.ms),wallMs:result.duration,source:sourceHashes()};rows.push(row);writeFileSync(join(base,'samples.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({...row,source:undefined}));assert(pass);
}
const stats=values=>{const s=values.sort((a,b)=>a-b);return{n:s.length,median:s[Math.floor(s.length/2)],p95:s[Math.ceil(s.length*.95)-1],min:s[0],max:s.at(-1)}};
const summary=[1000,10000].map(size=>{const subset=rows.filter(r=>r.size===size);const delta=key=>Array.from({length:pairs},(_,i)=>subset.find(r=>r.index===i&&r.variant==='head')[key]-subset.find(r=>r.index===i&&r.variant==='baseline')[key]);return{size,baseline:stats(subset.filter(r=>r.variant==='baseline').map(r=>r.boundaryMs)),head:stats(subset.filter(r=>r.variant==='head').map(r=>r.boundaryMs)),added:stats(delta('boundaryMs')),fullBaseline:stats(subset.filter(r=>r.variant==='baseline').map(r=>r.fullMs)),fullHead:stats(subset.filter(r=>r.variant==='head').map(r=>r.fullMs)),fullAdded:stats(delta('fullMs'))};});
writeFileSync(join(base,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({base,summary}));assert(summary.every(r=>r.added.p95<=10),'P2 boundary budget');
