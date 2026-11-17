import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { root, events } from '../fixture/runtime.mjs';
import { sha } from './package.mjs';
assert(process.argv[2], 'Usage: node scripts/p6/audit.mjs <local-result-directory>');
const local = resolve(process.argv[2]);
const base = join(local, 'audit');
mkdirSync(base);
const results = JSON.parse(readFileSync(join(local, 'results.json')));
const manifestPath = join(root, results.packageManifest);
const manifest = JSON.parse(readFileSync(manifestPath));
assert.equal(results.release, manifest.sha256);
assert.equal(sha(join(root,manifest.tgz)), manifest.sha256);
for (const [file, receipt] of Object.entries(manifest.files)) {
  assert.equal(sha(join(dirname(manifestPath),'package',file)), receipt.sha256);
  if (file !== 'package.json') assert.equal(sha(join(root,file)),receipt.sha256);
}
const scores = [];
for (const result of results.results) {
  assert(result.pass, result.name);
  const log = events(result.path);
  const recall = log.findLast(e => e.event === 'recall-evidence' && e.phase === 'normal');
  const fields = [...Array.from({length:12},(_,i)=>`FACT_${i}=value_${i}`),...Array.from({length:12},(_,i)=>`FACT_TOOL_${i}=result_${i}`),'FACT_PENDING=idempotency_test','FACT_FILE=ledger.csv','FACT_ROW=A1_pending','database=sqlite','retry=3','timezone=Asia/Shanghai'];
  for(const field of fields) assert(recall.recovered.includes(field),result.name+' '+field);
  assert.equal(sha(join(result.path,'cwd/ledger.csv')),result.fileHash);
  assert.equal(log.filter(e=>e.event==='network-blocked').length,0);
  scores.push({ name:result.name, path:result.path, score:4, matched:fields.length, finalProcessDispatches:log.filter(e=>e.event==='actual-request'||e.event==='p6-injected-error').length, clarification:'Resumed lanes contain earlier-process logs in the adjacent original lane. Counts here are final process only, not total scenario counts.' });
}
mkdirSync(join(base,'review'),{recursive:true});
const images=[['native','completed','native-baseline'],['installed','config','saved-config'],['auto','completed','automatic'],['restored','restored','disk-restore'],['network-error','completed','network-fallback'],['quota','completed','quota-fallback'],['cancel','blocked','cancelled'],['doublefail','blocked','double-failure'],['lifecycle','disabled','disabled'],['after-remove','removed','uninstalled']];
const visuals=[];
for(const [lane,name,target] of images) {
  const file=join(local,lane,name+'.png');assert(existsSync(file));
  copyFileSync(file,join(base,'review',target+'.png'));
  visuals.push({output:join(base,'review',target+'.png'),source:file,sourceJSON:join(local,lane,name+'.json'),sha256:sha(file),tarballSHA:manifest.sha256});
}
writeFileSync(join(base,'visuals.json'),JSON.stringify(visuals,null,2));
writeFileSync(join(base,'audit.json'),JSON.stringify({productSHA:manifest.productSHA,tarballSHA:manifest.sha256,packageManifest:manifestPath,local,scores,realRequests:0,realAuthHistoryReads:0,scope:'Owner self-audit of raw encoded fixture records and file bytes. Does not replace independent review.'},null,2));
console.log(JSON.stringify({pass:true,local,package:manifest.sha256,scenarios:scores.length}));
