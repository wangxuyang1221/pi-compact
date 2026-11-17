// Validates authored synthetic oracles, not model quality. No Pi imports or network.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname);
const sha=x=>createHash('sha256').update(x).digest('hex');
export function scoreRecord(record, truth) {
  const scoreObject=(actual, expected)=>{
    const a=actual && typeof actual==='object' && !Array.isArray(actual) ? actual : {};
    const claimed=Object.entries(a).filter(([,v])=>v!==null);
    const tp=claimed.filter(([k,v])=>Object.hasOwn(expected,k)&&isDeepStrictEqual(v,expected[k])).length;
    return {tp,fp:claimed.length-tp,fn:Object.keys(expected).length-tp,required:Object.keys(expected).length,claimed:claimed.length,precision:claimed.length?tp/claimed.length:null,recall:tp/Object.keys(expected).length};
  };
  const pending=Array.isArray(record?.pending)?record.pending:[];
  const tp=new Set(pending.filter(x=>truth.pending.includes(x))).size;
  return {facts:scoreObject(record?.facts,truth.facts),state:scoreObject(record?.state,truth.state),pending:{tp,fp:pending.length-tp,fn:truth.pending.length-tp,required:truth.pending.length},stale:{adopted:Object.entries(truth.stale).filter(([k,v])=>isDeepStrictEqual(record?.facts?.[k],v)).length,opportunities:Object.keys(truth.stale).length}};
}
const rows=[];
for(const id of ['settlement-v1','redirect-v1']) {
  const dir=path.join(root,'datasets',id);
  const truth=JSON.parse(fs.readFileSync(path.join(dir,'oracle/groundtruth.json')));
  const reference=(await import(pathToFileURL(path.join(dir,'oracle/reference',truth.module))))[truth.exportName];
  const initial=(await import(pathToFileURL(path.join(dir,'workspace',truth.module))))[truth.exportName];
  const referencePassed=truth.cases.filter(c=>isDeepStrictEqual(reference(structuredClone(c.input)),c.expected)).length;
  const initialPassed=truth.cases.filter(c=>isDeepStrictEqual(initial(structuredClone(c.input)),c.expected)).length;
  const h=JSON.parse(fs.readFileSync(path.join(dir,'history.json')));
  const longestToolResult=Math.max(...h.filter(e=>e.role==='toolResult').map(e=>e.content[0].text.length));
  const perfect=scoreRecord({facts:truth.facts,pending:truth.pending,state:truth.state},truth);
  const revoked=scoreRecord({facts:{...truth.facts,...truth.stale},pending:[],state:{}},truth);
  if(referencePassed!==truth.cases.length||initialPassed===truth.cases.length||perfect.facts.recall!==1||revoked.stale.adopted!==3||longestToolResult>2000) throw new Error('Candidate contract failed: '+id);
  rows.push({id,historyEntries:h.length,historyBytes:fs.statSync(path.join(dir,'history.json')).size,longestToolResultChars:longestToolResult,behaviorCases:truth.cases.length,referencePassed,initialPassed,protectedFiles:truth.protectedFiles.length,facts:6,staleOpportunities:3,state:5,pending:2});
}
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push({path:path.relative(root,p),bytes:fs.statSync(p).size,sha256:sha(fs.readFileSync(p))});}}
walk(path.join(root,'datasets'));
const result={kind:'offline-candidate-oracle-validation',realMeasurements:false,providerRequests:0,rows};
fs.writeFileSync(path.join(root,'candidate-validation.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(root,'dataset-manifest.json'),JSON.stringify({schema:1,status:'candidate-freeze-not-run-authorization',files},null,2)+'\n');
console.log(JSON.stringify(result,null,2));
