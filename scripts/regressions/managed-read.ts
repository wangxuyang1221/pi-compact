import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ event, ...data }) + '\n');

export default function managedRead(pi) {
  pi.on('input', () => ({ action: 'handled' }));
  pi.on('session_start', async (_event, ctx) => {
    const registry = globalThis[Symbol.for('pi-compact.adapter.v1')];
    const dir = join(ctx.cwd, 'sdk-child');
    mkdirSync(dir, { recursive: true });
    const runtime = await host.ModelRuntime.create({
      authPath: join(process.env.PI_CODING_AGENT_DIR, 'auth.json'),
      modelsPath: join(process.env.PI_CODING_AGENT_DIR, 'models.json'),
    });
    const stream = runtime.streamSimple;
    runtime.streamSimple = (model, context, options) => stream.call(runtime, model, context, {
      ...options, fetch: globalThis[Symbol.for('pi-compact.fixture.fetch')],
    });
    const settingsManager = host.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off' });
    const resourceLoader = new host.DefaultResourceLoader({
      cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
      additionalExtensionPaths: registry ? [...registry.entrypoints] : [],
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      systemPrompt: 'Synthetic managed SDK read.',
    });
    await resourceLoader.reload();
    const { session } = await host.createAgentSession({
      cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, modelRuntime: runtime, model: ctx.model,
      settingsManager, sessionManager: host.SessionManager.create(dir, dir), resourceLoader, tools: [],
    });
    try {
      await session.bindExtensions({ onError: error => note('extension-error', { error: String(error) }) });
      await session.prompt('CURRENT_INPUT_MARKER public read control');
      const file = session.sessionManager.getSessionFile();
      const before = readFileSync(file);
      let result, error;
      try { result = session.sessionManager.buildSessionContext(); } catch (failure) { error = String(failure); }
      note('sdk-read-result', {
        managed: registry?.bindings.has(session) ?? false, error, messages: result?.messages.length,
        projectionMessages: session.sessionManager.buildSessionProjection().messages.length,
        fileUnchanged: readFileSync(file).equals(before), state: registry?.bindings.get(session)?.controller.state.kind,
        extensions: resourceLoader.getExtensions().extensions.map(extension => extension.resolvedPath),
      });
    } finally { session.dispose(); }
  });
}
