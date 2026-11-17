import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { privateTree, durableWrite, refuse } from '../live/guard.mjs';
import { discoverHost, installPackage, isolatedEnv } from './host.mjs';
import { buildSandbox } from './sandbox.mjs';
import { bindingFor, packageFile, verifyFrozen } from './freeze.mjs';
import { GRANT_SCHEMA, validateComparisonGrant } from './budget.mjs';
import { profiles, models, targetFor, readJSON, hashJSON } from './spec.mjs';
export async function launchOffline({ profile, out, resume = false, fault }) {
  process.umask(0o077);
  const p = profiles.find(p => p.id === profile); if (!p) refuse('EXPLICIT_OFFLINE_PROFILE_REQUIRED');
  const evidenceDir = resolve(out); privateTree(evidenceDir, { create: true });
  const configPath = join(evidenceDir, 'raw/config.json');
  if (fs.readdirSync(evidenceDir).length && !resume) refuse('OUTPUT_EXISTS_USE_NEW_DIRECTORY');
  const hostInfo = discoverHost();
  const binding = bindingFor(hostInfo, profile);
  let config;
  if (resume) {
    config = readJSON(configPath); validateComparisonGrant(config.grant, binding, 'offline-fixture');
    if (config.grant.evidenceDir !== evidenceDir || config.addon !== join(evidenceDir, 'raw/sandbox/sandbox.node')) refuse('RESUME_SCOPE_INVALID');
    const { digest } = await import('../live/guard.mjs');
    if (digest(fs.readFileSync(config.addon)) !== config.sandboxHash) refuse('SANDBOX_HASH_MISMATCH');
    config.hostInfo = hostInfo; config.installation = installPackage(hostInfo, packageFile, evidenceDir);
    durableWrite(configPath, config);
  }
  else {
    const installation = installPackage(hostInfo, packageFile, evidenceDir);
    const sandbox = buildSandbox(join(installation.raw, 'sandbox'));
    const grant = { schema: GRANT_SCHEMA, mode: 'offline-fixture', authorized: true, grantId: randomUUID(), expiresAt: new Date(Date.now() + 4 * 3600000).toISOString(), syntheticOnly: true, allowAuthRefresh: false, profile, binding, evidenceDir, maxDispatches: p.dispatches, maxEstimatedInputTokens: p.dispatches * 64000, maxReservedOutputTokens: p.dispatches * 1000, perRequestOutputTokens: 1000, targets: models.map(targetFor) };
    validateComparisonGrant(grant, binding, 'offline-fixture');
    config = { grant, binding, hostInfo, installation, addon: sandbox.addon, sandboxHash: sandbox.sha256, fault };
    durableWrite(configPath, config);
  }
  return executeConfigured(configPath, evidenceDir);
}
async function executeConfigured(configPath, evidenceDir) {
  privateTree(evidenceDir);
  const child = fork(resolve('scripts/comparison/worker.mjs'), [configPath], { cwd: process.cwd(), env: isolatedEnv(join(evidenceDir, 'raw')), detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { if (output.length < 16000) output += data.toString(); });
  const kill = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {  } };
  process.once('SIGINT', kill); process.once('SIGTERM', kill);
  const timeout = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {  } }, 5400000);
  let code;
  try { [code] = await once(child, 'exit'); }
  finally { clearTimeout(timeout); process.removeListener('SIGINT', kill); process.removeListener('SIGTERM', kill); }
  const groups = spawnSync('/bin/ps', ['-axo', 'pid=,pgid='], { encoding: 'utf8' });
  const descendants = groups.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number)).filter(([, pgid]) => pgid === child.pid).map(([pid]) => pid);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {  }
  if (descendants.length) await new Promise(resolve => setTimeout(resolve, 100));
  const result = fs.existsSync(join(evidenceDir, 'result.json')) ? readJSON(join(evidenceDir, 'result.json')) : { status: 'failed', output };
  if (code !== 0) { result.status = 'failed'; result.workerExitFailure = 'WORKER_EXIT_NONZERO'; }
  const installLog = join(evidenceDir, 'raw/install.jsonl');
  const installPids = fs.existsSync(installLog) ? fs.readFileSync(installLog, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.event === 'preload').map(e => e.pid) : [];
  const pids = [...new Set([child.pid, ...descendants, ...installPids, ...result.pids ?? []])];
  const alive = pids.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
  const listener = spawnSync('lsof', ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (![0, 1].includes(listener.status)) refuse('CLEANUP_CHECK_FAILED');
  const cleanup = { pids, alive, listenerCount: listener.stdout.trim() ? listener.stdout.trim().split('\n').length - 1 : 0, trackedSockets: result.cleanup?.trackedSockets ?? null, exitCode: code };
  durableWrite(join(evidenceDir, 'cleanup.json'), cleanup);
  if (output) fs.writeFileSync(join(evidenceDir, 'worker-output.txt'), output, { mode: 0o600 });
  if (alive.length || cleanup.listenerCount) refuse('CLEANUP_FAILED');
  return { result, cleanup, evidenceDir };
}

export async function launchReal({ grantFile, resume = false }) {
  if (typeof grantFile !== 'string' || !grantFile) refuse('COMPARISON_GRANT_REQUIRED');
  process.umask(0o077);
  const grant = readJSON(grantFile);
  validateComparisonGrant(grant, grant?.binding, 'real');
  const hostInfo = discoverHost(), binding = verifyFrozen(hostInfo, grant.profile);
  validateComparisonGrant(grant, binding, 'real');
  const evidenceDir = grant.evidenceDir; privateTree(evidenceDir, { create: true });
  const configPath = join(evidenceDir, 'raw/config.json');
  if (fs.readdirSync(evidenceDir).length && !resume) refuse('OUTPUT_EXISTS_USE_NEW_DIRECTORY');
  let config;
  if (resume) {
    config = readJSON(configPath);
    if (hashJSON(config.grant) !== hashJSON(grant) || config.fault || config.addon !== join(evidenceDir, 'raw/sandbox/sandbox.node')) refuse('REAL_RESUME_BINDING_MISMATCH');
    const { digest } = await import('../live/guard.mjs');
    if (digest(fs.readFileSync(config.addon)) !== config.sandboxHash) refuse('SANDBOX_HASH_MISMATCH');
    config.hostInfo = hostInfo; config.installation = installPackage(hostInfo, packageFile, evidenceDir);
  } else {
    const installation = installPackage(hostInfo, packageFile, evidenceDir), sandbox = buildSandbox(join(installation.raw, 'sandbox'));
    config = { grant, binding, hostInfo, installation, addon: sandbox.addon, sandboxHash: sandbox.sha256 };
  }
  durableWrite(configPath, config);
  return executeConfigured(configPath, evidenceDir);
}
