import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const result=JSON.parse(readFileSync('artifacts/P2/perf-results.json'));
const resume=JSON.parse(readFileSync('artifacts/P2/resume-perf-results.json'));
const paths=[...Array.from({length:10},(_,i)=>`lane-${i+1}`),result.path.split('/artifacts/P2/')[1],resume.path.split('/artifacts/P2/')[1],'p1-regressions','package/smoke','review/session','review/frames','review/frames.json','review/SOURCE.md'];
execFileSync('tar',['-czf','artifacts/P2/raw-runtime-evidence.tar.gz','--exclude=tmp','--exclude=agent','--exclude=lane-4/restart/cwd','-C','artifacts/P2',...paths,'-C',process.cwd(),'artifacts/P1-fixes/runs/1794811613415','artifacts/P1-scope/runs/1794811614696']);
writeFileSync('artifacts/P2/archive-contents.txt',execFileSync('tar',['-tzf','artifacts/P2/raw-runtime-evidence.tar.gz']));
