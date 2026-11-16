import { join } from 'node:path';
import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const marker = Symbol.for('pi-compact.fixture.observer');
const sessions = globalThis[marker] ??= new Map();
const proto = host.AgentSession.prototype;
if (!proto[marker]) {
  proto[marker] = true;
  const bind = proto.bindExtensions;
  proto.bindExtensions = async function (...args) {
    sessions.set(this.sessionManager, this);
    const result = await bind.apply(this, args);
    if (!this.agent[marker]) {
      this.agent[marker] = true;
      const prepare = this.agent.prepareRequest;
      this.agent.prepareRequest = async (...args) => {
        const start = performance.now();
        const messages = this.sessionManager.buildSessionProjection().messages;
        note('prepare-input', { currentInput: JSON.stringify(messages).includes('CURRENT_INPUT_MARKER'), messages: messages.length });
        try { return await prepare.apply(this.agent, args); }
        finally { note('prepare-duration', { ms: performance.now() - start }); }
      };
    }
    note('ready', { session: this.sessionManager.getSessionId(), version: host.VERSION, managed: globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.has(this), identity: this instanceof host.AgentSession,
      extensions: this._resourceLoader.getExtensions().extensions.map(extension => extension.path) });
    return result;
  };
}
export default function observer(pi) {
  if (process.env.PI_FIXTURE_UNSUPPORTED === '1') proto._exceedsCompactionThreshold = undefined;
  pi.on('session_start', async (_event, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    if (!session) return;
    if (!Object.hasOwn(session, marker)) {
      session[marker] = true;
      const stream = session.agent.streamFunction;
      session.agent.streamFunction = (model, context, options) => stream(model, context, { ...options, fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')] });
      session.subscribe(event => {
        if (['compaction_start', 'compaction_end', 'agent_settled', 'tool_execution_end'].includes(event.type)) {
          note(event.type, { success: !!event.result, aborted: event.aborted, error: event.errorMessage,
            tool: event.toolName, outcome: session.agent.state.messages.findLast(message => message.role === 'assistant')?.stopReason, checkpoints: session.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length });
        }
      });
      if (process.env.PI_FIXTURE_SEED && !ctx.sessionManager.getEntries().some(entry => entry.type === 'message')) {
        ctx.sessionManager.appendMessage({ role: 'user', content: 'Synthetic old history. '.repeat(Number(process.env.PI_FIXTURE_SEED)), timestamp: 0 });
        ctx.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Prior synthetic reply.' }], api: 'openai-responses', provider: 'fixture', model: 'fixture-model', usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 0 });
        ctx.sessionManager.appendMessage({ role: 'user', content: 'Recent retained synthetic input. '.repeat(10), timestamp: 1 });
        session.refreshContext();
      }
    }
    note('session-start', { reason: _event.reason });
  });
  for (const [index, name] of ['alpha', 'beta', 'gamma'].entries()) {
    pi.registerTool({ name, label: name, description: 'Synthetic bounded tool workload', parameters: { type: 'object', properties: {} },
      async execute() {
        await new Promise(resolve => setTimeout(resolve, (3 - index) * 80));
        note('tool-complete', { name });
        return { content: [{ type: 'text', text: name.repeat(400) }], details: {} };
      } });
  }
  let failureRetryAttempted = false;
  pi.on('session_compact_failed', async (_event, ctx) => {
    const control = JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL, 'utf8'));
    if (!control.retryFromFailureHook || failureRetryAttempted) return;
    failureRetryAttempted = true;
    await new Promise(resolve => ctx.compact({
      onComplete: () => { note('failure-hook-retry', { rejected: false }); resolve(); },
      onError: error => { note('failure-hook-retry', { rejected: true, error: String(error) }); resolve(); },
    }));
  });
  pi.on('before_provider_request', event => {
    const control = JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL, 'utf8'));
    if (control.mutatePayload) return { ...event.payload, fixtureModification: true };
    if (control.throwHook) throw new Error('Synthetic hook error is not a veto');
  });
  pi.on('session_compact', (event, ctx) => {
    note('extension-success', { checkpointId: event.compactionEntry.id, state: globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(sessions.get(ctx.sessionManager))?.controller.state.kind });
  });
  pi.on('session_before_compact', async () => {
    const control = JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL, 'utf8'));
    if (control.reentry) {
      for (const session of sessions.values()) {
        try { await session._runAutoCompaction('threshold', false); }
        catch (error) { note('reentry-rejected', { error: String(error) }); }
      }
    }
  });
  pi.registerCommand('fixture-probe', { description: 'Exercise blocked session entry points', handler: async (_args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    const before = session.sessionManager.getEntries().length;
    for (const [name, call] of [
      ['post-run', () => session._handlePostAgentRun()], ['before-settle', () => session._runBeforeSettleBoundary()],
      ['continue', () => session.agent.continue()], ['auto', () => session._runAutoCompaction('threshold', false)],
      ['manual-extension', () => session.compact()],
      ['model-change', () => session.setModel({ ...session.model, id: 'fixture-alternate' })],
      ['sendUserMessage', () => session.sendUserMessage('blocked extension input marker')],
      ['steer', () => session.steer('queued steering marker')], ['followUp', () => session.followUp('queued followup marker')],
      ['prompt', () => session.prompt('blocked normal marker')],
    ]) {
      try { await call(); note('entry-probe', { name, rejected: false }); }
      catch (error) { note('entry-probe', { name, rejected: true, message: String(error) }); }
    }
    session.setCacheWarmingMode('idle');
    session._cacheWarmer.start({ model: session.model, context: {}, options: {} }, () => true);
    note('probe-complete', { before, after: session.sessionManager.getEntries().length, queued: session.agent.peekQueuedMessages().length,
      warming: session.cacheWarmingStatus, warmRunExists: !!session._cacheWarmer.run, state: globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session)?.controller.state.kind });
  } });
  pi.registerCommand('fixture-write-failure', { description: 'Inject a native persistence failure', handler: async (_args, ctx) => {
    const manager = ctx.sessionManager;
    const persist = manager._persist;
    manager._persist = function (entry) {
      if (entry.type === 'compaction') throw new Error('Synthetic native disk failure');
      return persist.call(this, entry);
    };
    note('write-failure-armed');
  } });
  pi.registerCommand('fixture-isolation', { description: 'Check two actual sessions in this CLI process', handler: async (_args, ctx) => {
    const parent = sessions.get(ctx.sessionManager);
    const children = [];
    try {
      for (const name of ['one', 'two']) {
        const dir = join(ctx.cwd, name);
        mkdirSync(dir, { recursive: true });
        const settingsManager = host.SettingsManager.inMemory({ compaction: { enabled: true, reserveTokens: 1001, keepRecentTokens: 40 }, retry: { enabled: false } });
        const resourceLoader = new host.DefaultResourceLoader({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
          additionalExtensionPaths: parent._resourceLoader.getExtensions().extensions.map(extension => extension.path),
          noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPrompt: 'Synthetic multi-session test.' });
        await resourceLoader.reload();
        const { session } = await host.createAgentSession({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, modelRuntime: parent.modelRuntime,
          model: parent.model, settingsManager, sessionManager: host.SessionManager.create(dir, dir), resourceLoader, tools: [] });
        children.push(session);
        await session.bindExtensions({ onError: error => note('child-extension-error', { error: error.error }) });
      }
      const [one, two] = children;
      one.subscribe(event => { if (event.type === 'compaction_start') queueMicrotask(() => one.abortCompaction()); });
      await Promise.allSettled([one.compact(), two.compact()]);
      const registry = globalThis[Symbol.for('pi-compact.adapter.v1')];
      note('same-process-isolation', { one: registry.bindings.get(one).controller.state.kind, two: registry.bindings.get(two).controller.state.kind,
        oneCheckpoints: one.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length,
        twoCheckpoints: two.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length });
      one.dispose(); children.shift();
      await two.prompt('CURRENT_INPUT_MARKER continue after other session dispose');
      note('same-process-continued', { state: registry.bindings.get(two).controller.state.kind });
    } finally { for (const session of children) session.dispose(); }
  } });
  pi.registerCommand('fixture-state', { description: 'Record synthetic session state', handler: async (_args, ctx) => {
    const session = sessions.get(ctx.sessionManager);
    note('state', { state: globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session)?.controller.state.kind,
      checkpoints: ctx.sessionManager.getEntries().filter(entry => entry.type === 'compaction').length,
      control: JSON.parse(readFileSync(process.env.PI_FIXTURE_CONTROL, 'utf8')) });
  } });
}
