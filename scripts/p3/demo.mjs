import { mkdirSync, copyFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, tui, waitFor, sourceHashes } from '../fixture/runtime.mjs';
import { options, count } from './common.mjs';
const dir=join(root,'artifacts/P3/review');mkdirSync(join(dir,'frames'),{recursive:true});
const run=process.env.P3_RUN??join(root,'artifacts/P3/runs',readdirSync(join(root,'artifacts/P3/runs')).sort().at(-1));
for(const lane of [2,3,4])copyFileSync(join(run,`lane-${lane}/outcome.png`),join(dir,`lane${lane}.png`));
const t=await tui(join(dir,'session'),options);
const frames=[];const begin=performance.now();
try{
  for(let second=0;second<40;second++){
    if(second===2){await t.text('/p3-seed 8000');await waitFor(()=>count(t,'seed'),'demo seed');}
    if(second===5)await t.text('/compact KEEP_CUSTOM_MARKER');
    if(second===11)await t.text('CURRENT_INPUT_MARKER continue after remote checkpoint');
    if(second===16){await t.text('/p3-seed 4000');await waitFor(()=>count(t,'seed')===2,'demo second seed');}
    if(second===20){t.control({mode:'failure',remote:'failure'});await t.text('/compact');}
    if(second===28)await t.text('CURRENT_INPUT_MARKER remains blocked');
    if(second===34)await t.text('/p3-state');
    const file=String(second).padStart(3,'0')+'.txt';writeFileSync(join(dir,'frames',file),t.tmux('capture-pane','-p','-t','fixture'));frames.push({second,at:performance.now()-begin,file});
    const remaining=(second+1)*1000-(performance.now()-begin);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  }
}finally{await t.stop();}
writeFileSync(join(dir,'frames.json'),JSON.stringify({frames,source:sourceHashes()},null,2));
writeFileSync(join(dir,'SOURCE.md'),'# Terminal recording source\n\nThese images and the 40-second video render actual installed Pi 1.5.2 tmux capture-pane text. They are terminal text renderings, not OS screenshots. Menlo font and the dark background come from the renderer. One frame was sampled each second. Raw ANSI, frame text, provider requests, timestamps and process cleanup are retained. No UI content was invented.\n');
execFileSync('conda',['run','--no-capture-output','-n','codex-py312','python',join(root,'scripts/p2/render-demo.py'),dir]);
execFileSync('ffmpeg',['-y','-framerate','1','-i',join(dir,'frames/%03d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-r','25',join(dir,'demo.mp4')],{stdio:['ignore','ignore','pipe']});
console.log(dir);
