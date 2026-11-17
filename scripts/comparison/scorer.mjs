import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileManifest } from './spec.mjs';
import { digest } from '../live/guard.mjs';
export function scoreRecord(record, truth) {
  const object = (actual, expected) => {
    const predictions = actual && typeof actual === 'object' && !Array.isArray(actual) ? Object.entries(actual).filter(([, v]) => v !== null) : [];
    const tp = predictions.filter(([k, v]) => Object.hasOwn(expected, k) && isDeepStrictEqual(v, expected[k])).length;
    return { tp, fp: predictions.length - tp, fn: Object.keys(expected).length - tp, precision: predictions.length ? tp / predictions.length : null, recall: tp / Object.keys(expected).length };
  };
  const pending = Array.isArray(record?.pending) ? record.pending : [];
  const tp = new Set(pending.filter(p => truth.pending.includes(p))).size;
  return { facts: object(record?.facts, truth.facts), state: object(record?.state, truth.state), pending: { tp, fp: pending.length - tp, fn: truth.pending.length - tp }, stale: { adopted: Object.entries(truth.stale).filter(([k, v]) => isDeepStrictEqual(record?.facts?.[k], v)).length, opportunities: 3 } };
}
export function scoreWorkspace(workspace, baseline, truth) {
  const after = fileManifest(workspace), before = fileManifest(baseline);
  const changed = Object.keys(before).filter(k => after[k] !== before[k]);
  return { protectedPassed: truth.protectedFiles.filter(k => after[k] === before[k]).length, protectedTotal: truth.protectedFiles.length, unauthorizedChanges: changed.filter(k => !truth.allowedModifiedFiles.includes(k)), extraFiles: Object.keys(after).filter(k => !Object.hasOwn(before, k)), sourceChanged: digest(fs.readFileSync(join(workspace, truth.module))) !== before[truth.module] };
}
export function strictSuccess(record, workspace, behavior, capturedFirst) {
  return capturedFirst && ['facts', 'state', 'pending'].every(k => record[k].fp === 0 && record[k].fn === 0) && record.stale.adopted === 0 && workspace.protectedPassed === 102 && !workspace.unauthorizedChanges.length && !workspace.extraFiles.length && workspace.sourceChanged && behavior.passed === behavior.total && !behavior.error;
}
