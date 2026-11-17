import * as host from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
const note = (event, data = {}) => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const sessions = new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) {
  sessions.set(this.sessionManager, this);
  return bind.apply(this, args);
};
export default function observer(pi) {
  let restore;
  pi.on('session_start', async (_event, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    const runtime = session.modelRuntime;
    const stream = runtime.streamSimple;
    runtime.streamSimple = (model, context, options) => stream.call(runtime, model, context, { ...options, transport: 'sse', fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')] });
    session.subscribe(event => {
      if (['compaction_start', 'compaction_end', 'agent_settled', 'tool_execution_end'].includes(event.type)) note(event.type, { success: !!event.result, error: event.errorMessage, aborted: event.aborted, result: event.result,
        journal: fs.existsSync(ctx.sessionManager.getSessionFile() + '.pi-compact-state.json') ? JSON.parse(fs.readFileSync(ctx.sessionManager.getSessionFile() + '.pi-compact-state.json')) : undefined });
    });
    if (process.env.PI_P3_PERF) {
      const summary = session._runDefaultCompaction;
      session._runDefaultCompaction = async (...args) => {
        const start = performance.now();
        try { return await summary.apply(session, args); }
        finally { note('summary-span', { ms: performance.now() - start, rss: process.resourceUsage().maxRSS }); }
      };
      await seed(String(1024 * 1024), ctx);
      let profiler;
      if (process.env.P3_PROFILE) {
        const { Session } = await import('node:inspector');
        profiler = new Session(); profiler.connect();
        await new Promise(resolve => profiler.post('Profiler.enable', resolve));
        await new Promise(resolve => profiler.post('Profiler.start', resolve));
      }
      await session.compact();
      if (profiler) {
        const result = await new Promise((resolve, reject) => profiler.post('Profiler.stop', (error, result) => error ? reject(error) : resolve(result)));
        fs.writeFileSync(process.env.PI_FIXTURE_CONTROL + '.cpuprofile', JSON.stringify(result.profile));
        profiler.disconnect();
      }
      note('perf-compacted', { rss: process.resourceUsage().maxRSS });
    }
    note('ready', { pid: process.pid, version: host.VERSION, extensions: session._resourceLoader.getExtensions().extensions.map(e => e.path) });
  });
  pi.on('session_before_compact', event => note('native-prepare', { firstKept: event.preparation.firstKeptEntryId, roles: event.preparation.messagesToSummarize.map(m => m.role), previousSummary: event.preparation.previousSummary }));
  pi.on('session_compact', event => note('extension-success', { id: event.compactionEntry.id, checkpoint: event.compactionEntry.details?.piCompact }));
  const seed = async (args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    const size = Number(args) || 8000;
    const text = 'SYNTHETIC_FACT database=sqlite retry=3 file=ledger.csv timezone=Asia/Shanghai. ';
    const id = ctx.sessionManager.appendMessage({ role: 'user', content: text + 'x'.repeat(size - text.length), timestamp: 0 });
    ctx.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Synthetic prior reply.' }], api: session.model.api, provider: session.model.provider, model: session.model.id,
      usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 0 });
    ctx.sessionManager.appendMessage({ role: 'user', content: 'RETAINED_SYNTHETIC_TAIL '.repeat(16), timestamp: 1 });
    session.refreshContext();
    note('seed', { id, size });
    ctx.ui.notify(`Synthetic history ready (${size} bytes).`, 'info');
  };
  pi.registerCommand('p3-seed', { description: 'Seed synthetic source history', handler: seed });
  pi.registerCommand('p3-state', { description: 'Read checkpoint state', handler: async (_args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    note('state', { state: globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session)?.controller.state.kind,
      branch: ctx.sessionManager.getBranch().map(e => e.id), checkpoints: ctx.sessionManager.getEntries().filter(e => e.type === 'compaction') });
  } });
  pi.registerCommand('p3-edit', { description: 'Edit a covered synthetic source', handler: async (_args, ctx) => {
    const first = ctx.sessionManager.getBranch().find(e => e.type === 'message' && e.message.role === 'user');
    ctx.sessionManager.appendContextEdit(first.id, { content: 'EDITED_SYNTHETIC_SOURCE' });
    sessions.get(ctx.sessionManager).refreshContext();
    note('edited', { id: first.id });
  } });
  pi.registerCommand('p3-branch', { description: 'Branch before the synthetic checkpoint', handler: async (_args, ctx) => {
    const first = ctx.sessionManager.getBranch().find(e => e.type === 'message' && e.message.role === 'user');
    ctx.sessionManager.branch(first.id);
    sessions.get(ctx.sessionManager).refreshContext();
    note('branched', { id: first.id });
  } });
  pi.registerCommand('p3-delete', { description: 'Delete synthetic source context', handler: async (_args, ctx) => {
    const first = ctx.sessionManager.getBranch().find(e => e.type === 'message' && e.message.role === 'user');
    ctx.sessionManager.appendContextEdit(first.id, null);
    sessions.get(ctx.sessionManager).refreshContext();
    note('deleted', { id: first.id });
  } });
  pi.registerCommand('p3-fault', { description: 'Inject real filesystem checkpoint faults', handler: async (args, ctx) => {
    restore?.();
    const file = process.env.PI_FIXTURE_CONTROL + '.fault';
    fs.writeFileSync(file, JSON.stringify({ kind: args, file: ctx.sessionManager.getSessionFile(), nonce: Date.now() }));
    restore = () => { if (fs.existsSync(file)) fs.unlinkSync(file); };
    note('disk-fault-armed');
  } });
  pi.registerCommand('p3-restore', { description: 'Restore fixture filesystem', handler: async () => { restore?.(); note('disk-restored'); } });
  for (const [index, name] of ['alpha', 'beta', 'gamma'].entries()) pi.registerTool({ name, label: name, description: 'Synthetic tool', parameters: { type: 'object', properties: {} },
    async execute() { await new Promise(resolve => setTimeout(resolve, (3 - index) * 80)); note('tool-complete', { name }); return { content: [{ type: 'text', text: name.repeat(400) }], details: {} }; } });
  pi.on('session_shutdown', () => restore?.());
}
