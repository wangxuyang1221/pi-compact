import assert from 'node:assert/strict';
import { readdirSync,readFileSync,writeFileSync } from 'node:fs';
import { join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root } from '../../scripts/fixture/runtime.mjs';
import { base,evidenceRoots } from './evidence-roots.mjs';
const files=evidenceRoots.flatMap(dir=>readdirSync(dir,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>relative(root,join(entry.parentPath,entry.name)))).filter(file=>
 !file.includes('/tmp/')&&!file.includes('/package/package/')&&!file.includes('/package-final/package/')&&!file.endsWith('/auth.json')&&
 !/artifacts\/P4-fixes\/(REPORT\.md|manifest\.json|archive-verification\.json|archive-files\.txt|archive.*\.log|evidence\.tar\.gz)$/.test(file)&&
 !/\/review\/(demo\.mp4|lane[257]\.png|frames\/\d+\.png)$/.test(file)).sort();
assert.equal(new Set(files).size,files.length);
const hash=file=>createHash('sha256').update(readFileSync(join(root,file))).digest('hex');
const contents=files.map(path=>({path,bytes:readFileSync(join(root,path)).length,sha256:hash(path)}));
const list=join(base,'archive-files.txt');writeFileSync(list,files.join('\n')+'\n');
const archive='artifacts/P4-fixes/evidence.tar.gz';
execFileSync('tar',['-czf',join(root,archive),'-T',list],{cwd:root,env:{...process.env,COPYFILE_DISABLE:'1'}});
const standalone=['package-final/pi-compact-0.1.0.tgz'].map(path=>'artifacts/P4-fixes/'+path);
const manifest={archive:{path:archive,bytes:readFileSync(join(root,archive)).length,sha256:hash(archive)},roots:evidenceRoots.map(dir=>relative(root,dir)),exclusions:'Temporary caches, extracted package duplicate, generated synthetic auth files, PNG video frames, standalone visuals, REPORT, manifest, verification, file list, currently written archive logs. Raw requests, histories, journals, failures, profiles, text frames and completed logs are retained.',standalone:standalone.map(path=>({path,sha256:hash(path)})),contents};
writeFileSync(join(base,'manifest.json'),JSON.stringify(manifest,null,2));
const verification=execFileSync('conda',['run','--no-capture-output','-n','codex-py312','python','-c',
'import json,hashlib,tarfile,sys\nm=json.load(open(sys.argv[1])); expected={x["path"]:x for x in m["contents"]}; seen=[]\nwith tarfile.open(sys.argv[2],"r|gz") as archive:\n for entry in archive:\n  assert entry.isfile(),entry.name\n  h=hashlib.sha256()\n  with archive.extractfile(entry) as f:\n   while chunk:=f.read(1024*1024):h.update(chunk)\n  assert entry.name in expected,entry.name\n  assert h.hexdigest()==expected[entry.name]["sha256"],entry.name\n  seen.append(entry.name)\nassert set(seen)==set(expected) and len(seen)==len(expected)\nprint(json.dumps({"pass":True,"files":len(seen),"method":"stream every tar member and verify its SHA-256; no extraction"}))',join(base,'manifest.json'),join(root,archive)],{encoding:'utf8',maxBuffer:1024*1024});
writeFileSync(join(base,'archive-verification.json'),verification);
console.log(JSON.stringify({files:contents.length,archive:manifest.archive,verification:JSON.parse(verification)}));
