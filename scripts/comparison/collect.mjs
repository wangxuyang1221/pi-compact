import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { ARTIFACT, readJSON, hashJSON, schedule } from './spec.mjs';
const dir = resolve(process.argv[2]), name = process.argv[3];
if (!/^[a-z0-9-]+$/.test(name ?? '')) throw new Error('Public evidence name required');
const run = readJSON(join(dir, 'result.json')), ledger = readJSON(join(dir, 'ledger.json')), cleanup = readJSON(join(dir, 'cleanup.json'));
assert.equal(run.fixture, true); assert.deepEqual(cleanup.alive, []); assert.equal(cleanup.listenerCount, 0); assert.equal(cleanup.trackedSockets, 0);
assert.equal(run.lanes.length, schedule(run.profile).length);
assert.equal(run.data.accounting.serverConfirmedDispatches, 0); assert.equal(run.data.statisticalComparison, null);
const publicRun = structuredClone(run);
for (const lane of publicRun.lanes) if (lane.offlineDiagnostic) lane.offlineDiagnostic = lane.offlineDiagnostic.replaceAll(resolve('.'), '<checkout>');
const write = (file, value) => fs.writeFileSync(join(ARTIFACT, file), JSON.stringify(value, null, 2) + '\n');
write(name + '-run.json', publicRun); write(name + '-ledger.json', ledger); write(name + '-cleanup.json', cleanup);
if (name === 'preflight') {
  assert.equal(run.status, 'passed');
  const lanes = run.lanes.filter(l => l.phase === 'comparison');
  assert.equal(lanes.length, 8);
  const pairs = [];
  for (const native of lanes.filter(l => l.arm === 'pi-native')) {
    const remote = lanes.find(l => l.model === native.model && l.task === native.task && l.arm === 'pi-compact-remote');
    const boundaryKeys = ['firstKeptEntryId', 'isSplitTurn', 'rawHistoryHash', 'prefixHash', 'tailHash', 'systemPromptHash', 'settings', 'customInstructions', 'modelSpec', 'workspacePathHash'];
    for (const key of boundaryKeys) assert.deepEqual(native.boundary[key], remote.boundary[key]);
    const first = lane => ledger.rows.find(r => r.laneId === lane.id && r.stage === 'continuation');
    const n = first(native), r = first(remote);
    assert.equal(n.encoded.instructionsHash, r.encoded.instructionsHash); assert.equal(n.encoded.systemMessagesHash, r.encoded.systemMessagesHash); assert.equal(n.encoded.toolsHash, r.encoded.toolsHash);
    assert.equal(r.encoded.opaqueItems, 1); assert.equal(n.encoded.opaqueItems, 0);
    for (const lane of [native, remote]) { assert.equal(lane.strictSuccess, true); assert.equal(lane.boundary.isSplitTurn, false); assert.equal(lane.boundary.firstKeptEntryId, 'e227'); }
    pairs.push({ model: native.model, task: native.task, boundary: native.boundary, remoteDiscovery: remote.boundary.extensionPaths, firstNative: n.encoded, firstRemote: r.encoded, compactEncoding: [native, remote].map(l => ledger.rows.find(r => r.laneId === l.id && r.stage === 'compact').encoded), exactMatchingKeys: boundaryKeys, actualWorkspaceBehavior: [native.behavior, remote.behavior], protectedFiles: 102 });
  }
  for (const row of ledger.rows) { assert.equal(row.encoded.reasoning.effort, 'none'); assert.equal(row.encoded.maxOutputTokens, 1000); assert.equal(row.encoded.stream, true); assert.equal(row.state, 'completed'); assert.equal(row.fixture, true); }
  write('preflight.json', { schema: 'comparison-boundary-preflight/v1', realMeasurements: false, fixture: true, modelsQueriedAtRealService: false, providerRequests: 0, installedPi: '1.5.2', originalRunBinding: run.binding, runEvidenceHash: hashJSON(publicRun), pairs, commonToolEncodingOverride: { supportsAdditionalTools: false, supportsToolSearch: false }, outputCapImplementation: '1000 explicitly inserted in shared experiment onPayload because installed Codex encoder ignores maxTokens; verified after actual encoding. No claim of service support.', normalization: 'assistant text -> Pi text blocks; same deterministic message IDs and timestamps; randomized isolated session UUID is routing metadata, never an arm label', noQualityConclusion: true });
}
console.log(JSON.stringify({ collected: name, lanes: run.lanes.length, dispatches: ledger.rows.length, fixture: true }));
