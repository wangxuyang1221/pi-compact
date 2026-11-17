import { benchmark } from './benchmark.ts';
import { truncateToWidth } from '@earendil-works/pi-tui';
import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync } from 'node:fs';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const key = Symbol.for('pi-compact.p5.observer');
export default function observer(pi) {
  let state = globalThis[key];
  if (!state) {
    state = { modes: new Map(), nativeAdd: host.InteractiveMode.prototype.addMessageToChat };
    globalThis[key] = state;
    const bind = host.InteractiveMode.prototype.bindCurrentSessionExtensions;
    host.InteractiveMode.prototype.bindCurrentSessionExtensions = async function () {
      state.modes.set(this.session.sessionManager, this);
      return bind.call(this);
    };
  }
  pi.registerMessageRenderer('p5-peer', message => ({ render: width => [truncateToWidth('PEER RENDERER ' + message.content, width)], invalidate() {} }));
  pi.registerCommand('p5-peer', { description: 'Synthetic peer renderer', handler: async () => pi.sendMessage({ customType: 'p5-peer', content: 'synthetic unchanged', display: true }) });
  pi.registerCommand('p5-theme', { description: 'Set isolated fixture theme', handler: async (name, ctx) => { const result = ctx.ui.setTheme(name); note('p5-theme', { name, result }); } });
  pi.registerCommand('p5-disable', { description: 'Remove only fixture product from resource loader inputs', handler: async (_arg, ctx) => {
    const mode = state.modes.get(ctx.sessionManager);
    mode.session._resourceLoader.additionalExtensionPaths = mode.session._resourceLoader.additionalExtensionPaths.filter(path => !path.endsWith('/src/index.ts'));
    note('p5-disable-requested');
    await ctx.reload();
  } });
  pi.registerCommand('p5-perf', { description: 'Measure actual host components', handler: async (path, ctx) => { benchmark(state.modes.get(ctx.sessionManager), path, process.env.PI_FIXTURE_P5_PROFILE === '1'); note('p5-perf-done'); } });
  pi.registerCommand('p5-barrier', { description: 'Fixture input barrier', handler: async () => note('p5-barrier') });
  pi.on('session_start', (_event, ctx) => {
    const mode = state.modes.get(ctx.sessionManager);
    if (!mode) throw new Error('P5 observer requires actual InteractiveMode binding.');
    const session = mode.session;
    const runtime = session.modelRuntime;
    if (!runtime[Symbol.for('pi-compact.p5.transport')]) {
      runtime[Symbol.for('pi-compact.p5.transport')] = true;
      const stream = runtime.streamSimple;
      runtime.streamSimple = (model, context, options) => stream.call(runtime, model, context, { ...options, fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')] });
    }
    if (!session[Symbol.for('pi-compact.p5.events')]) {
      session[Symbol.for('pi-compact.p5.events')] = true;
      session.subscribe(event => {
        const receivedAt = performance.now();
        if (['compaction_start', 'compaction_end', 'agent_settled'].includes(event.type)) note(event.type, { reason: event.reason, success: !!event.result, aborted: event.aborted, error: event.errorMessage });
        if (event.type === 'compaction_end' && event.result) state.successAt = receivedAt;
      });
      const terminal = mode.ui.terminal;
      const write = terminal.write;
      terminal.write = function (data) {
        const result = write.call(this, data);
        if (state.successAt !== undefined && data.includes('Context compacted')) {
          note('p5-first-frame', { ms: performance.now() - state.successAt, bytes: Buffer.byteLength(data) });
          state.successAt = undefined;
        }
        return result;
      };
    }
    if (!ctx.sessionManager.getEntries().some(entry => entry.type === 'message')) {
      ctx.sessionManager.appendMessage({ role: 'user', content: 'Synthetic old history. '.repeat(Number(process.env.PI_FIXTURE_SEED)), timestamp: 0 });
      ctx.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Prior synthetic reply.' }], api: 'openai-responses', provider: 'fixture', model: 'fixture-model', usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 0 });
      ctx.sessionManager.appendMessage({ role: 'user', content: 'Recent retained synthetic input. '.repeat(10), timestamp: 1 });
      session.refreshContext();
    }
    const renderer = globalThis[Symbol.for('pi-compact.renderer.v1')];
    note('ready', { version: host.VERSION, managed: !!globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.has(session), rendererBindings: renderer?.bindings.size ?? 0,
      extensions: session._resourceLoader.getExtensions().extensions.map(e => e.resolvedPath), rootClass: host.CompactionSummaryMessageComponent.name });
  });
  pi.on('session_shutdown', () => setImmediate(() => note('p5-shutdown', {
    registryReleased: !globalThis[Symbol.for('pi-compact.renderer.v1')],
    addRestored: host.InteractiveMode.prototype.addMessageToChat === state.nativeAdd,
  })));
}
