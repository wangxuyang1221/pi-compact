import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { launchOffline } from './launch.mjs';
import { readJSON } from './spec.mjs';
const root = resolve(process.argv[2] ?? 'scratch/comparison/fault-runs-' + Date.now());
const observations = [];
for (const [fault, expected] of [['cap', 1], ['no-usage', 1], ['http', 1], ['no-opaque', 6], ['hidden-round', 56], ['comparison-no-opaque', 56], ['checkpoint-retry', 56]]) {
  const { result, cleanup, evidenceDir } = await launchOffline({ profile: 'quality-observation', out: join(root, fault), fault });
  const ledger = readJSON(join(evidenceDir, 'ledger.json'));
  assert.equal(result.status, fault === 'checkpoint-retry' ? 'passed' : 'failed'); assert.equal(result.dispatches, expected); assert.equal(result.lanes.length, 12); assert.equal(result.data.accounting.scheduledComparisonLanes, 8);
  const expectedFailures = fault === 'comparison-no-opaque' ? 4 : 8;
  assert.equal(result.data.accounting.rawComparisonFailuresInDenominator, expectedFailures);
  assert.ok(ledger.rows.every(r => r.outputTokens === 1000)); assert.ok(result.lanes.every(l => l.dispatches === undefined || l.dispatches <= l.maxDispatches));
  if (fault === 'comparison-no-opaque') { const fallback = result.lanes.filter(l => l.phase === 'comparison' && l.assignedArm === 'pi-compact-remote'); assert.ok(fallback.every(l => l.fallback && l.effectiveArm === 'pi-native' && l.dispatches === 6)); }
  if (fault === 'checkpoint-retry') assert.ok(result.lanes.filter(l => l.phase === 'comparison').every(l => !l.capturedFirst && !l.strictSuccess && l.record.facts.tp === 0));
  observations.push({ fault, status: 'passed', actualDispatches: result.dispatches, failedComparisonDenominator: expectedFailures, lanes: result.lanes.map(({ id, status, failure, assignedArm, effectiveArm, fallback, dispatches }) => ({ id, status, failure, assignedArm, effectiveArm, fallback, dispatches })), rows: ledger.rows, cleanup });
  console.log('PASS', fault, result.dispatches);
}
fs.writeFileSync(join(root, 'fault-evidence.json'), JSON.stringify({ fixture: true, realMeasurements: false, observations }, null, 2) + '\n');
