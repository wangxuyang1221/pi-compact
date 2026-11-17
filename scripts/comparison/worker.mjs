import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { privateTree, durableWrite, safeFailure, refuse } from '../live/guard.mjs';
import { ComparisonLedger, validateComparisonGrant } from './budget.mjs';
import { dataset, schedule, readJSON, hashJSON } from './spec.mjs';
import { createTools } from './tools.mjs';
import { loadRuntime, createSession } from './host.mjs';
import { scoreRecord, scoreWorkspace, strictSuccess } from './scorer.mjs';
import { reportData } from './report.mjs';
process.umask(0o077);
const configPath = process.argv[2];
privateTree(resolve(configPath, '../..'));
const config = readJSON(configPath), { grant, installation, hostInfo, addon, fault } = config;
validateComparisonGrant(grant, config.binding, grant.mode);
privateTree(grant.evidenceDir);
const resultPath = join(grant.evidenceDir, 'result.json');
const ledger = new ComparisonLedger(grant);
const result = fs.existsSync(resultPath) ? readJSON(resultPath) : { schema: 'comparison-run/v1', mode: grant.mode, fixture: grant.mode === 'offline-fixture', realMeasurements: false, profile: grant.profile, fixtureFault: fault ?? null, binding: config.binding, lanes: [], pids: [process.pid], startupDispatches: 0 };
const checkpoint = () => durableWrite(resultPath, result);
const service = fork(resolve('scripts/comparison/scorer-service.mjs'), [addon], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' } });
result.pids.push(service.pid);
const serviceExited = once(service, 'exit');
let seq = 0, active = {}, loaded, session;
const pending = new Map();
service.on('message', reply => { const p = pending.get(reply.id); pending.delete(reply.id); if (reply.value?.pid) result.pids.push(reply.value.pid); if (reply.error) p?.reject(new Error(reply.error)); else p?.resolve(reply.value); });
service.on('exit', () => { for (const p of pending.values()) p.reject(new Error('SCORER_EXIT')); pending.clear(); });
const score = (task, source) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); service.send({ kind: 'score', id, task, source }); });
const cancel = () => { active.abort?.abort(); session?.abort(); };
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
try {
  loaded = await loadRuntime({ grant, installation, hostInfo, ledger, active, fault });
  result.startupDispatches = ledger.rows.length;
  for (const lane of schedule(grant.profile)) {
    if (result.lanes.some(r => r.id === lane.id && r.status !== 'running')) continue;
    const row = result.lanes.find(r => r.id === lane.id) ?? { ...lane, assignedArm: lane.arm, effectiveArm: null, fallback: false, status: 'running', startedMonoMs: performance.now(), firstDispatch: ledger.rows.length + 1 };
    if (!result.lanes.includes(row)) result.lanes.push(row);
    if (ledger.rows.some(r => r.laneId === lane.id) || row.recoveryPending) {
      const interruptedWorkspace = join(installation.raw, 'workspace');
      if (fs.existsSync(interruptedWorkspace)) { privateTree(interruptedWorkspace); const snapshots = join(installation.raw, 'workspace-snapshots'); privateTree(snapshots, { create: true }); fs.renameSync(interruptedWorkspace, join(snapshots, lane.id + '-interrupted')); }
      row.status = 'failed'; row.failure = 'INTERRUPTED_LANE_NO_REPLACEMENT'; checkpoint(); continue; }
    row.recoveryPending = true;
    if (lane.phase === 'comparison' && !['pi-native', 'pi-compact-remote'].every(arm => result.lanes.some(r => r.phase === 'pilot' && r.model === lane.model && r.arm === arm && r.status === 'passed'))) { row.status = 'ineligible'; row.failure = 'PILOT_NOT_ELIGIBLE'; checkpoint(); continue; }
    if (ledger.rows.some(r => r.auditFailure || r.state === 'failed')) { row.status = 'ineligible'; row.failure = 'GLOBAL_AUDIT_STOP'; checkpoint(); continue; }
    const data = dataset(lane.task);
    const workspace = join(installation.raw, 'workspace');
    privateTree(workspace, { create: true });
    if (fs.readdirSync(workspace).length) refuse('WORKSPACE_NOT_FRESH');
    fs.cpSync(data.workspace, workspace, { recursive: true }); privateTree(workspace, { seal: true });
    const taskTools = createTools({ workspace, truth: data.truth, score: source => score(lane.task, source) });
    Object.assign(active, { lane, data, abort: new AbortController() });
    const timer = setTimeout(() => { active.abort.abort(); session?.abort(); }, 180000);
    checkpoint();
    try {
      const created = await createSession({ loaded, installation, lane, data, workspace, tools: taskTools }); session = created.session;
      session.subscribe(event => { if (event.type === 'message_end' && event.message.role === 'assistant') taskTools.observeCalls(event.message.content); });
      row.boundary = created.boundary;
      const peer = result.lanes.find(r => r.model === lane.model && r.task === lane.task && r.repeat === lane.repeat && r.phase === lane.phase && r.arm !== lane.arm && r.boundary);
      const matched = ['firstKeptEntryId', 'isSplitTurn', 'rawHistoryHash', 'prefixHash', 'tailHash', 'systemPromptHash', 'settings', 'customInstructions', 'modelSpec', 'workspacePathHash'];
      if (peer && matched.some(key => hashJSON(peer.boundary[key]) !== hashJSON(row.boundary[key]))) refuse('MATCHED_PAIR_BOUNDARY_MISMATCH');
      row.matchedPeer = peer?.id ?? null;
      ledger.setLane(lane, 'compact');
      row.compactStartMonoMs = performance.now();
      await session.compact();
      row.compactCommitMonoMs = performance.now();
      const cp = session.sessionManager.getBranch().findLast(e => e.type === 'compaction');
      if (!cp) refuse('COMPACTION_MISSING');
      row.checkpointKind = cp.details?.piCompact?.kind ?? 'native';
      row.effectiveArm = row.checkpointKind === 'opaque' ? 'pi-compact-remote' : 'pi-native';
      row.fallback = row.effectiveArm !== row.assignedArm;
      if (lane.phase === 'pilot' && row.fallback) refuse('OPAQUE_NOT_AVAILABLE');
      ledger.setLane(lane, 'continuation'); row.continuationStartMonoMs = performance.now();
      await session.prompt(lane.phase === 'pilot' ? 'Acknowledge ready. Do not call tools.' : data.continuation.prompt);
      row.continuationEndMonoMs = performance.now();
      const message = session.state.messages.findLast(m => m.role === 'assistant');
      if (!message || message.stopReason !== 'stop') refuse('CONTINUATION_FAILED');
      const dispatched = ledger.rows.filter(r => r.laneId === lane.id);
      if (dispatched.some(r => r.state !== 'completed' || r.auditFailure || !r.serverUsage) || !dispatched.some(r => r.stage === 'continuation')) refuse('DISPATCH_TERMINAL_REQUIRED');
      if (row.checkpointKind === 'opaque' && !dispatched.find(r => r.stage === 'continuation')?.encoded?.opaqueItems) refuse('OPAQUE_NOT_CONSUMED');
      if (lane.phase === 'comparison') {
        row.record = scoreRecord(taskTools.record, data.truth);
        row.behavior = await score(lane.task, fs.readFileSync(join(workspace, data.truth.module), 'utf8'));
        row.workspace = scoreWorkspace(workspace, data.workspace, data.truth);
        row.capturedFirst = taskTools.capturedFirst;
        row.strictSuccess = strictSuccess(row.record, row.workspace, row.behavior, row.capturedFirst);
      }
      row.status = 'passed';
    } catch (error) { row.status = 'failed'; row.failure = safeFailure(error); if (grant.mode === 'offline-fixture') row.offlineDiagnostic = String(error.stack); }
    finally { clearTimeout(timer); session?.dispose(); session = undefined;
      privateTree(workspace);
      const snapshots = join(installation.raw, 'workspace-snapshots'); privateTree(snapshots, { create: true });
      fs.renameSync(workspace, join(snapshots, lane.id));
      row.tools = taskTools.log; row.observedToolCalls = taskTools.observed; row.finishedMonoMs = performance.now(); row.dispatches = ledger.rows.filter(r => r.laneId === lane.id).length; checkpoint(); }
  }
  result.status = result.lanes.every(r => r.status === 'passed') ? 'passed' : 'failed';
} catch (error) { result.status = 'failed'; result.failure = safeFailure(error); result.offlineDiagnostic = grant.mode === 'offline-fixture' ? String(error.stack) : undefined; }
finally {
  session?.dispose(); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  if (service.connected) service.send({ kind: 'close' }); await serviceExited;
  result.cleanup = loaded ? await loaded.network.close() : { trackedSockets: 0, listeners: 0 };
  result.dispatches = ledger.rows.length;
  result.realMeasurements = grant.mode === 'real' && ledger.rows.some(r => r.serverConfirmed);
  result.data = reportData(result, ledger.rows);
  checkpoint(); ledger.close();
}
if (result.status !== 'passed') process.exitCode = 1;
