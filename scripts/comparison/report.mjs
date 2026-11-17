import { models, tasks, arms, schedule } from './spec.mjs';
import { isDeepStrictEqual } from 'node:util';
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2 : null; };
const range = xs => xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
const vectorKeys = ['input', 'cacheRead', 'cacheWrite', 'output', 'reasoning', 'total'];
const vector = rows => Object.fromEntries(vectorKeys.map(k => [k, rows.length && rows.every(r => r.serverUsage?.[k] !== null && r.serverUsage?.[k] !== undefined) ? rows.reduce((sum, r) => sum + r.serverUsage[k], 0) : null]));
function qualityVector(lane) {
  return { record: lane?.record ?? null, behavior: lane?.behavior ? { passed: lane.behavior.passed, total: lane.behavior.total, error: lane.behavior.error ?? null } : null,
    workspace: lane?.workspace ? { protectedPassed: lane.workspace.protectedPassed, protectedTotal: lane.workspace.protectedTotal, unauthorizedChanges: lane.workspace.unauthorizedChanges, extraFiles: lane.workspace.extraFiles, sourceChanged: lane.workspace.sourceChanged } : null, capturedFirst: lane?.capturedFirst ?? null };
}
function qualityScores(measure) {
  const q = measure.qualityVector;
  if (!q?.record || !q.behavior || !q.workspace || typeof q.capturedFirst !== 'boolean' || typeof q.workspace.sourceChanged !== 'boolean' || !Array.isArray(q.workspace.unauthorizedChanges) || !Array.isArray(q.workspace.extraFiles)) return null;
  const counts = ['facts', 'state', 'pending'].flatMap(k => [q.record[k]?.tp, q.record[k]?.fp, q.record[k]?.fn]);
  counts.push(q.record.stale?.adopted, q.behavior.passed, q.behavior.total, q.workspace.protectedPassed, q.workspace.protectedTotal);
  if (counts.some(x => !Number.isFinite(x))) return null;
  return [Number(measure.strictSuccess), ...['facts', 'state', 'pending'].flatMap(k => [q.record[k].tp, -q.record[k].fp, -q.record[k].fn]), -q.record.stale.adopted,
    q.behavior.passed, -(q.behavior.total - q.behavior.passed), Number(!q.behavior.error), q.workspace.protectedPassed, -(q.workspace.protectedTotal - q.workspace.protectedPassed),
    -q.workspace.unauthorizedChanges.length, -q.workspace.extraFiles.length, Number(q.workspace.sourceChanged), Number(q.capturedFirst)];
}
function noWorse(candidate, baseline) {
  const a = qualityScores(candidate), b = qualityScores(baseline);
  return !!a && !!b && a.every((v, i) => v >= b[i]);
}
export function pairedMetric(pairs, key, eligible, sameQuality) {
  const native = pairs.map(p => p.native[key]), remote = pairs.map(p => p.remote[key]);
  if (!eligible || pairs.length < 5 || [...native, ...remote].some(x => !Number.isFinite(x) || x <= 0)) return { verdict: 'inconclusive', reason: 'incomplete-or-confounded-pairs' };
  const effects = native.map((n, i) => (n - remote[i]) / n), improvement = median(effects);
  const spread = xs => (Math.max(...xs) - Math.min(...xs)) / median(xs);
  const noiseFloor = Math.max(spread(native), spread(remote));
  const verdict = improvement >= 0.10 && effects.every(e => e > 0) && improvement > noiseFloor ? 'remote-smaller-in-this-cell' : improvement <= -0.10 && effects.every(e => e < 0) && -improvement > noiseFloor ? 'remote-larger-in-this-cell' : sameQuality && Math.abs(improvement) <= 0.05 && noiseFloor <= 0.05 ? 'no-measurable-difference-not-equivalence' : 'inconclusive';
  return { verdict, relativeEffects: effects, medianRelativeImprovement: improvement, withinArmRelativeRange: noiseFloor, native: { median: median(native), range: range(native) }, remote: { median: median(remote), range: range(remote) } };
}
export function reportData(result, rows) {
  const assigned = result.profile ? schedule(result.profile).map(lane => result.lanes.find(observed => observed.id === lane.id) ?? { ...lane, status: 'not-started', strictSuccess: false }) : result.lanes;
  const compared = assigned.filter(l => l.phase === 'comparison');
  const accounting = { scheduledLanes: assigned.length, scheduledComparisonLanes: compared.length, startedLanes: assigned.filter(l => l.boundary).length, reservedDispatches: rows.length, knownSentDispatches: rows.filter(r => r.knownSent).length, serverConfirmedDispatches: rows.filter(r => r.serverConfirmed).length, failedLanes: assigned.filter(l => l.status !== 'passed').length, rawComparisonFailuresInDenominator: compared.filter(l => l.status !== 'passed' || !l.strictSuccess).length, stages: Object.fromEntries(['pilot', 'comparison'].map(phase => [phase, Object.fromEntries(['compact', 'continuation'].map(stage => [stage, vector(rows.filter(r => r.experimentPhase === phase && r.stage === stage))]))])) };
  if (result.fixture || result.mode !== 'real') return { kind: 'FIXTURE_FLOW_ONLY', realMeasurements: false, superiorityVerdict: '不可形成优势结论：fixture 预先提供摘要、checkpoint 和参考实现。', accounting, statisticalComparison: null };
  const cells = [];
  for (const model of models) for (const task of tasks) {
    const lanes = compared.filter(l => l.model === model && l.task === task), repeats = [...new Set(lanes.map(l => l.repeat))];
    const pairs = repeats.map(repeat => {
      const [native, remote] = arms.map(arm => lanes.find(l => l.repeat === repeat && l.arm === arm));
      const measure = l => { const mine = rows.filter(r => r.laneId === l?.id), first = mine.find(r => r.stage === 'continuation'); return { strictSuccess: l?.status === 'passed' && l.strictSuccess === true, stale: l?.record?.stale?.adopted ?? null, comparable: l?.status === 'passed' && !l.fallback && mine.length > 0 && mine.every(r => r.serverUsage && !r.auditFailure), firstContinuationInputProxy: first?.serverUsage?.input ?? null, cacheRead: first?.serverUsage?.cacheRead ?? null, durationMs: l?.finishedMonoMs - l?.compactStartMonoMs, qualityVector: qualityVector(l), cost: { compact: vector(mine.filter(r => r.stage === 'compact')), continuation: vector(mine.filter(r => r.stage === 'continuation')), total: vector(mine) }, assignedArm: l?.assignedArm, effectiveArm: l?.effectiveArm }; };
      return { repeat, native: measure(native), remote: measure(remote) };
    });
    const comparable = pairs.length >= 5 && pairs.every(p => p.native.comparable && p.remote.comparable);
    const improvements = pairs.filter(p => p.remote.strictSuccess && !p.native.strictSuccess).length, losses = pairs.filter(p => p.native.strictSuccess && !p.remote.strictSuccess).length;
    const staleNoWorse = pairs.every(p => p.native.stale !== null && p.remote.stale !== null && p.remote.stale <= p.native.stale);
    const qualityVerdict = comparable && improvements >= 4 && losses === 0 && staleNoWorse ? 'remote-quality-win-in-this-cell' : comparable && losses >= 4 && improvements === 0 && pairs.every(p => p.native.stale !== null && p.remote.stale !== null && p.native.stale <= p.remote.stale) ? 'remote-quality-loss-in-this-cell' : 'inconclusive';
    const inputs = arms.map((_a, i) => pairs.map(p => (i ? p.remote : p.native).firstContinuationInputProxy).filter(x => x !== null));
    const durations = arms.map((_a, i) => pairs.map(p => (i ? p.remote : p.native).durationMs).filter(Number.isFinite));
    const noCacheConfound = pairs.every(p => p.native.cacheRead === 0 && p.remote.cacheRead === 0);
    const sameQuality = pairs.every(p => qualityScores(p.native) && qualityScores(p.remote) && p.native.strictSuccess === p.remote.strictSuccess && isDeepStrictEqual(p.native.qualityVector, p.remote.qualityVector));
    const contextComparison = pairedMetric(pairs, 'firstContinuationInputProxy', comparable && noCacheConfound, sameQuality);
    contextComparison.numericVerdict = contextComparison.verdict;
    contextComparison.qualityConstraints = { fullVectorEqual: sameQuality, remoteNoWorse: pairs.every(p => noWorse(p.remote, p.native)), nativeNoWorse: pairs.every(p => noWorse(p.native, p.remote)) };
    if (contextComparison.verdict === 'remote-smaller-in-this-cell' && !contextComparison.qualityConstraints.remoteNoWorse) {
      contextComparison.verdict = losses > 0 || pairs.some(p => qualityScores(p.remote) && qualityScores(p.native) && !noWorse(p.remote, p.native)) ? 'tradeoff-smaller-input-quality-regression' : 'inconclusive-quality-constraint';
    }
    if (contextComparison.verdict === 'remote-larger-in-this-cell' && !contextComparison.qualityConstraints.nativeNoWorse) {
      contextComparison.verdict = improvements > 0 || pairs.some(p => qualityScores(p.remote) && qualityScores(p.native) && !noWorse(p.native, p.remote)) ? 'tradeoff-larger-input-quality-improvement' : 'inconclusive-quality-constraint';
    }
    cells.push({ model, task, pairs, denominator: lanes.length, improvements, losses, qualityVerdict, firstContinuationInputProxy: inputs.map(xs => ({ median: median(xs), range: range(xs) })), durationMs: durations.map(xs => ({ median: median(xs), range: range(xs) })), latencyVerdict: 'inconclusive-without-measured-bottleneck-and-cache-order-analysis', contextComparison, contextScope: 'visible-first-continuation-input-proxy-only; not opaque internal effective tokens', originalUncompressedServerBaseline: null, compressionPercentage: null });
  }
  return { kind: 'REAL_RUN', realMeasurements: true, accounting, cells, overallVerdict: 'Inspect cell-specific quality and cost vectors; no preset overall superiority.' };
}
