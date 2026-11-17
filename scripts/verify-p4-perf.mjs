import './fixture/relative-socket.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, cli, tui, waitFor, sourceHashes } from './fixture/runtime.mjs';
import { options, count, entries } from './p4/common.mjs';
const pairs = Number(process.env.P4_PAIRS ?? 30);
const base = join(root, 'artifacts/P4/perf', String(Date.now())); mkdirSync(base, { recursive: true });
const rows = [];
const configure = dir => {
  options.configure(dir);
  const file = join(dir, 'agent/models.json'); const config = JSON.parse(readFileSync(file));
  for (const model of config.providers['openai-codex'].models) model.contextWindow = 8388608;
  writeFileSync(file, JSON.stringify(config));
};
const stats = values => { const sorted = [...values].sort((a,b) => a-b); return { n: sorted.length, median: sorted[Math.floor(sorted.length/2)], p95: sorted[Math.ceil(sorted.length*.95)-1], min: sorted[0], max: sorted.at(-1) }; };
writeFileSync(join(base, 'method.json'), JSON.stringify({ claim: 'Warm disk reread plus first compatible request local overhead p95 <=200ms at 10MiB. Last synthetic conversion response to actual target dispatch p95 <=500ms. No extra summary on compatible Codex.',
  pairs, sizes: [1048576,10485760], source: sourceHashes(), machine: { load: execFileSync('uptime', { encoding: 'utf8' }), cores: execFileSync('sysctl',['-n','hw.ncpu'],{encoding:'utf8'}) },
  timing: 'restore-span times real SessionManager.setSessionFile and AgentSession.refreshContext after ordinary CLI resume. request-start to actual-request includes awaited prepare, transform, conversion, runtime auth, provider encoding and final payload guard. Local restore metric sums these regions. OS cache is warm on both sides. Initial launcher/loader resume and seeding excluded, wallMs reported separately. Model selection measured inside awaited native setModel. Migration source/native fixture waits separately recorded. Synthetic fetch work before its entry is not subtracted.',
  baseline: 'Native Pi text checkpoint and head opaque checkpoint, same source bytes and native retained boundary. Each sample copies the same seed log for its variant, then launches ordinary installed Pi. New opaque conversion is a separate workload, no speed ratio.',
  failures: 'Any missing normal dispatch, unexpected summary, missing fact, wrong model, nonzero exit or network-blocked fails the sample.', profile: !!process.env.P4_PROFILE }, null, 2));
for (const bytes of [1048576,10485760]) {
  const templates = {};
  for (const variant of ['baseline','head']) {
    const dir = join(base, `seed-${bytes}-${variant}`); const t = await tui(dir, { ...options, variant, configure });
    try {
      await t.text('/p3-seed ' + bytes); await waitFor(() => count(t, 'seed'), 'seed');
      await t.text('/compact'); await waitFor(() => count(t, 'extension-success'), 'template compacted');
      assert.equal(entries(dir).filter(e => e.type === 'compaction').length, 1);
      templates[variant] = dir;
    } finally { await t.stop(); }
  }
  for (let index=0; index<pairs; index++) for (const variant of ['baseline','head']) {
    const dir = join(base, `${bytes}-${index}-${variant}`); mkdirSync(dir, { recursive: true });
    copyFileSync(join(templates[variant], 'session.jsonl'), join(dir, 'session.jsonl'));
    if (variant === 'head') copyFileSync(join(templates[variant], 'control.json.opaque-map'), join(dir, 'control.json.opaque-map'));
    const result = await cli(dir, { ...options, variant, configure, extensions: [...options.extensions, join(root,'scripts/p4/perf-observer.ts')], extraEnv: { ...options.extraEnv, ...(process.env.P4_PROFILE ? { P4_PROFILE: '1' } : {}) } }, 'CURRENT_INPUT_MARKER recall facts');
    const get = event => result.events.filter(e => e.event === event);
    const normal = get('actual-request').filter(e=>e.phase==='normal'); const restore = get('restore-span')[0]; const start = get('request-start')[0];
    const source = readFileSync(join(dir,'session.jsonl'),'utf8');
    const pass = result.code === 0 && normal.length === 1 && normal[0].model === 'gpt-6.1-sol' && get('source-request').length === 0 && get('native-request').length === 0 && get('remote-request').length === 0 && get('network-blocked').length === 0 && source.includes('Recalled facts. database=sqlite retry=3 file=ledger.csv timezone=Asia/Shanghai.');
    const requestMs = normal[0]?.at-start?.at;
    const row = { bytes,index,variant,dir,pass,pid:result.pid,restoreMs:restore?.ms,selectMs:get('select-span')[0]?.ms,requestMs,localMs:restore?.ms+requestMs,wallMs:result.duration,rssKiB:get('request-settled')[0]?.rssKiB,source:sourceHashes() };
    rows.push(row); writeFileSync(join(base,'samples.json'),JSON.stringify(rows,null,2)); console.log(JSON.stringify({...row,source:undefined})); assert(pass,'restore sample must actually continue');
  }
  for (let index=0; index<(process.env.P4_PROFILE?1:10); index++) {
    const dir=join(base,`${bytes}-${index}-migration`);mkdirSync(dir,{recursive:true});
    copyFileSync(join(templates.head,'session.jsonl'),join(dir,'session.jsonl'));copyFileSync(join(templates.head,'control.json.opaque-map'),join(dir,'control.json.opaque-map'));
    const result=await cli(dir,{...options,configure,extensions:[...options.extensions,join(root,'scripts/p4/perf-observer.ts')],extraEnv:{...options.extraEnv,P4_MIGRATE:'1'}},'CURRENT_INPUT_MARKER migration perf');
    const get=event=>result.events.filter(e=>e.event===event);const normal=get('actual-request').find(e=>e.phase==='normal');const last=get('fixture-success').at(-1)??get('source-fixture-success').at(-1);
    const pass=result.code===0&&!!normal&&get('source-request').length===1&&get('network-blocked').length===0&&normal.model==='deepseek-chat'&&entries(dir).findLast(e=>e.type==='compaction').details.piCompact.kind==='text';
    const row={bytes,index,variant:'migration',dir,pass,pid:result.pid,resumeMs:normal?.at-last?.at,requestMs:normal?.at-get('request-start')[0]?.at,sourceRequests:get('source-request').length,nativeRequests:get('native-request').length,wallMs:result.duration,source:sourceHashes()};rows.push(row);writeFileSync(join(base,'samples.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({...row,source:undefined}));assert(pass,'migration sample must actually continue');
  }
}
const summary=[1048576,10485760].map(bytes=>{
 const subset=rows.filter(r=>r.bytes===bytes);const paired=Array.from({length:pairs},(_,i)=>subset.find(r=>r.index===i&&r.variant==='head').localMs-subset.find(r=>r.index===i&&r.variant==='baseline').localMs);
 return {bytes,baseline:stats(subset.filter(r=>r.variant==='baseline').map(r=>r.localMs)),head:stats(subset.filter(r=>r.variant==='head').map(r=>r.localMs)),added:stats(paired),migrationResume:stats(subset.filter(r=>r.variant==='migration').map(r=>r.resumeMs)),pass:stats(paired).p95<=200&&stats(subset.filter(r=>r.variant==='migration').map(r=>r.resumeMs)).p95<=500};
});writeFileSync(join(base,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({base,summary}));assert(summary.every(r=>r.pass),'P4 local budgets');
