import * as host from '@earendil-works/pi-coding-agent';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const key = Symbol.for('pi-compact.renderer.v1');
const note = (event, data = {}) => appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event, ...data }) + '\n');
const modeFor = ctx => globalThis[Symbol.for('pi-compact.p5.observer')].modes.get(ctx.sessionManager);
const label = component => component.render(90).join('').includes('Context compacted');
const stateKey = Symbol.for('pi-compact.independent-review');
export default function review(pi) {
  const state = globalThis[stateKey] ??= { nativeAdd: host.InteractiveMode.prototype.addMessageToChat, nativeDispose: host.AgentSession.prototype.dispose, retained: [] };
  pi.on('session_start', (_event, ctx) => {
    const session = modeFor(ctx).session;
    note('review-start', { registry: !!globalThis[key], bindings: globalThis[key]?.bindings.size,
      nativeAdd: host.InteractiveMode.prototype.addMessageToChat === state.nativeAdd,
      extensions: session._resourceLoader.getExtensions().extensions.map(e => e.resolvedPath) });
  });
  pi.registerCommand('review-enable', { handler: async (_arg, ctx) => {
    const loader = modeFor(ctx).session._resourceLoader;
    if (!loader.additionalExtensionPaths.includes(process.env.REVIEW_PRODUCT)) loader.additionalExtensionPaths.push(process.env.REVIEW_PRODUCT);
    await ctx.reload();
  } });
  pi.registerCommand('review-chain', { handler: async (_arg, ctx) => {
    const mode = modeFor(ctx);
    const component = mode.chatContainer.children.findLast(c => c instanceof host.CompactionSummaryMessageComponent);
    const original = component.render;
    const peer = function (width) { return [...original.call(this, width), 'REVIEW PEER INSTANCE']; };
    component.render = peer;
    state.retained.push({ component, peer });
    if (!state.peerAdd) {
      const prior = host.InteractiveMode.prototype.addMessageToChat;
      state.peerAdd = function (...args) { state.peerCalls = (state.peerCalls ?? 0) + 1; return prior.apply(this, args); };
      host.InteractiveMode.prototype.addMessageToChat = state.peerAdd;
    }
    note('review-chain', { enabled: label(component), instancePeer: component.render === peer });
  } });
  pi.registerCommand('review-state', { handler: async (_arg, ctx) => {
    const mode = modeFor(ctx);
    note('review-state', { registry: !!globalThis[key], bindings: globalThis[key]?.bindings.size,
      peerPrototype: host.InteractiveMode.prototype.addMessageToChat === state.peerAdd,
      peerCalls: state.peerCalls,
      currentDividers: mode.chatContainer.children.filter(c => c instanceof host.CompactionSummaryMessageComponent && label(c)).length,
      retained: state.retained.map(({ component, peer }) => ({ enabled: label(component), peer: component.render === peer, marker: component.render(90).includes('REVIEW PEER INSTANCE') })) });
  } });
  pi.registerCommand('review-final-dispose', { handler: async (_arg, ctx) => {
    const mode = modeFor(ctx), session = mode.session, manager = session.sessionManager;
    const file = manager.getSessionFile();
    const component = mode.chatContainer.children.findLast(c => c instanceof host.CompactionSummaryMessageComponent);
    session.agent.followUp({ role: 'user', content: 'CURRENT_INPUT_MARKER final disposed queue', timestamp: 0 });
    const before = session.agent.peekQueuedMessages();
    session.dispose(); session.dispose();
    let error; try { await session.agent.continue(); } catch (e) { error = String(e); }
    note('review-final-dispose', { uiRegistryReleased: !globalThis[key], safetyRegistryReleased: !globalThis[Symbol.for('pi-compact.adapter.v1')],
      addRestoredToPeer: host.InteractiveMode.prototype.addMessageToChat === state.peerAdd,
      disposeRestored: host.AgentSession.prototype.dispose === state.nativeDispose,
      dividerGone: !label(component), lockReleased: !existsSync(file + '.pi-compact-state.json.lock'), before, after: session.agent.peekQueuedMessages(), error });
  } });
  pi.registerCommand('review-multi', { handler: async (_arg, ctx) => {
    const parent = modeFor(ctx).session;
    const children = [];
    const make = async (name, managed) => {
      const dir = join(ctx.cwd, name); mkdirSync(dir, { recursive: true });
      const settingsManager = host.SettingsManager.inMemory({ compaction: { enabled: false } });
      const resourceLoader = new host.DefaultResourceLoader({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
        additionalExtensionPaths: managed ? [process.env.REVIEW_PRODUCT] : [], noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPrompt: 'Synthetic review.' });
      await resourceLoader.reload();
      const { session } = await host.createAgentSession({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR,
        modelRuntime: parent.modelRuntime, model: parent.model, settingsManager, sessionManager: host.SessionManager.create(dir, dir), resourceLoader, tools: [] });
      children.push(session);
      await session.bindExtensions({ onError: e => note('review-child-error', { error: String(e) }) });
      const mode = Object.setPrototypeOf({ runtimeHost: { session }, chatContainer: { children: [], addChild(c) { this.children.push(c); } },
        getMarkdownThemeWithSettings: host.getMarkdownTheme, getMarkdownTransformers: () => [], outputPad: 1, toolOutputExpanded: false, ui: { requestRender() {} } }, host.InteractiveMode.prototype);
      mode.addMessageToChat({ role: 'compactionSummary', summary: 'Synthetic child summary.', tokensBefore: 4200 });
      return { session, component: mode.chatContainer.children.at(-1) };
    };
    try {
      const a = await make('child-a', true), b = await make('child-b', true), u = await make('child-unmanaged', false);
      const managerA = a.session.sessionManager, managerB = b.session.sessionManager;
      note('review-multi-before', { a: label(a.component), b: label(b.component), unmanaged: label(u.component), bindings: globalThis[key]?.bindings.size });
      a.session.dispose(); a.session.dispose();
      note('review-multi-after-a', { a: label(a.component), b: label(b.component), bindings: globalThis[key]?.bindings.size,
        aReleased: !globalThis[key]?.bindings.has(managerA), bActive: globalThis[key]?.bindings.has(managerB),
        aLockReleased: !existsSync(managerA.getSessionFile() + '.pi-compact-state.json.lock') });
      b.session.agent.followUp({ role: 'user', content: 'CURRENT_INPUT_MARKER disposed child queue', timestamp: 0 });
      const before = b.session.agent.peekQueuedMessages();
      b.session.dispose(); b.session.dispose();
      let error; try { await b.session.agent.continue(); } catch (e) { error = String(e); }
      note('review-multi-after-b', { b: label(b.component), bindings: globalThis[key]?.bindings.size, before, after: b.session.agent.peekQueuedMessages(), error,
        bReleased: !globalThis[key]?.bindings.has(managerB), bLockReleased: !existsSync(managerB.getSessionFile() + '.pi-compact-state.json.lock') });
    } finally { for (const session of children) session.dispose(); }
    note('review-multi-done');
  } });
}
