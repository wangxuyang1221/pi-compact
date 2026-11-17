import fs from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { validateGrant, DurableLedger, guardedFetch, durableWrite, digest, refuse, safeFailure, privateTree, restrictedCredentials } from './guard.mjs';
import { task, taskHash, seed, score } from './task.mjs';

export async function execute({ grant, packageFile }) {
  const evidenceDir = grant.evidenceDir;
  validateGrant(grant, { mode: grant.mode, taskHash, packageHash: digest(fs.readFileSync(packageFile)), evidenceDir });
  const runId = randomUUID();
  privateTree(evidenceDir, { create: true });
  const raw = join(evidenceDir, 'raw'); fs.mkdirSync(raw, { recursive: true, mode: 0o700 });
  const grantFile = join(raw, 'grant.json');
  if (fs.existsSync(grantFile)) { if (fs.readFileSync(grantFile, 'utf8').trim() !== JSON.stringify(grant)) refuse('GRANT_REUSE_MISMATCH'); }
  else durableWrite(grantFile, grant);
  for (const path of ['home', 'agent', 'tmp']) fs.mkdirSync(join(raw, path), { recursive: true, mode: 0o700 });
  const env = { PATH: process.env.PATH, HOME: join(raw, 'home'), PI_CODING_AGENT_DIR: join(raw, 'agent'), PI_OFFLINE: '1', TMPDIR: join(raw, 'tmp'), JITI_FS_CACHE: 'false', LANG: 'en_US.UTF-8' };
  const workerPids = [];
  let outputBytes = 0, code, child, cancelled = false;
  const abort = () => { cancelled = true; child?.kill('SIGTERM'); };
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    for (const stage of ['initial', 'restored']) {
      privateTree(evidenceDir);
      child = spawn(process.execPath, [resolve('scripts/live/worker.mjs'), grantFile, packageFile, runId, stage], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
      workerPids.push(child.pid);
      durableWrite(join(evidenceDir, 'processes.json'), { pids: workerPids, sockets: [] });
      child.stdout.on('data', data => { outputBytes += data.length; });
      child.stderr.on('data', data => { outputBytes += data.length; });
      code = await new Promise(resolve => child.once('exit', resolve));
      if (code !== 75 || cancelled) break;
    }
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  const installedPids = fs.existsSync(join(raw, 'install.jsonl')) ? fs.readFileSync(join(raw, 'install.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.event === 'preload').map(e => e.pid) : [];
  const pids = [...new Set([...workerPids, ...installedPids])];
  durableWrite(join(evidenceDir, 'processes.json'), { pids, sockets: [] });
  const alive = pids.some(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
  const listenerCheck = spawnSync('lsof', ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (![0, 1].includes(listenerCheck.status)) refuse('CLEANUP_CHECK_FAILED');
  const listeners = listenerCheck.stdout.trim();
  durableWrite(join(evidenceDir, 'cleanup.json'), { runId, pids, pid: child.pid, exitCode: code, alive, listenerCount: listeners ? listeners.split('\n').length - 1 : 0, childOutputBytesDiscarded: outputBytes, rawMode: fs.statSync(raw).mode & 0o777 });
  if (fs.existsSync(join(evidenceDir, 'result.json'))) {
    const result = JSON.parse(fs.readFileSync(join(evidenceDir, 'result.json'), 'utf8'));
    if (result.runId === runId && code === 0 && !alive && !listeners && result.status === 'pass') return result;
    if (result.runId === runId && result.status === 'failed') return result;
  }
  return { status: 'failed', failure: 'WORKER_EXIT', code };
}

export async function runWorker(grant, packageFile, runId, stage = 'initial') {
  process.umask(0o077);
  if (!['initial', 'restored'].includes(stage)) refuse('STAGE_INVALID');
  validateGrant(grant, { mode: grant.mode, taskHash, packageHash: digest(fs.readFileSync(packageFile)), evidenceDir: grant.evidenceDir });
  privateTree(grant.evidenceDir);
  const raw = join(grant.evidenceDir, 'raw');
  const ledger = new DurableLedger(grant);
  let result = { schema: 1, runId, mode: grant.mode, status: 'running', taskHash, packageHash: grant.packageHash, realResults: 'pending', scenarios: [], started: new Date().toISOString() };
  let network, session, phase = 'startup', runtime;
  const abort = new AbortController();
  const cancel = () => { abort.abort(); session?.abort(); };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  fs.mkdirSync(join(grant.evidenceDir, 'attempts'), { recursive: true });
  const checkpoint = () => { durableWrite(join(grant.evidenceDir, 'attempts', runId + '.json'), result); durableWrite(join(grant.evidenceDir, 'result.json'), result); };
  try {
    let continuationFile;
    if (stage === 'restored') {
      const progress = JSON.parse(fs.readFileSync(join(raw, 'progress.json'), 'utf8'));
      if (progress.runId !== runId || progress.grantHash !== ledger.grantHash || resolve(progress.sessionFile) !== progress.sessionFile || !progress.sessionFile.startsWith(join(raw, 'remote/sessions') + '/') || fs.lstatSync(progress.sessionFile).isSymbolicLink()) refuse('RESTORE_BINDING_INVALID');
      result = progress.result; result.status = 'running';
      continuationFile = progress.sessionFile;
      result.processRestart = { beforeReservations: ledger.rows.length, pid: process.pid, source: 'disk' };
    }
    const root = resolve('.');
    const shim = execFileSync('/usr/bin/which', ['pi'], { encoding: 'utf8' }).trim();
    const target = fs.readFileSync(shim, 'utf8').match(/# cmd-shim-target=(.+)/)?.[1];
    if (!target) refuse('HOST_SHIM_UNSUPPORTED');
    const installed = resolve(target, '../../..');
    if (JSON.parse(fs.readFileSync(join(installed, 'package.json'), 'utf8')).version !== '1.5.2') refuse('HOST_VERSION_UNSUPPORTED');
    result.host = { version: '1.5.2', cliHash: digest(fs.readFileSync(target)), sdkHash: digest(fs.readFileSync(join(installed, 'dist/core/sdk.js'))), node: process.version };
    const members = execFileSync('tar', ['-tzf', packageFile], { encoding: 'utf8' }).trim().split('\n');
    if (members.some(p => !p.startsWith('package/') || p.includes('..') || p.includes('auth') || p.includes('node_modules'))) refuse('PACKAGE_MEMBERS_INVALID');
    const types = execFileSync('tar', ['-tvzf', packageFile], { encoding: 'utf8' }).trim().split('\n');
    if (types.some(line => !['-', 'd'].includes(line[0]))) refuse('PACKAGE_LINK_DENIED');
    execFileSync('tar', ['-xzf', packageFile, '-C', raw]);
    const pkg = join(raw, 'package');
    privateTree(pkg, { seal: true });
    const manifest = {};
    for (const file of fs.readdirSync(pkg, { recursive: true, withFileTypes: true })) {
      if (file.isSymbolicLink()) refuse('PACKAGE_SYMLINK_DENIED');
      if (file.isFile()) { const path = join(file.parentPath, file.name); manifest[path.slice(pkg.length + 1)] = { bytes: fs.statSync(path).size, sha256: digest(fs.readFileSync(path)) }; }
    }
    result.installedManifest = manifest;
    const settings = { compaction: { enabled: true, reserveTokens: 1001, keepRecentTokens: 40 }, retry: { enabled: false }, providerRetry: { maxRetries: 0 }, transport: 'sse', cacheWarming: 'off', quietStartup: true };
    const agentDir = join(raw, 'agent');
    durableWrite(join(agentDir, 'settings.json'), settings);
    const installEnv = { ...process.env, NODE_OPTIONS: '--import=' + join(root, 'scripts/fixture/preload.mjs'), PI_FIXTURE_LOG: join(raw, 'install.jsonl'), PI_FIXTURE_CONTROL: join(raw, 'control.json') };
    durableWrite(join(raw, 'control.json'), {});
    execFileSync(shim, ['install', pkg, '--approve'], { cwd: raw, env: installEnv, stdio: 'pipe' });
    const installedSettings = JSON.parse(fs.readFileSync(join(agentDir, 'settings.json'), 'utf8'));
    if (!installedSettings.packages?.some(p => typeof p === 'string' && resolve(agentDir, p) === pkg)) refuse('PACKAGE_INSTALL_FAILED');
    if (grant.mode === 'offline-fixture') {
      process.env.PI_FIXTURE_LOG = join(raw, 'network-denials.jsonl'); process.env.PI_FIXTURE_CONTROL = join(raw, 'control.json');
      await import('../fixture/preload.mjs');
    }
    const { networkBoundary } = await import('./network.mjs');
    network = networkBoundary(grant.mode);
    const read = fs.readFileSync;
    fs.readFileSync = function (path, ...args) {
      if ([root + '/src/', root + '/node_modules/'].some(prefix => String(path).startsWith(prefix))) refuse('DEVELOPMENT_SOURCE_DENIED');
      return read.call(this, path, ...args);
    };
    syncBuiltinESMExports();
    const host = await import(pathToFileURL(join(installed, 'dist/index.js')).href);
    let authPath = grant.authPath, modelsPath = null, send = network.send;
    if (grant.mode === 'offline-fixture') {
      const { writeFixtureCredentials, fixtureTransport } = await import('./fixture.mjs');
      authPath = writeFixtureCredentials(agentDir);
      modelsPath = join(agentDir, 'models.json');
      durableWrite(modelsPath, { providers: Object.fromEntries(grant.targets.map(t => [t.provider, { baseUrl: t.baseUrl, api: t.api, models: [{ id: t.model, name: t.model, contextWindow: grant.fixtureFault === 'multi-slice' && t.provider === 'deepseek' ? 10000 : 200000, maxTokens: 1000, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] }])) });
      send = fixtureTransport(join(raw, 'opaque-map.json'));
    }
    ledger.check(abort.signal);
    runtime = await host.ModelRuntime.create({ credentials: restrictedCredentials(authPath, grant.targets), modelsPath, allowModelNetwork: false, refreshOnCreate: true });
    const { faultFetch } = grant.mode === 'offline-fixture' ? await import('./faults.mjs') : {};
    const fetches = new Map(grant.targets.map(target => [target.provider, grant.fixtureFault ? faultFetch({ name: grant.fixtureFault, ledger, target, send, phase: () => phase }) : guardedFetch(ledger, target, send, () => phase)]));
    const stream = runtime.streamSimple;
    runtime.streamSimple = (model, context, options = {}) => {
      const allowed = grant.targets.find(t => t.provider === model.provider && t.model === model.id && t.api === model.api && t.baseUrl === model.baseUrl.replace(/\/$/, ''));
      if (!allowed) refuse('RUNTIME_MODEL_DENIED');
      const onPayload = options.onPayload;
      return stream.call(runtime, model, context, { ...options, signal: options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal, transport: 'sse', maxRetries: ['implicit-retry', 'retry-cap'].includes(grant.fixtureFault) ? 1 : 0, maxTokens: grant.perRequestOutputTokens, fetch: fetches.get(allowed.provider),
        async onPayload(payload, resolvedModel) {
          const body = await onPayload?.(payload, resolvedModel) ?? payload;
          if (resolvedModel.id !== allowed.model || resolvedModel.provider !== allowed.provider || resolvedModel.baseUrl.replace(/\/$/, '') !== allowed.baseUrl) refuse('RUNTIME_MODEL_DENIED');
          return { ...body, ...(grant.fixtureFault === 'model' ? { model: 'unapproved' } : {}), ...(allowed.api === 'openai-codex-responses' ? { max_output_tokens: grant.fixtureFault === 'cap' ? undefined : grant.perRequestOutputTokens } : { max_tokens: grant.perRequestOutputTokens }) };
        },
      });
    };
    const create = async (side, savedFile) => {
      ledger.check(abort.signal);
      const dir = join(raw, side); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (!fs.existsSync(join(dir, 'ledger.csv'))) fs.writeFileSync(join(dir, 'ledger.csv'), task.files['ledger.csv'], { mode: 0o600 });
      const settingsManager = host.SettingsManager.inMemory({ ...installedSettings, packages: side === 'native' ? [] : installedSettings.packages });
      const loader = new host.DefaultResourceLoader({ cwd: dir, agentDir, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPromptOverride: () => 'Synthetic acceptance task. Preserve all FACT_ markers, facts, pending work, file state and tool results in summaries. No tools.' });
      await loader.reload();
      const model = runtime.getModel('openai-codex', 'gpt-6.1-sol');
      if (!model) refuse('MODEL_UNAVAILABLE');
      const manager = savedFile ? host.SessionManager.open(savedFile, dirname(savedFile), dir) : host.SessionManager.create(dir, join(dir, 'sessions'));
      ledger.check(abort.signal);
      const created = await host.createAgentSession({ cwd: dir, agentDir, modelRuntime: runtime, model, resourceLoader: loader, settingsManager, sessionManager: manager, tools: [], thinkingLevel: grant.mode === 'real' ? 'xhigh' : 'off' });
      session = created.session;
      await session.bindExtensions({});
      const managed = !!globalThis[Symbol.for('pi-compact.adapter.v1')]?.bindings.get(session);
      const paths = loader.getExtensions().extensions.map(e => e.path);
      if (managed !== (side !== 'native') || (side !== 'native' && !paths.includes(join(pkg, 'src/index.ts'))) || paths.includes(join(root, 'src/index.ts'))) refuse('INSTALL_DISCOVERY_MISMATCH');
      result.scenarios.push({ id: side + (savedFile ? '-restore-load' : '-load'), managed, productPath: side === 'native' ? null : 'raw/package/src/index.ts', startupDispatches: ledger.rows.length }); checkpoint();
      return { dir, manager };
    };
    const step = async (id, action, expected) => {
      phase = id; ledger.check(abort.signal);
      const start = ledger.rows.length;
      const record = { id, status: 'running', firstDispatch: start + 1 };
      result.scenarios.push(record); checkpoint();
      try {
        const value = await action();
        if (expected && value !== expected) refuse('CHECKPOINT_KIND_MISMATCH');
        if (ledger.rows.slice(start).some(row => ['length', 'incomplete'].includes(row.stop))) refuse('INCOMPLETE_PROVIDER_OUTPUT');
        record.status = 'pass';
      } catch (error) { record.status = 'failed'; record.failure = safeFailure(error); throw error; }
      finally { record.dispatches = ledger.rows.length - start; checkpoint(); }
    };
    const compact = async () => {
      await session.compact('Preserve every FACT_ marker, all facts, file state and unfinished work.');
      const cp = session.sessionManager.getBranch().findLast(e => e.type === 'compaction');
      if (!cp) refuse('COMPACTION_MISSING');
      return cp.details?.piCompact?.kind ?? 'native';
    };
    const continuation = async dir => {
      await session.prompt(task.continuation);
      const message = session.state.messages.findLast(m => m.role === 'assistant');
      if (!message || message.stopReason !== 'stop') refuse('CONTINUATION_FAILED');
      const text = message.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
      const scores = score(text, fs.readFileSync(join(dir, 'ledger.csv'), 'utf8'));
      Object.assign(result.scenarios.at(-1), { scores, usage: usage(message.usage), stopReason: message.stopReason });
      if (!['facts', 'unfinished', 'file', 'toolResult'].every(k => scores[k])) refuse('SCORING_FAILED');
    };
    if (stage === 'initial') {
      const native = await create('native'); seed(session);
      result.sourceHash = digest(JSON.stringify(session.sessionManager.getBranch().filter(e => e.type === 'message').map(e => e.message)));
      await step('native-summary', compact, 'native');
      await step('native-continuation', () => continuation(native.dir));
      session.dispose(); session = undefined;
      const remote = await create('remote'); seed(session);
      if (digest(JSON.stringify(session.sessionManager.getBranch().filter(e => e.type === 'message').map(e => e.message))) !== result.sourceHash) refuse('SOURCE_BYTES_MISMATCH');
      await step('remote-summary', compact, 'opaque');
      await step('remote-continuation', () => continuation(remote.dir));
      session.sessionManager.appendMessage({ role: 'user', content: 'Repeat compaction and preserve all prior facts and unfinished work.', timestamp: 13 }); session.refreshContext();
      await step('repeat-remote', compact, 'opaque');
      durableWrite(join(raw, 'progress.json'), { runId, grantHash: ledger.grantHash, sessionFile: session.sessionManager.getSessionFile(), result });
      result.status = 'restart-required';
      return result;
    }
    const remote = await create('remote', continuationFile);
    await step('restore-continuation', () => continuation(remote.dir));
    const targetModel = runtime.getModel('deepseek', 'deepseek-chat');
    if (!targetModel) refuse('TARGET_MODEL_UNAVAILABLE');
    await session.setModel(targetModel);
    await step('source-to-text-and-target-native-summary', compact, 'text');
    await step('deepseek-continuation', () => continuation(remote.dir));
    result.status = 'pass';
  } catch (error) { result.status = 'failed'; result.failure = safeFailure(error); if (grant.mode === 'offline-fixture') fs.writeFileSync(join(raw, 'offline-error-' + runId + '.txt'), String(error.stack), { mode: 0o600 }); }
  finally {
    session?.dispose();
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    result.dispatches = ledger.rows.length; result.estimatedInputTokens = ledger.inputUsed; result.reservedOutputTokens = ledger.outputUsed;
    result.cleanup = network ? await network.close() : { trackedSockets: 0, listeners: 0 };
    if (grant.mode === 'real') result.realResults = result.status === 'pass' ? 'passed-this-run' : 'incomplete-this-run';
    result.finished = new Date().toISOString(); checkpoint();
    if (stage === 'initial' && result.status === 'restart-required') durableWrite(join(grant.evidenceDir, 'attempts', runId + '-before-restart.json'), result);
    ledger.close();
  }
  return result;
}
function usage(value) {
  return Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'].filter(k => Number.isFinite(value?.[k])).map(k => [k, value[k]]));
}
