import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { randomUUID } from 'node:crypto';
import { privateTree, digest, durableWrite, restrictedCredentials, refuse } from '../live/guard.mjs';
import { ROOT, controls, fileManifest, normalizeHistory, targetFor, hashJSON } from './spec.mjs';
import { validateComparisonGrant } from './budget.mjs';
import { comparisonFetch } from './transport.mjs';
import { fixtureTransport } from './fixture.mjs';
import { writeFixtureCredentials } from '../live/fixture.mjs';
export const systemPrompt = 'Continue the synthetic software maintenance task accurately. Use only the declared tools. Before any workspace access, record the facts, pending tasks and state at compaction once. Complete the pending business implementation and run the fixed regression. Preserve protected files.';
export function discoverHost() {
  const shim = execFileSync('/usr/bin/which', ['pi'], { encoding: 'utf8' }).trim();
  const target = fs.readFileSync(shim, 'utf8').match(/# cmd-shim-target=(.+)/)?.[1];
  if (!target) refuse('HOST_SHIM_UNSUPPORTED');
  const installed = fs.realpathSync(resolve(target, '../../..'));
  if (JSON.parse(fs.readFileSync(join(installed, 'package.json'))).version !== '1.5.2') refuse('HOST_VERSION_UNSUPPORTED');
  const ai = fs.realpathSync(join(installed, '../pi-ai'));
  const sources = { host: fileManifest(join(installed, 'dist')), ai: fileManifest(join(ai, 'dist')), hostPackage: digest(fs.readFileSync(join(installed, 'package.json'))), aiPackage: digest(fs.readFileSync(join(ai, 'package.json'))), node: digest(fs.readFileSync(process.execPath)) };
  for (const name of ['pi-agent-core', 'pi-tui', 'pi-mcp', 'pi-codemode']) {
    const dependency = fs.realpathSync(join(installed, '..', name));
    sources[name] = { package: digest(fs.readFileSync(join(dependency, 'package.json'))), dist: fileManifest(join(dependency, 'dist')) };
  }
  const jiti = fs.realpathSync(join(installed, '../../jiti'));
  sources.jiti = { package: digest(fs.readFileSync(join(jiti, 'package.json'))), dist: fileManifest(join(jiti, 'dist')) };
  return { shim, installed, ai, sources, version: '1.5.2', node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release(), osVersion: os.version(), compilerHash: digest(fs.readFileSync('/usr/bin/clang')), sourceHash: hashJSON({ sources, platform: process.platform, arch: process.arch, osRelease: os.release(), compilerHash: digest(fs.readFileSync('/usr/bin/clang')) }) };
}
export function isolatedEnv(raw) {
  return { PATH: process.env.PATH, HOME: join(raw, 'home'), PI_CODING_AGENT_DIR: join(raw, 'agent'), PI_OFFLINE: '1', TMPDIR: join(raw, 'tmp'), JITI_FS_CACHE: 'false', LANG: 'en_US.UTF-8' };
}
export function installPackage(host, packageFile, dir) {
  privateTree(dir, { create: true });
  const raw = join(dir, 'raw'); privateTree(raw, { create: true });
  for (const name of ['agent', 'home', 'tmp']) privateTree(join(raw, name), { create: true });
  const pkg = join(raw, 'package');
  if (!fs.existsSync(pkg)) {
    const members = execFileSync('tar', ['-tzf', packageFile], { encoding: 'utf8' }).trim().split('\n');
    if (members.some(p => !p.startsWith('package/') || p.includes('..') || p.includes('auth') || p.includes('node_modules'))) refuse('PACKAGE_MEMBERS_INVALID');
    const types = execFileSync('tar', ['-tvzf', packageFile], { encoding: 'utf8' }).trim().split('\n');
    if (types.some(line => !['-', 'd'].includes(line[0]))) refuse('PACKAGE_LINK_DENIED');
    execFileSync('tar', ['-xzf', packageFile, '-C', raw]); privateTree(pkg, { seal: true });
    durableWrite(join(raw, 'agent/settings.json'), controls); durableWrite(join(raw, 'control.json'), {});
    execFileSync(host.shim, ['install', pkg, '--approve'], { cwd: raw, env: { ...isolatedEnv(raw), NODE_OPTIONS: '--import=' + join(ROOT, 'scripts/fixture/preload.mjs'), PI_FIXTURE_LOG: join(raw, 'install.jsonl'), PI_FIXTURE_CONTROL: join(raw, 'control.json') }, stdio: 'pipe' });
  }
  const installedSettings = JSON.parse(fs.readFileSync(join(raw, 'agent/settings.json')));
  if (hashJSON(installedSettings) !== hashJSON({ ...controls, packages: ['../package'] })) refuse('PACKAGE_INSTALL_FAILED');
  const expected = JSON.parse(fs.readFileSync(resolve('artifacts/P6-isolation-fixes/release/manifest.json')));
  if (digest(fs.readFileSync(packageFile)) !== expected.sha256 || hashJSON(fileManifest(pkg)) !== hashJSON(Object.fromEntries(Object.entries(expected.files).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => [name, value.sha256])))) refuse('INSTALLED_PACKAGE_HASH_MISMATCH');
  return { pkg, raw, installedSettings, manifest: fileManifest(pkg) };
}
export async function loadRuntime({ grant, installation, hostInfo, ledger, active, fault }) {
  validateComparisonGrant(grant, grant.binding, grant.mode);
  const { raw } = installation;
  if (grant.mode === 'offline-fixture') {
    process.env.PI_FIXTURE_LOG = join(raw, 'network-denials.jsonl'); process.env.PI_FIXTURE_CONTROL = join(raw, 'control.json');
    await import('../fixture/preload.mjs');
  } else if (fault) refuse('REAL_FIXTURE_FAULT_DENIED');
  const { networkBoundary } = await import('../live/network.mjs');
  const network = networkBoundary(grant.mode);
  const read = fs.readFileSync;
  fs.readFileSync = function (path, ...args) { if ([ROOT + '/src/', ROOT + '/node_modules/'].some(p => String(path).startsWith(p))) refuse('DEVELOPMENT_SOURCE_DENIED'); return read.call(this, path, ...args); };
  syncBuiltinESMExports();
  const host = await import(pathToFileURL(join(hostInfo.installed, 'dist/index.js')).href);
  const compaction = await import(pathToFileURL(join(hostInfo.installed, 'dist/core/compaction/compaction.js')).href);
  const authPath = grant.mode === 'offline-fixture' ? writeFixtureCredentials(join(raw, 'agent')) : grant.authPath;
  const runtime = await host.ModelRuntime.create({ credentials: restrictedCredentials(authPath, grant.targets), modelsPath: null, modelsStorePath: join(raw, 'agent/model-store.json'), allowModelNetwork: false, refreshOnCreate: true });
  const send = grant.mode === 'offline-fixture' ? fixtureTransport(() => active.lane, () => active.data, fault) : network.send;
  const stream = runtime.streamSimple;
  const operationScope = new AsyncLocalStorage();
  runtime.streamSimple = (model, context, options = {}) => {
    const target = grant.targets.find(t => t.model === model.id && t.provider === model.provider && t.api === model.api && t.baseUrl === model.baseUrl.replace(/\/$/, ''));
    if (!target || target.model !== active.lane.model) refuse('RUNTIME_MODEL_DENIED');
    const onPayload = options.onPayload;
    const requestStage = operationScope.getStore() ?? 'continuation';
    return stream.call(runtime, model, context, { ...options, reasoning: 'off', transport: 'sse', maxRetries: 0, maxTokens: 1000, signal: options.signal ? AbortSignal.any([options.signal, active.abort.signal]) : active.abort.signal, fetch: comparisonFetch(ledger, target, send, requestStage), async onPayload(payload, resolvedModel) {
      const body = await onPayload?.(payload, resolvedModel) ?? payload;
      if (resolvedModel.id !== target.model || resolvedModel.provider !== target.provider || resolvedModel.baseUrl.replace(/\/$/, '') !== target.baseUrl) refuse('RUNTIME_MODEL_DENIED');
      // Installed Codex SDK does not emit this cap from maxTokens; explicitly inject the common bounded-experiment field, then verify the final encoded bytes.
      return { ...body, max_output_tokens: 1000 };
    } });
  };
  return { host, compaction, runtime, network, operationScope };
}
export async function createSession({ loaded, installation, lane, data, workspace, tools }) {
  const { host, runtime, compaction } = loaded;
  const catalogModel = runtime.getModel('openai-codex', lane.model);
  const model = catalogModel && { ...catalogModel, compat: { ...catalogModel.compat, supportsAdditionalTools: false, supportsToolSearch: false } };
  if (!model || model.api !== targetFor(lane.model).api || model.baseUrl.replace(/\/$/, '') !== targetFor(lane.model).baseUrl) refuse('MODEL_UNAVAILABLE');
  const settingsManager = host.SettingsManager.inMemory({ ...installation.installedSettings, packages: lane.arm === 'pi-native' ? [] : installation.installedSettings.packages });
  const loader = new host.DefaultResourceLoader({ cwd: workspace, agentDir: join(installation.raw, 'agent'), settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPromptOverride: () => systemPrompt });
  await loader.reload();
  const entries = normalizeHistory(data.history, lane.model);
  const sessionId = randomUUID();
  const sessionDir = join(installation.raw, 'sessions', lane.id); privateTree(sessionDir, { create: true });
  const sessionFile = join(sessionDir, sessionId + '.jsonl');
  fs.writeFileSync(sessionFile, [{ type: 'session', version: 3, id: sessionId, cwd: workspace, timestamp: '2026-01-01T00:00:00.000Z' }, ...entries].map(e => JSON.stringify(e)).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  const manager = host.SessionManager.open(sessionFile, sessionDir, workspace);
  const created = await host.createAgentSession({ cwd: workspace, agentDir: join(installation.raw, 'agent'), modelRuntime: runtime, model, resourceLoader: loader, settingsManager, sessionManager: manager, noTools: 'builtin', tools: lane.phase === 'pilot' ? [] : tools.definitions.map(t => t.name), customTools: lane.phase === 'pilot' ? [] : tools.definitions, thinkingLevel: 'off' });
  const session = created.session; await session.bindExtensions({});
  const defaultCompaction = session._runDefaultCompaction;
  if (typeof defaultCompaction !== 'function') refuse('HOST_COMPACTION_BOUNDARY_MISSING');
  session._runDefaultCompaction = (...args) => loaded.operationScope.run('compact', () => defaultCompaction.apply(session, args));
  const managed = !!globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session);
  const paths = loader.getExtensions().extensions.map(e => e.path);
  if (managed !== (lane.arm !== 'pi-native') || (managed && !paths.includes(join(installation.pkg, 'src/index.ts')))) refuse('INSTALL_DISCOVERY_MISMATCH');
  const prepared = compaction.prepareCompaction(manager.getBranch(), controls.compaction);
  const cut = entries.findIndex(e => e.id === prepared?.firstKeptEntryId);
  if (!prepared || prepared.isSplitTurn || prepared.previousSummary || cut !== 227 || prepared.messagesToSummarize.length !== 227 || Math.max(...data.history.filter(m => m.role === 'toolResult').map(m => m.content[0].text.length)) > 2000) refuse('BOUNDARY_PREFLIGHT_FAILED');
  const criticalEntries = [...Array.from({ length: 11 }, (_, i) => 'e' + i), 'e58'];
  const criticalBeforeCut = criticalEntries.every(id => { const i = entries.findIndex(e => e.id === id); return i >= 0 && i < cut; });
  if (!criticalBeforeCut) refuse('CRITICAL_HISTORY_OUTSIDE_PREFIX');
  const boundary = { model: lane.model, task: lane.task, firstKeptEntryId: prepared.firstKeptEntryId, isSplitTurn: prepared.isSplitTurn, prefixEntries: prepared.messagesToSummarize.length, retainedEntries: entries.length - cut, criticalEntries, criticalBeforeCut, rawHistoryHash: hashJSON(entries.map(e => e.message)), prefixHash: hashJSON(prepared.messagesToSummarize), tailHash: hashJSON(entries.slice(cut).map(e => e.message)), systemPromptHash: digest(systemPrompt), workspacePathHash: digest(workspace), noPriorCheckpoint: prepared.previousSummary === undefined, managed, extensionPaths: paths.map(p => p.replace(installation.pkg, '<installed-package>')), modelSpec: { contextWindow: model.contextWindow, maxTokens: model.maxTokens, reasoning: model.reasoning, thinkingLevelMap: model.thinkingLevelMap, commonToolEncoding: 'top-level-functions', supportsAdditionalTools: false, supportsToolSearch: false }, settings: controls.compaction, customInstructions: null };
  return { session, boundary };
}
