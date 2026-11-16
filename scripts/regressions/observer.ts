import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const transport = Symbol.for('pi-compact.regression.transport');

export default function observer(pi) {
  let failures = 0;
  pi.on('session_shutdown', async (_event, ctx) => {
    if (process.env.PI_FIXTURE_PROBE !== 'dispose') return;
    const key = Symbol.for('pi-compact.adapter.v1');
    const registry = globalThis[key];
    const session = registry.candidates.get(ctx.sessionManager);
    const dispatcher = host.AgentSession.prototype._buildRuntime;
    session.agent.followUp({ role: 'user', content: 'Disposed last session queued input', timestamp: 0 });
    const before = session.agent.peekQueuedMessages();
    session.dispose();
    let error;
    try { await session.agent.continue(); } catch (e) { error = String(e); }
    note('last-disposed-probe', { before, after: session.agent.peekQueuedMessages(), error,
      registryReleased: !globalThis[key], dispatcherReleased: host.AgentSession.prototype._buildRuntime !== dispatcher,
      lockReleased: !existsSync(session.sessionManager.getSessionFile() + '.pi-compact-state.json.lock') });
  });
  pi.on('session_compact_failed', async () => {
    if (!process.env.PI_FIXTURE_FAILURE_GATE || failures++) return;
    note('failure-hook-enter');
    while (!existsSync(process.env.PI_FIXTURE_FAILURE_GATE)) await new Promise(resolve => setTimeout(resolve, 20));
    note('failure-hook-release');
  });
  pi.on('session_compact', event => note('extension-success', { id: event.compactionEntry.id }));
  pi.on('session_start', async (_event, ctx) => {
    const registry = globalThis[Symbol.for('pi-compact.adapter.v1')];
    const session = registry.candidates.get(ctx.sessionManager);
    const runtime = session.modelRuntime;
    if (!runtime[transport]) {
      runtime[transport] = true;
      const stream = runtime.streamSimple;
      runtime.streamSimple = (model, context, options) => stream.call(runtime, model, context, { ...options, fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')] });
    }
    session.subscribe(event => {
      if (['compaction_start', 'compaction_end', 'agent_settled'].includes(event.type)) note(event.type, { success: !!event.result, error: event.errorMessage });
    });
    if (process.env.PI_FIXTURE_SEED !== '0' && !ctx.sessionManager.getEntries().some(entry => entry.type === 'message')) {
      ctx.sessionManager.appendMessage({ role: 'user', content: 'Synthetic old history. '.repeat(Number(process.env.PI_FIXTURE_SEED)), timestamp: 0 });
      ctx.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Prior synthetic reply.' }], api: 'openai-responses', provider: 'fixture', model: 'fixture-model', usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: 0 });
      ctx.sessionManager.appendMessage({ role: 'user', content: 'Recent retained synthetic input. '.repeat(10), timestamp: 1 });
      session.refreshContext();
    }
    const makeChild = async (dir, manager) => {
      mkdirSync(dir, { recursive: true });
      const settingsManager = host.SettingsManager.inMemory({ compaction: { enabled: false, reserveTokens: 1001, keepRecentTokens: 40 }, retry: { enabled: false } });
      const resourceLoader = new host.DefaultResourceLoader({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
        additionalExtensionPaths: session._resourceLoader.getExtensions().extensions.filter(e => e.path.endsWith('/src/index.ts')).map(e => e.path),
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPrompt: 'Synthetic ownership fixture.' });
      await resourceLoader.reload();
      return (await host.createAgentSession({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, modelRuntime: runtime, model: session.model,
        settingsManager, sessionManager: manager ?? host.SessionManager.create(dir, dir), resourceLoader, tools: [] })).session;
    };
    if (process.env.PI_FIXTURE_PROBE === 'dispose') {
      const child = await makeChild(join(ctx.cwd, 'disposed-child'));
      await child.bindExtensions({ onError: error => note('child-error', { error: String(error) }) });
      child.sessionManager.appendMessage({ role: 'user', content: 'CURRENT_INPUT_MARKER disposed synthetic history', timestamp: 0 });
      child.refreshContext();
      child.agent.followUp({ role: 'user', content: 'CURRENT_INPUT_MARKER delayed disposed followup', timestamp: 0 });
      const before = child.agent.peekQueuedMessages();
      child.dispose();
      const disposedAt = performance.now();
      let error;
      try { await child.agent.continue(); } catch (e) { error = String(e); }
      note('disposed-probe', { disposedAt, before, after: child.agent.peekQueuedMessages(), error,
        released: !existsSync(child.sessionManager.getSessionFile() + '.pi-compact-state.json.lock'), managed: registry.bindings.has(child) });
    }
    if (process.env.PI_FIXTURE_PROBE === 'shared-manager') {
      const file = session.sessionManager.getSessionFile();
      const before = readFileSync(file, 'utf8');
      let child, error;
      try {
        child = await makeChild(join(ctx.cwd, 'shared-child'), session.sessionManager);
        await child.bindExtensions({ onError: e => note('child-error', { error: String(e) }) });
        await child.prompt('CURRENT_INPUT_MARKER shared manager intruder');
      } catch (e) { error = String(e); }
      note('shared-manager-probe', { error, unchanged: readFileSync(file, 'utf8') === before });
      child?.dispose();
    }
    note('ready', { managed: registry.bindings.has(session), version: host.VERSION });
  });
  pi.registerCommand('regression-barrier', { description: 'Confirm TUI input dispatch', handler: async () => note('input-barrier') });
}
