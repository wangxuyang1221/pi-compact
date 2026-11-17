import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { privateTree, durableWrite, restrictedCredentials } from '../live/guard.mjs';
import { models, tasks, profiles, schedule, dataset, hashJSON, targetFor } from './spec.mjs';
import { ComparisonLedger, GRANT_SCHEMA, validateComparisonGrant } from './budget.mjs';
import { createTools } from './tools.mjs';
import { scoreRecord, scoreWorkspace, strictSuccess } from './scorer.mjs';
import { buildSandbox, sandboxEvaluate, scoreBehavior } from './sandbox.mjs';
import { usageVector } from './transport.mjs';
import { reportData, pairedMetric } from './report.mjs';
const root = resolve(process.argv[2] ?? 'scratch/comparison/security-' + Date.now());
process.umask(0o077); privateTree(root, { create: true });
const evidence = { kind: 'OFFLINE_SECURITY_AND_SCORER_EVIDENCE', realMeasurements: false, providerRequests: 0, tests: [], processes: [] };
async function test(name, action) { const value = await action(); evidence.tests.push({ name, passed: true, ...(value === undefined ? {} : { evidence: value }) }); console.log('PASS', name); }
const makeGrant = (name, profile = 'quality-observation') => { const p = profiles.find(p => p.id === profile); const evidenceDir = join(root, name); privateTree(evidenceDir, { create: true }); return { schema: GRANT_SCHEMA, mode: 'offline-fixture', authorized: true, syntheticOnly: true, allowAuthRefresh: false, profile, grantId: name, expiresAt: new Date(Date.now() + 3600000).toISOString(), evidenceDir, binding: { test: true }, targets: models.map(targetFor), maxDispatches: p.dispatches, maxEstimatedInputTokens: p.dispatches * 64000, maxReservedOutputTokens: p.dispatches * 1000, perRequestOutputTokens: 1000 }; };
const fields = model => ({ model, provider: 'openai-codex', inputTokens: 1, outputTokens: 1000 });
await test('default-plan-help-real-have-no-auth-network-or-worker', () => {
  const preload = join(root, 'no-effects.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs';import net from 'node:net';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const deny=()=>{throw new Error('SIDE_EFFECT_DENIED')};globalThis.fetch=deny;globalThis.WebSocket=class{constructor(){deny()}};net.Socket.prototype.connect=deny;child.ChildProcess.prototype.spawn=deny;for(const k of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[k]=deny;const read=fs.readFileSync;fs.readFileSync=function(p,...a){if(/auth\\.json|history\\.json|\\/\\.pi\\/|\\/\\.codex\\//.test(String(p)))deny();return read.call(this,p,...a)};syncBuiltinESMExports();`);
  const observations = [];
  for (const command of ['plan', 'help', 'real']) {
    const r = spawnSync(process.execPath, ['--import', preload, resolve('scripts/comparison.mjs'), command], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: root } }); evidence.processes.push(r.pid);
    assert.equal(r.status, command === 'real' ? 1 : 0); assert.doesNotMatch(r.stderr, /SIDE_EFFECT/);
    if (command === 'plan') assert.deepEqual(JSON.parse(r.stdout).activeBudget, { dispatches: 0, estimatedInputTokens: 0, reservedOutputTokens: 0 });
    if (command === 'real') assert.match(r.stderr, /COMPARISON_GRANT_REQUIRED/);
    observations.push({ command, exitCode: r.status, stdoutBytes: r.stdout.length, stderr: r.stderr.trim() });
  }
  const invalid = makeGrant('invalid-real-preflight');
  for (const [name, change] of Object.entries({ unauthorized: { authorized: false }, expired: { expiresAt: '2000-01-01' }, budget: { maxDispatches: 999 }, target: { targets: [] }, fixture: { fixtureFault: 'cap' } })) {
    const file = join(root, 'invalid-' + name + '.json');
    fs.writeFileSync(file, JSON.stringify({ ...invalid, mode: 'real', authPath: '/unavailable/auth.json', explicitUserAuthorization: 'INVALID TEST ONLY', ...change }));
    const r = spawnSync(process.execPath, ['--import', preload, resolve('scripts/comparison.mjs'), 'real', '--grant', file], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: root } });
    evidence.processes.push(r.pid);
    assert.equal(r.status, 1); assert.doesNotMatch(r.stderr, /SIDE_EFFECT/);
    assert.match(r.stderr, /COMPARISON_|REAL_AUTHORIZATION_REQUIRED/);
    observations.push({ command: 'invalid-real-' + name, exitCode: r.status, stderr: r.stderr.trim() });
  }
  return observations;
});
await test('old-functional-grant-and-real-grants-rejected', () => {
  const grant = makeGrant('grant');
  assert.throws(() => validateComparisonGrant({ ...grant, schema: 2 }, grant.binding, 'offline-fixture'), /COMPARISON_GRANT_REQUIRED/);
  assert.throws(() => validateComparisonGrant({ ...grant, mode: 'real' }, grant.binding, 'real'), /REAL_AUTHORIZATION_REQUIRED/);
  for (const key of ['plan', 'dataset', 'scorer', 'toolSchema', 'package', 'host', 'schedule']) assert.throws(() => validateComparisonGrant(grant, { ...grant.binding, [key]: 'changed' }, 'offline-fixture'), /BINDING/);
});
for (const profile of profiles) await test('full-budget-schedule-' + profile.id, () => {
  const grant = makeGrant(profile.id, profile.id), ledger = new ComparisonLedger(grant);
  try {
    for (const lane of schedule(profile.id)) for (let i = 0; i < lane.maxDispatches; i++) { ledger.setLane(lane, i === 0 ? 'compact' : 'continuation'); ledger.reserve(fields(lane.model)); }
    assert.equal(ledger.rows.length, profile.dispatches); assert.equal(ledger.outputUsed, profile.dispatches * 1000);
    assert.throws(() => ledger.reserve(fields(ledger.lane.model)), /BUDGET/);
    return { reservations: ledger.rows.length, outputReserved: ledger.outputUsed, models: models.map(model => ({ model, rows: ledger.rows.filter(r => r.model === model).length })), scheduleHash: hashJSON(schedule(profile.id)) };
  } finally { ledger.close(); }
});
await test('concurrent-hidden-round-fallback-and-recovery-no-refund', async () => {
  const grant = makeGrant('concurrent'), lane = schedule(grant.profile).find(l => l.phase === 'comparison'); let ledger = new ComparisonLedger(grant);
  ledger.setLane(lane, 'compact'); ledger.reserve(fields(lane.model));
  ledger.setLane(lane, 'continuation'); ledger.withRequest('compact', () => ledger.reserve(fields(lane.model)));
  assert.equal(ledger.rows[1].stage, 'compact');
  assert.throws(() => ledger.withRequest('compact', () => ledger.reserve(fields(lane.model))), /BUDGET/);
  ledger.setLane(lane, 'continuation');
  const results = await Promise.allSettled(Array.from({ length: 9 }, async () => ledger.reserve(fields(lane.model))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 4); assert.equal(ledger.rows.length, 6);
  assert.throws(() => new ComparisonLedger(grant), /LEDGER_LOCKED/);
  ledger.close(); ledger = new ComparisonLedger(grant); assert.equal(ledger.rows.length, 6); ledger.setLane(lane, 'continuation'); assert.throws(() => ledger.reserve(fields(lane.model)), /BUDGET/); ledger.close();
  return { compactReservations: 2, continuationReservations: 4, concurrentRejected: 5, afterReopen: 6 };
});
await test('crashed-owner-recovery-keeps-unsent-reservation', () => {
  const grant = makeGrant('crash'), lane = schedule(grant.profile)[0];
  const input = join(root, 'crash-input.json'); durableWrite(input, { grant, lane });
  const script = join(root, 'crash.mjs');
  fs.writeFileSync(script, `import fs from 'node:fs';import {ComparisonLedger} from ${JSON.stringify(pathToFileURL(resolve('scripts/comparison/budget.mjs')).href)};const {grant,lane}=JSON.parse(fs.readFileSync(process.argv[2]));const l=new ComparisonLedger(grant);l.setLane(lane,'compact');l.reserve({model:lane.model,inputTokens:10,outputTokens:1000});process.exit(23);`);
  const child = spawnSync(process.execPath, [script, input], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }); evidence.processes.push(child.pid); assert.equal(child.status, 23);
  const l = new ComparisonLedger(grant); assert.equal(l.rows.length, 1); assert.equal(l.rows[0].state, 'reserved'); assert.equal(l.outputUsed, 1000); l.setLane(lane, 'compact'); assert.throws(() => l.reserve(fields(lane.model)), /BUDGET/); l.close();
  return { crashedExitCode: child.status, recoveredReservations: 1, knownSent: false, refunded: false };
});
await test('R1-literal-credentials-only-and-R2-private-paths', async () => {
  const dir = join(root, 'credential'); privateTree(dir, { create: true });
  const auth = join(dir, 'auth.json'); durableWrite(auth, { 'openai-codex': { type: 'oauth', access: 'fixture.literal.value', expires: Date.now() + 3600000 }, irrelevant: { type: 'api_key', key: '!echo NEVER' } });
  const credentials = restrictedCredentials(auth, models.map(targetFor)); assert.deepEqual(await credentials.list(), [{ providerId: 'openai-codex', type: 'oauth' }]); assert.equal((await credentials.read('openai-codex')).access, 'fixture.literal.value'); await assert.rejects(credentials.modify(), /AUTH_MUTATION_DENIED/);
  durableWrite(auth, { 'openai-codex': { type: 'oauth', access: '!echo NEVER', expires: Date.now() + 3600000 } }); assert.throws(() => restrictedCredentials(auth, models.map(targetFor)), /AUTH_FORMAT_DENIED/);
  const dest = join(root, 'outside-sentinel'); fs.mkdirSync(dest, { mode: 0o700 }); const link = join(dir, 'raw'); fs.symlinkSync(dest, link); assert.throws(() => privateTree(dir), /EVIDENCE_PATH_DENIED/); fs.unlinkSync(link);
  fs.writeFileSync(join(dir, 'existing.next'), 'sentinel'); assert.throws(() => durableWrite(join(dir, 'existing'), { wrong: true })); assert.equal(fs.readFileSync(join(dir, 'existing.next'), 'utf8'), 'sentinel');
  return { unrelatedProviderParsed: false, helperExecuted: false, symlinkRejectedBeforeWrite: true, sentinel: 'unchanged' };
});
const sandbox = buildSandbox(join(root, 'sandbox'));
await test('OS-sandbox-file-network-process-oracle-import-probes', () => {
  const sentinel = join(root, 'outside-sentinel/protected'); fs.writeFileSync(sentinel, 'SYNTHETIC_SECRET_NOT_REAL');
  const oracle = join(dataset(tasks[0]).base, 'oracle/groundtruth.json');
  const probeSource = `import fs from 'node:fs';import {spawnSync} from 'node:child_process';import net from 'node:net';export async function probe(){const out={};for(const [k,p] of Object.entries({oracle:${JSON.stringify(oracle)},credential:${JSON.stringify(sentinel)},host:'/etc/hosts'})){try{fs.readFileSync(p);out[k]='ESCAPED'}catch(e){out[k]=e.code}}try{fs.writeFileSync(${JSON.stringify(sentinel)},'changed');out.write='ESCAPED'}catch(e){out.write=e.code}const child=spawnSync('/usr/bin/true');out.spawn=child.error?.code??'ESCAPED';try{await import(${JSON.stringify(pathToFileURL(join(dataset(tasks[0]).base, 'oracle/reference/settlement.mjs')).href)});out.import='ESCAPED'}catch(e){out.import=e.code}out.network=await new Promise(r=>{const s=net.connect(9,'127.0.0.1');s.on('error',e=>r(e.code));s.on('connect',()=>{s.destroy();r('ESCAPED')})});return out}`;
  const run = sandboxEvaluate(sandbox.addon, probeSource, 'probe', [null]); evidence.processes.push(run.pid);
  assert.equal(run.exitCode, 0, JSON.stringify(run)); assert.deepEqual(run.outputs[0], { oracle: 'EPERM', credential: 'EPERM', host: 'EPERM', write: 'EPERM', spawn: 'EPERM', import: 'ERR_MODULE_NOT_FOUND', network: 'EPERM' }); assert.equal(fs.readFileSync(sentinel, 'utf8'), 'SYNTHETIC_SECRET_NOT_REAL');
  const endless = sandboxEvaluate(sandbox.addon, 'export function loop(){while(true){}}', 'loop', [null]); evidence.processes.push(endless.pid); assert.equal(endless.signal, 'SIGKILL');
  return { rawProbe: run, timeout: { signal: endless.signal, error: endless.error }, sandboxBinaryHash: sandbox.sha256 };
});
for (const task of tasks) await test('typed-scorer-and-actual-business-' + task, async () => {
  const data = dataset(task), { truth } = data;
  const perfect = { facts: truth.facts, state: truth.state, pending: truth.pending };
  const source = fs.readFileSync(join(data.base, 'oracle/reference', truth.module), 'utf8');
  const positive = scoreBehavior(sandbox.addon, source, truth), stub = scoreBehavior(sandbox.addon, fs.readFileSync(join(data.workspace, truth.module), 'utf8'), truth);
  evidence.processes.push(positive.pid, stub.pid); assert.equal(positive.passed, truth.cases.length); assert.ok(stub.passed < stub.total);
  const mutations = task.startsWith('settlement') ? [source.replace('JSON.stringify([r.tenant, r.event])', 'r.event'), source.replace('if (seen.has(key)) continue;', ''), source.replace("if (r.status !== 'settled'", "if (r.cents === 0 || r.status !== 'settled'")] : [source.replace('308', '301'), source.replace("['GET', 'HEAD']", "['GET']"), source.replace('m[1]', "'en'")];
  const staleRules = mutations.map(m => scoreBehavior(sandbox.addon, m, truth)); evidence.processes.push(...staleRules.map(r => r.pid)); assert.ok(staleRules.every(r => r.passed < r.total));
  const exact = scoreRecord(perfect, truth), stale = scoreRecord({ ...perfect, facts: { ...truth.facts, ...truth.stale } }, truth), wrongTypes = scoreRecord({ ...perfect, state: { ...truth.state, metadataSchema: '2', metadataReady: 'false' }, facts: { ...truth.facts, extra: 'invented' }, pending: [...truth.pending, truth.pending[0]] }, truth);
  assert.equal(exact.facts.tp, 6); assert.equal(exact.state.tp, 5); assert.equal(stale.stale.adopted, 3); assert.equal(stale.facts.fp, 3); assert.equal(wrongTypes.state.fp, 2); assert.equal(wrongTypes.facts.fp, 1); assert.equal(wrongTypes.pending.fp, 1); assert.equal(scoreRecord(null, truth).facts.precision, null);
  const workspace = join(root, task); fs.cpSync(data.workspace, workspace, { recursive: true }); privateTree(workspace, { seal: true });
  const tools = createTools({ workspace, truth, score: async code => scoreBehavior(sandbox.addon, code, truth) });
  await tools.perform('record_checkpoint', perfect);
  for (const path of ['../oracle/groundtruth.json', '/etc/hosts', 'oracle/groundtruth.json']) await assert.rejects(tools.perform('workspace_read', { path }), /WORKSPACE_PATH_DENIED/);
  await assert.rejects(tools.perform('workspace_write', { path: 'release.json', content: '{}' }), /WORKSPACE_PATH_DENIED/);
  await tools.perform('workspace_write', { path: truth.module, content: source });
  const shown = await tools.perform('run_regression', {}); assert.deepEqual(Object.keys(shown).sort(), ['passed', 'total']);
  assert.ok(strictSuccess(exact, scoreWorkspace(workspace, data.workspace, truth), positive, tools.capturedFirst));
  await assert.rejects(tools.perform('record_checkpoint', perfect), /ALREADY/); assert.equal(tools.capturedFirst, false);
  const premature = createTools({ workspace, truth, score: () => {} }); await assert.rejects(premature.perform('workspace_read', { path: truth.module }), /FIRST/); await premature.perform('record_checkpoint', perfect); assert.equal(premature.capturedFirst, false);
  const invalidFirst = createTools({ workspace, truth, score: () => {} });
  invalidFirst.observeCalls([{ type: 'toolCall', name: 'record_checkpoint', id: 'first', arguments: { facts: {} } }]);
  invalidFirst.observeCalls([{ type: 'toolCall', name: 'record_checkpoint', id: 'second', arguments: perfect }]);
  await assert.rejects(invalidFirst.perform('record_checkpoint', perfect, 'second'), /FIRST_ATTEMPT_LOCKED/);
  await assert.rejects(invalidFirst.perform('record_checkpoint', perfect, 'first'), /FIRST_ATTEMPT_LOCKED/);
  assert.equal(invalidFirst.record, null);
  fs.writeFileSync(join(workspace, 'extra.mjs'), ''); assert.deepEqual(scoreWorkspace(workspace, data.workspace, truth).extraFiles, ['extra.mjs']);
  fs.writeFileSync(join(workspace, 'release.json'), '{}'); assert.equal(scoreWorkspace(workspace, data.workspace, truth).protectedPassed, 101);
  return { positive, stub, staleRules, exact, stale, wrongTypes, protectedFiles: 102, modelToolOutput: shown };
});
await test('null-usage-failure-denominator-and-no-fixture-superiority', () => {
  const pairs = Array.from({ length: 5 }, () => ({ native: { value: 100 }, remote: { value: 80 } }));
  assert.equal(pairedMetric(pairs, 'value', true, true).verdict, 'remote-smaller-in-this-cell');
  assert.equal(pairedMetric(pairs, 'value', false, true).verdict, 'inconclusive');
  assert.equal(pairedMetric(pairs.slice(0, 4), 'value', true, true).verdict, 'inconclusive');
  assert.deepEqual(usageVector(null), { input: null, cacheRead: null, cacheWrite: null, output: null, reasoning: null, total: null });
  const data = reportData({ fixture: true, mode: 'offline-fixture', lanes: schedule('quality-observation').map(l => ({ ...l, status: 'failed' })) }, []);
  const interrupted = reportData({ fixture: true, mode: 'offline-fixture', profile: 'quality-observation', lanes: [] }, []);
  assert.equal(interrupted.accounting.scheduledComparisonLanes, 8);
  assert.equal(interrupted.accounting.rawComparisonFailuresInDenominator, 8);
  assert.equal(data.accounting.scheduledComparisonLanes, 8); assert.equal(data.accounting.rawComparisonFailuresInDenominator, 8); assert.equal(data.statisticalComparison, null); return data;
});
const alive = evidence.processes.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } }); assert.deepEqual(alive, []);
evidence.cleanup = { alive, listeners: 0, networkProbe: 'OS denied before connect; no server created' };
fs.writeFileSync(join(root, 'security-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ passed: evidence.tests.length, evidence: join(root, 'security-evidence.json') }));
