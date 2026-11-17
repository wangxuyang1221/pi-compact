import fs from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { task, taskHash } from './live/task.mjs';
import { digest, validateGrant, refuse, safeFailure, privateTree } from './live/guard.mjs';
export { task };
export const plan = {
  schema: 2, mode: 'dry-run', authorized: false, task, taskHash,
  networkRequestsThisRun: 0, authReadsThisRun: 0,
  budget: { maxDispatches: 12, maxEstimatedInputTokens: 120000, maxReservedOutputTokens: 12000, perRequestOutputTokens: 1000, inputEstimate: 'ceil(decoded HTTP body bytes / 4), not server tokens', outputReservation: 'explicit max_output_tokens (Codex, including reasoning) or max_tokens (non-reasoning DeepSeek). Codex host omits cap; executor adds it after host payload hooks. Server acceptance remains pending; rejection stops without uncapped retry.', monetaryCost: 'unknown' },
  targets: [
    { provider: 'openai-codex', model: 'gpt-6.1-sol', api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api', endpoint: 'https://chatgpt.com/backend-api/codex/responses', transport: 'sse' },
    { provider: 'deepseek', model: 'deepseek-chat', api: 'openai-completions', baseUrl: 'https://api.deepseek.com', endpoint: 'https://api.deepseek.com/chat/completions', transport: 'sse' },
  ],
  schedule: ['native-summary', 'native-continuation', 'remote-summary', 'remote-continuation', 'repeat-remote', 'restore-continuation', 'source-to-text', 'target-native-summary', 'deepseek-continuation'],
  contingencyDispatches: 3,
  order: 'Native first. Identical twelve-turn source and file bytes. Repeat remote adds only a synthetic tail. Restore starts a new worker using the disk session and the same ledger. Migration invokes installed product setModel/compact. Stop on first failed scenario; no advantage calculation.',
  transport: 'SSE only. Exact HTTPS POST endpoint and model at final send. No redirects, automatic retries, auth refresh, catalogs, proxies or websocket. Every dispatch reserves before send, including fallback and slices.',
  credentials: 'Only after valid real grant, a read-only credential store reads grant.authPath as JSON and exposes only the two authorized providers to Pi. No commands, credential mutation or real history/auth copies. Fixture credentials are generated only in offline-fixture mode. Missing or expired credentials stop; refresh is not permitted.',
  evidence: 'Grant-bound evidence directory. Public allowlisted ledger/results. Raw synthetic sessions and opaque checkpoints are private 0700/0600 and excluded from packages/public evidence.',
  recovery: 'Same grant and evidence directory resumes ledger, never resets reservations. One exclusive owner lock. Crash leaves lock and reservations intact; concurrent or crashed owner blocks reopening. Preserve ledger, inspect dead owner before administrative lock removal.',
  gate: 'Executable adapter is present. Real execution requires a fresh user grant recorded by coordinator after independent review. This plan and template are not grants; exhausted prior authorization cannot be reused.',
  pending: ['All real service results', 'Codex explicit output-cap acceptance', 'Actual server reasoning/output accounting', 'Real summary quality and SSE reliability', 'User visual gate', 'Independent P6 review'],
};
export function fixtureGrant(evidenceDir, packageHash) {
  return { schema: 2, authorized: true, mode: 'offline-fixture', grantId: 'offline-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), syntheticOnly: true, allowAuthRefresh: false, taskHash, packageHash, evidenceDir: resolve(evidenceDir), ...Object.fromEntries(['maxDispatches', 'maxEstimatedInputTokens', 'maxReservedOutputTokens', 'perRequestOutputTokens'].map(k => [k, plan.budget[k]])), targets: plan.targets.map(t => ({ ...t, baseUrl: t.provider === 'openai-codex' ? 'https://fixture.invalid/backend-api' : 'https://fixture.invalid/v1', endpoint: t.provider === 'openai-codex' ? 'https://fixture.invalid/backend-api/codex/responses' : 'https://fixture.invalid/v1/chat/completions' })) };
}
async function main(args) {
  if (args.includes('--help')) { console.log('Usage: node scripts/live-acceptance.mjs [--output PLAN]\n       --offline-fixture --evidence DIR [--package TGZ]\n       --execute --grant FILE --evidence DIR [--package TGZ]\nDefault: zero-auth, zero-network dry-run. Real grants require fresh user authorization.'); return; }
  const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  if (!args.includes('--execute') && !args.includes('--offline-fixture')) {
    if (value('--output')) fs.writeFileSync(value('--output'), JSON.stringify(plan, null, 2) + '\n');
    console.log(JSON.stringify(plan, null, 2)); return;
  }
  if (args.includes('--execute') && args.includes('--offline-fixture')) refuse('MODE_CONFLICT');
  const mode = args.includes('--execute') ? 'real' : 'offline-fixture';
  if (mode === 'real' && !value('--grant')) refuse('GRANT_REQUIRED');
  const evidenceDir = value('--evidence') && resolve(value('--evidence'));
  if (!evidenceDir || !evidenceDir.startsWith(resolve('artifacts/P6-executor/runs') + '/')) refuse('EVIDENCE_DIRECTORY_REQUIRED');
  const packageFile = resolve(value('--package') ?? 'artifacts/P6-executor/release/pi-compact-0.1.0.tgz');
  const packageHash = digest(fs.readFileSync(packageFile));
  const fixtureFile = evidenceDir + '/raw/grant.json';
  privateTree(evidenceDir);
  const rawGrant = mode === 'real' ? JSON.parse(fs.readFileSync(value('--grant'), 'utf8')) : fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : fixtureGrant(evidenceDir, packageHash);
  if (value('--fault')) {
    if (mode !== 'offline-fixture') refuse('FIXTURE_FAULT_REAL_DENIED');
    const { faults } = await import('./live/faults.mjs');
    if (!faults.includes(value('--fault'))) refuse('UNKNOWN_FIXTURE_FAULT');
    rawGrant.fixtureFault = value('--fault');
    if (['budget', 'retry-cap', 'concurrent'].includes(rawGrant.fixtureFault)) rawGrant.maxDispatches = 1;
    if (rawGrant.fixtureFault === 'input-budget') rawGrant.maxEstimatedInputTokens = 1;
    if (rawGrant.fixtureFault === 'output-budget') rawGrant.maxReservedOutputTokens = 1;
  }
  const grant = validateGrant(rawGrant, { mode, taskHash, packageHash, evidenceDir });
  const { execute } = await import('./live/executor.mjs');
  const result = await execute({ grant, packageFile });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(safeFailure(error)); process.exitCode = 1; });
