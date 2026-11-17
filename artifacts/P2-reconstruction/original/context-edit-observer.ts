import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync,readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const note=(event,data={})=>appendFileSync(process.env.PI_FIXTURE_LOG,JSON.stringify({at:performance.now(),event,...data})+'\n');
const lookup=ctx=>globalThis[Symbol.for('pi-compact.adapter.v1')]?.candidates.get(ctx.sessionManager);
export default function probe(pi){
  pi.on('session_before_compact',async(event,ctx)=>{
    const session=lookup(ctx); const before=session.settingsManager.getCompactionSettings(session.model);
    await new Promise(r=>setTimeout(r,20));
    const nested=session._exceedsCompactionThreshold(session.model,ctx.sessionManager.buildSessionProjection());
    const after=session.settingsManager.getCompactionSettings(session.model);
    note('scope-probe',{before,after,nested,firstKept:event.preparation.firstKeptEntryId,preparation:event.preparation});
  });
  pi.on('before_agent_start',(event,ctx)=>{
    const c=JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL,'utf8'));
    if(c.systemSize) return {systemPrompt:'SYSTEM_CHANGE_MARKER '+ 's'.repeat(c.systemSize)};
    if(c.editSize){const session=lookup(ctx);const target=ctx.sessionManager.getBranch().find(e=>e.type==='message'&&e.message.role==='user');const oldLeaf=ctx.sessionManager.getLeafId();ctx.sessionManager.appendContextEdit(target.id,{content:'EDIT_MARKER '+'e'.repeat(c.editSize)});session.refreshContext();note('edit-probe',{oldLeaf,newLeaf:ctx.sessionManager.getLeafId(),tokens:ctx.sessionManager.buildSessionProjection().messages.reduce((n,m)=>n+host.estimateTokens(m),0)});}
  });
  pi.on('context',(event,ctx)=>{
    const before=ctx.sessionManager.getLeafId();const first=ctx.sessionManager.buildSessionProjection();const second=ctx.sessionManager.buildSessionProjection();note('read-probe',{leaf:before,unchanged:ctx.sessionManager.getLeafId()===before,independent:first!==second,messages:first.messages.length});
  });
  pi.registerCommand('independent-state',{description:'Synthetic independent state',handler:async(_args,ctx)=>{const s=lookup(ctx);note('independent-state',{state:globalThis[Symbol.for('pi-compact.adapter.v1')].bindings.get(s).controller.state,leaf:ctx.sessionManager.getLeafId(),nativeSettings:s.settingsManager.getCompactionSettings(s.model)});}});
}
