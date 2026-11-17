import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
export default function scopeProbe(pi) {
  pi.on('input', () => ({ action: 'handled' }));
  pi.on('session_start', async (_event, ctx) => {
    const key = Symbol.for('pi-compact.adapter.v1');
    const registry = globalThis[key];
    const attempt = async (name, run) => {
      try { note('scope-result', { name, ok: true, value: await run() }); }
      catch (e) { note('scope-result', { name, ok: false, error: String(e), stack: e.stack }); }
    };
    const memory = host.SessionManager.inMemory(ctx.cwd);
    await attempt('unmanaged-memory-read', () => memory.buildSessionContext());
    await attempt('unmanaged-memory-append', () => memory.appendMessage({ role: 'user', content: 'synthetic in-memory input', timestamp: 0 }));
    await attempt('attached-public-read', () => ctx.sessionManager.buildSessionContext());
    await attempt('attached-projection-read', () => ({ messages: ctx.sessionManager.buildSessionProjection().messages.length }));
    const runtime = await host.ModelRuntime.create({ authPath: join(process.env.PI_CODING_AGENT_DIR, 'auth.json'), modelsPath: join(process.env.PI_CODING_AGENT_DIR, 'models.json') });
    const stream = runtime.streamSimple;
    runtime.streamSimple = (model, context, options) => stream.call(runtime, model, context, { ...options, fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')] });
    async function make(manager, dir) {
      mkdirSync(dir, { recursive: true });
      const settingsManager = host.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off' });
      const resourceLoader = new host.DefaultResourceLoader({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPrompt: 'Synthetic scope fixture.' });
      await resourceLoader.reload();
      note('child-extensions', { paths: resourceLoader.getExtensions().extensions.map(e => e.resolvedPath) });
      return (await host.createAgentSession({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, modelRuntime: runtime, model: ctx.model, sessionManager: manager, settingsManager, resourceLoader, tools: [] })).session;
    }
    await attempt('unmanaged-memory-sdk-prompt', async () => {
      const child = await make(host.SessionManager.inMemory(ctx.cwd), join(ctx.cwd, 'memory-child'));
      try { await child.prompt('CURRENT_INPUT_MARKER unmanaged-memory-child'); return { managed: registry?.bindings.has(child) ?? false, messages: child.sessionManager.getEntries().length }; }
      finally { child.dispose(); }
    });
    await attempt('unmanaged-persistent-sdk-prompt', async () => {
      const dir = join(ctx.cwd, 'persistent-child');mkdirSync(dir, {recursive:true});
      const manager = host.SessionManager.create(dir, dir);
      const child = await make(manager, dir);
      const file = manager.getSessionFile();
      try {
        await child.prompt('CURRENT_INPUT_MARKER unmanaged-persistent-child');
        await attempt('unmanaged-persistent-read', () => ({ messages: manager.buildSessionContext().messages.length }));
        note('unmanaged-owner', { managed: registry?.bindings.has(child) ?? false, lock: existsSync(file + '.pi-compact-state.json.lock'), file });
      } finally { child.dispose(); }
      note('unmanaged-disposed-lock', { lock: existsSync(file + '.pi-compact-state.json.lock'), file });
      await attempt('unmanaged-reopen-read', () => ({ messages: host.SessionManager.open(file).buildSessionContext().messages.length }));
      return { file };
    });
    note('scope-complete', { managedParent: !!registry });
  });
}
