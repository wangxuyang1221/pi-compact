import fs from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { digest, refuse } from '../live/guard.mjs';
export function buildSandbox(directory) {
  if (process.platform !== 'darwin') refuse('SANDBOX_HOST_UNSUPPORTED');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const addon = join(directory, 'sandbox.node');
  const result = spawnSync('/usr/bin/clang', ['-shared', '-fPIC', '-undefined', 'dynamic_lookup', '-I', resolve(dirname(process.execPath), '../include/node'), resolve('scripts/comparison/sandbox.c'), '-o', addon], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  if (result.status !== 0) refuse('SANDBOX_BUILD_FAILED');
  return { addon, sha256: digest(fs.readFileSync(addon)), compilerWarnings: result.stderr };
}
export function sandboxEvaluate(addon, source, exportName, inputs) {
  if (typeof source !== 'string' || source.length > 64000) refuse('SOURCE_LIMIT');
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '--disable-proto=throw', resolve('scripts/comparison/sandbox-child.mjs'), addon], { input: JSON.stringify({ source, exportName, inputs }), encoding: 'utf8', timeout: 2500, killSignal: 'SIGKILL', maxBuffer: 128 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' }, cwd: dirname(addon) });
  let value;
  try { value = JSON.parse(child.stdout); } catch { value = {}; }
  return { pid: child.pid, exitCode: child.status, signal: child.signal, outputs: child.status === 0 && Array.isArray(value.outputs) ? value.outputs : null, error: child.status === 0 && Array.isArray(value.outputs) ? null : 'SANDBOX_EXECUTION_FAILED', elapsedMs: null };
}
export function scoreBehavior(addon, source, truth) {
  const run = sandboxEvaluate(addon, source, truth.exportName, truth.cases.map(c => c.input));
  if (run.outputs && run.outputs.length !== truth.cases.length) { run.error = 'OUTPUT_COUNT_MISMATCH'; run.outputs = null; }
  return { passed: run.outputs?.filter((output, i) => isDeepStrictEqual(output, truth.cases[i]?.expected)).length ?? 0, total: truth.cases.length, error: run.error, pid: run.pid, exitCode: run.exitCode, signal: run.signal };
}
