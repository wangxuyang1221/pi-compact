import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync } from 'node:fs';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const sessions = new Map();
const bind = host.AgentSession.prototype.bindExtensions;
host.AgentSession.prototype.bindExtensions = async function (...args) {
  sessions.set(this.sessionManager, this);
  return bind.apply(this, args);
};
const input = 'CURRENT_INPUT_MARKER P2 boundary';
export default function observer(pi) {
  pi.on('session_start', (_event, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    if (!process.env.PI_P2_MESSAGES) {
    const exceeds = session._exceedsCompactionThreshold;
    session._exceedsCompactionThreshold = (model, projection) => {
      const result = exceeds.call(session, model, projection);
      note('threshold-check', { result, window: model.contextWindow, messages: projection.messages.map(m => ({ role: m.role, tokens: host.estimateTokens(m), ...(m.role === 'system' ? { message: m } : {}) })),
        rawTokens: projection.messages.reduce((sum, m) => sum + host.estimateTokens(m), 0) });
      return result;
    };
    }
    const runtime = session.modelRuntime;
    const stream = runtime.streamSimple;
    runtime.streamSimple = (model, context, options) => {
      note('transport-context', { model: model.id, tokens: context.messages.reduce((sum, m) => sum + host.estimateTokens(m), 0), roles: context.messages.map(m => m.role) });
      return stream.call(runtime, model, context, { ...options, fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')] });
    };
    session.subscribe(event => {
      if (['compaction_start', 'compaction_end', 'agent_settled'].includes(event.type)) note(event.type, { success: !!event.result, error: event.errorMessage, aborted: event.aborted,
        checkpoints: session.sessionManager.getEntries().filter(e => e.type === 'compaction').length,
        projectedTokens: session.sessionManager.buildSessionProjection().messages.reduce((sum, m) => sum + host.estimateTokens(m), 0) });
    });
    note('ready', { pid: process.pid, version: host.VERSION, extensions: session._resourceLoader.getExtensions().extensions.map(e => e.path) });
  });
  pi.on('model_select', event => note('model-select', { model: event.model.id, window: event.model.contextWindow }));
  pi.on('session_before_compact', event => note('before-compact', { reason: event.reason, customInstructions: event.customInstructions, settings: sessions.values().next().value.settingsManager.getCompactionSettings(event.model) }));
  pi.on('session_compact', event => note('extension-success', { id: event.compactionEntry.id }));
  pi.registerCommand('p2-budget', { description: 'Seed exact synthetic projection', handler: async (args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    const target = Number(args);
    const assistant = { role: 'assistant', content: [{ type: 'text', text: 'Synthetic old reply.' }], api: 'openai-responses', provider: 'fixture', model: 'fixture-model',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 0 };
    const recent = { role: 'user', content: 'Recent synthetic history. '.repeat(10), timestamp: 1 };
    const projection = ctx.sessionManager.buildSessionProjection();
    const system = projection.messages.some(m => m.role === 'system') ? [] : [{ role: 'system', content: '', sections: { preamble: 'Synthetic fixture only.', cwd: `<cwd>\n${ctx.cwd}\n</cwd>` } }];
    const overhead = [...projection.messages, ...system].reduce((sum, m) => sum + host.estimateTokens(m), 0) + host.estimateTokens(assistant) + host.estimateTokens(recent) + host.estimateTokens({ role: 'user', content: input, timestamp: 2 });
    ctx.sessionManager.appendMessage({ role: 'user', content: 'x'.repeat((target - overhead) * 4), timestamp: 0 });
    ctx.sessionManager.appendMessage(assistant);
    ctx.sessionManager.appendMessage(recent);
    session.refreshContext();
    const messages = [...system, ...ctx.sessionManager.buildSessionProjection().messages, { role: 'user', content: input, timestamp: 2 }];
    note('budget', { target, actual: messages.reduce((sum, m) => sum + host.estimateTokens(m), 0), window: session.model.contextWindow,
      messages: messages.map(m => ({ role: m.role, tokens: host.estimateTokens(m) })), nativeSettings: session.settingsManager.getCompactionSettings(session.model) });
    ctx.ui.notify(`Synthetic projected input: ${target} tokens`, 'info');
  } });
  pi.registerCommand('p2-state', { description: 'Read actual state and projection', handler: async (_args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    note('state', { model: session.model.id, provider: session.model.provider, window: session.model.contextWindow,
      projected: ctx.sessionManager.buildSessionProjection().messages.map(m => ({ role: m.role, tokens: host.estimateTokens(m) })),
      state: globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session)?.controller.state.kind,
      entries: ctx.sessionManager.getEntries().length });
  } });
}
