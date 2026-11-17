import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { join, isAbsolute } from 'node:path';
import { DurableLedger, refuse, privateTree } from '../live/guard.mjs';
import { models, profiles, schedule, hashJSON, targetFor } from './spec.mjs';
export const GRANT_SCHEMA = 'pi-compact-comparison-grant/v1';
export function invalidTemplate(binding, profile) {
  return { schema: GRANT_SCHEMA, mode: 'real', authorized: false, explicitUserAuthorization: null, grantId: null, expiresAt: null, evidenceDir: null, authPath: null, allowAuthRefresh: false, syntheticOnly: true, profile, binding, targets: models.map(targetFor), activeBudget: 0, maxDispatches: 0, maxEstimatedInputTokens: 0, maxReservedOutputTokens: 0, perRequestOutputTokens: 1000 };
}
export function validateComparisonGrant(grant, binding, mode) {
  if (!grant || grant.schema !== GRANT_SCHEMA || grant.mode !== mode || grant.authorized !== true || !['offline-fixture', 'real'].includes(mode)) refuse('COMPARISON_GRANT_REQUIRED');
  const profile = profiles.find(p => p.id === grant.profile);
  if (!isAbsolute(grant.evidenceDir ?? '') || hashJSON(grant.targets) !== hashJSON(models.map(targetFor))) refuse('COMPARISON_SCOPE_INVALID');
  if (mode === 'real' && (!isAbsolute(grant.authPath ?? '') || typeof grant.explicitUserAuthorization !== 'string' || !grant.explicitUserAuthorization.trim() || grant.fixtureFault || grant.fault)) refuse('REAL_AUTHORIZATION_REQUIRED');
  if (!profile || hashJSON(grant.binding) !== hashJSON(binding) || grant.syntheticOnly !== true || grant.allowAuthRefresh !== false || grant.perRequestOutputTokens !== 1000 || grant.maxDispatches !== profile.dispatches || grant.maxEstimatedInputTokens !== profile.dispatches * 64000 || grant.maxReservedOutputTokens !== profile.dispatches * 1000 || !/^[\w-]{1,80}$/.test(grant.grantId ?? '') || !(Date.parse(grant.expiresAt) > Date.now())) refuse('COMPARISON_BINDING_OR_BUDGET_INVALID');
  return grant;
}
export class ComparisonLedger extends DurableLedger {
  requestStage = new AsyncLocalStorage();
  constructor(grant) {
    privateTree(grant.evidenceDir, { create: true });
    const recovery = join(grant.evidenceDir, 'recovery.lock');
    let fd; try { fd = fs.openSync(recovery, 'wx', 0o600); } catch { refuse('RECOVERY_LOCKED'); }
    try {
      const lock = join(grant.evidenceDir, 'owner.lock');
      if (fs.existsSync(lock)) {
        const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
        if (owner.grantHash !== hashJSON(grant) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) refuse('LEDGER_OWNER_INVALID');
        let alive = true; try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
        if (alive) refuse('LEDGER_LOCKED');
        fs.unlinkSync(lock);
      }
      super(grant);
    } finally { fs.closeSync(fd); fs.unlinkSync(recovery); }
  }
  setLane(lane, stage) { this.lane = lane; this.stage = stage; }
  withRequest(stage, action) {
    if (!['compact', 'continuation'].includes(stage)) refuse('REQUEST_STAGE_REQUIRED');
    return this.requestStage.run(stage, action);
  }
  reserve(fields, signal) {
    if (!this.lane || !['compact', 'continuation'].includes(this.stage)) refuse('LANE_REQUIRED');
    const stage = this.requestStage.getStore() ?? this.stage;
    const lane = this.lane, rows = this.rows;
    const profile = profiles.find(p => p.id === this.grant.profile);
    if (!schedule(profile.id).some(l => hashJSON(l) === hashJSON(lane)) || fields.model !== lane.model || !models.includes(fields.model)) refuse('LANE_BINDING_INVALID');
    const mine = rows.filter(r => r.laneId === lane.id);
    const modelRows = rows.filter(r => r.model === lane.model);
    const phaseRows = rows.filter(r => r.model === lane.model && r.experimentPhase === lane.phase);
    const phaseLimit = lane.phase === 'pilot' ? 4 : profile.repeats * 24;
    const stageLimit = lane.phase === 'pilot' ? 1 : stage === 'compact' ? 2 : 5;
    if (mine.length >= lane.maxDispatches || modelRows.length >= 4 + profile.repeats * 24 || phaseRows.length >= phaseLimit || mine.filter(r => r.stage === stage).length >= stageLimit || fields.inputTokens > 64000) refuse('COMPARISON_BUDGET_EXHAUSTED');
    return super.reserve({ ...fields, operation: stage === 'compact' ? 'compact' : 'normal', laneId: lane.id, task: lane.task, repeat: lane.repeat, assignedArm: lane.arm, experimentPhase: lane.phase, stage, reservedMonoMs: performance.now(), fixture: this.grant.mode === 'offline-fixture' }, signal);
  }
  check(signal) {
    super.check(signal);
    if (this.rows.some(r => r.auditFailure || r.state === 'failed')) refuse('COMPARISON_AUDIT_STOP');
  }
}
