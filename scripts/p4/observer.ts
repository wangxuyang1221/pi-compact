import * as host from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
const note = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const sessions = globalThis[Symbol.for('pi-compact.p4.fixture-sessions')] ??= new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) { sessions.set(this.sessionManager, this); return bind.apply(this, args); };
export default function observer(pi) {
  const marks = new Map();
  const select = async (args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    const [provider, id] = args.trim().split('/');
    await session.setModel(session.modelRuntime.getModel(provider, id));
    note('selected', { provider, id });
  };
  pi.registerCommand('p4-model', { description: 'Select synthetic model', handler: select });
  const auth = async (args, ctx) => {
    const runtime = sessions.get(ctx.sessionManager).modelRuntime;
    const file = process.env.PI_CODING_AGENT_DIR + '/auth.json';
    if (args === 'missing') fs.writeFileSync(file, '{}');
    else {
      const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: 4102444800, 'https://api.openai.com/auth': { chatgpt_account_id: args } })).toString('base64url') + '.fixture';
      fs.writeFileSync(file, JSON.stringify({ 'openai-codex': { type: 'oauth', access: token, refresh: 'synthetic-refresh-unused', expires: 4102444800000 } }));
    }
    await runtime.refresh({ allowNetwork: false, providers: ['openai-codex'] });
    note('auth-changed', { account: args });
  };
  pi.registerCommand('p4-auth', { description: 'Change synthetic auth only', handler: auth });
  pi.registerCommand('p4-mark', { description: 'Remember active fixture branch', handler: async (args, ctx) => { marks.set(args, ctx.sessionManager.getLeafId()); note('marked', { name: args, id: marks.get(args) }); } });
  pi.registerCommand('p4-branch', { description: 'Restore remembered fixture branch', handler: async (args, ctx) => { ctx.sessionManager.branch(marks.get(args)); sessions.get(ctx.sessionManager).refreshContext(); note('branch-selected', { name: args, id: marks.get(args) }); } });
  pi.registerCommand('p4-seed', { description: 'Seed distributed synthetic facts and complete tools', handler: async (args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    const count = Number(args) || 12;
    for (let i = 0; i < count; i++) {
      ctx.sessionManager.appendMessage({ role: 'user', content: `FACT_${i}=value_${i} ` + 'x'.repeat(7000), timestamp: i });
      const assistant = { role: 'assistant', api: session.model.api, provider: session.model.provider, model: session.model.id, stopReason: 'toolUse', timestamp: i,
        usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      ctx.sessionManager.appendMessage({ ...assistant, content: [{ type: 'toolCall', id: `tool_${i}`, name: 'alpha', arguments: {} }] });
      ctx.sessionManager.appendMessage({ role: 'toolResult', toolCallId: `tool_${i}`, toolName: 'alpha', content: [{ type: 'text', text: `FACT_TOOL_${i}=result_${i}` }], isError: false, timestamp: i });
    }
    ctx.sessionManager.appendMessage({ role: 'user', content: 'RETAINED_COMPLETE_TAIL', timestamp: count });
    session.refreshContext(); note('distributed-seed', { count });
  } });
  pi.on('before_provider_request', async payload => {
    const control = JSON.parse(fs.readFileSync(process.env.PI_FIXTURE_CONTROL));
    if (!control.late) return;
    delete control.late;
    fs.writeFileSync(process.env.PI_FIXTURE_CONTROL, JSON.stringify(control));
    const [manager, session] = [...sessions].at(-1);
    const ctx = { sessionManager: manager };
    const mode = JSON.parse(fs.readFileSync(process.env.PI_FIXTURE_CONTROL + '.late')).mode;
    if (mode === 'model') await select('deepseek/deepseek-chat', ctx);
    if (mode === 'auth') await auth('late-account', ctx);
    if (mode === 'source') { const first = manager.getBranch().find(e => e.type === 'message'); manager.appendContextEdit(first.id, null); session.refreshContext(); note('late-source'); }
    return payload;
  });
}
