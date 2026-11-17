import * as host from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
const sessions = globalThis[Symbol.for('pi-compact.p6.fixture-sessions')] ??= new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) { sessions.set(this.sessionManager, this); return bind.apply(this, args); };
const note = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
export default function observer(pi) {
  pi.registerCommand('p6-task', { description: 'Seed identical synthetic task', handler: async (_args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    fs.writeFileSync(ctx.cwd + '/ledger.csv', 'id,status\nA1,pending\n');
    for (let i = 0; i < 12; i++) {
      ctx.sessionManager.appendMessage({ role: 'user', content: `FACT_${i}=value_${i} FACT_PENDING=idempotency_test FACT_FILE=ledger.csv FACT_ROW=A1_pending database=sqlite retry=3 timezone=Asia/Shanghai ` + 'x'.repeat(7000), timestamp: i });
      ctx.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id: 't' + i, name: 'alpha', arguments: {} }], api: session.model.api, provider: session.model.provider, model: session.model.id, stopReason: 'toolUse', timestamp: i, usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      ctx.sessionManager.appendMessage({ role: 'toolResult', toolCallId: 't' + i, toolName: 'alpha', content: [{ type: 'text', text: `FACT_TOOL_${i}=result_${i}` }], isError: false, timestamp: i });
    }
    ctx.sessionManager.appendMessage({ role: 'user', content: 'RETAINED_COMPLETE_TAIL', timestamp: 12 });
    session.refreshContext(); note('p6-task-seeded', { turns: 12, file: 'ledger.csv' });
  } });
  pi.on('session_start', (_event, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    note('p6-loaded', { paths: session._resourceLoader.getExtensions().extensions.map(e => e.path), managed: !!globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session) });
  });
}
