import fs from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { digest, refuse } from '../live/guard.mjs';
export const ROOT = resolve('.');
export const DESIGN = join(ROOT, 'artifacts/P6-comparison-design');
export const ARTIFACT = join(ROOT, 'artifacts/P6-comparison-cmp-fixes');
export const readJSON = path => JSON.parse(fs.readFileSync(path, 'utf8'));
export const hashJSON = value => digest(JSON.stringify(value));
export const models = ['gpt-6.1-terra', 'gpt-6-luna'];
export const tasks = ['settlement-v2', 'redirect-v2'];
export const arms = ['pi-native', 'pi-compact-remote'];
export const controls = { compaction: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }, retry: { enabled: false }, providerRetry: { maxRetries: 0 }, transport: 'sse', cacheWarming: 'off', quietStartup: true };
export const targetFor = model => ({ provider: 'openai-codex', model, api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api', endpoint: 'https://chatgpt.com/backend-api/codex/responses', transport: 'sse' });
export const profiles = [
  { id: 'compatibility-only', repeats: 0, dispatches: 8 },
  { id: 'quality-observation', repeats: 1, dispatches: 56 },
  { id: 'paired-five', repeats: 5, dispatches: 248 },
];
export function schedule(profile) {
  const spec = profiles.find(p => p.id === profile); if (!spec) refuse('PROFILE_INVALID');
  const lanes = [];
  for (const model of models) for (const arm of arms) lanes.push({ id: `pilot-${model}-${arm}`, phase: 'pilot', model, task: tasks[0], arm, repeat: 0, maxDispatches: 2 });
  for (let repeat = 1; repeat <= spec.repeats; repeat++) for (const [mi, model] of models.entries()) for (const [ti, task] of tasks.entries()) {
    for (const arm of (repeat + mi + ti) % 2 === 1 ? arms : [...arms].reverse()) lanes.push({ id: `r${repeat}-${model}-${task}-${arm}`, phase: 'comparison', model, task, arm, repeat, maxDispatches: 6 });
  }
  return lanes;
}
export function plan(profile = null) {
  return { schema: 'pi-compact-comparison-plan/v2', authorized: false, armed: false, realMeasurements: false, activeBudget: { dispatches: 0, estimatedInputTokens: 0, reservedOutputTokens: 0 }, defaultProfile: null, profile, commonToolEncoding: { supportsAdditionalTools: false, supportsToolSearch: false, reason: 'This experiment uses the same SDK top-level function encoding in both arms. These flags describe the experiment configuration, not the product request validator; they do not establish default-tool product coverage.' }, models: models.map(targetFor), controls, profiles: profiles.map(p => ({ ...p, status: 'PROPOSAL', estimatedInputTokens: p.dispatches * 64000, reservedOutputTokens: p.dispatches * 1000 })), ...(profile ? { schedule: schedule(profile) } : {}), scoring: readJSON(join(DESIGN, 'benchmark-plan.json')).metrics, verdicts: readJSON(join(DESIGN, 'benchmark-plan.json')).verdicts };
}
export function fileManifest(dir) {
  const files = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const p = join(e.parentPath, e.name);
    if (e.isSymbolicLink() || (!e.isFile() && !e.isDirectory())) refuse('MANIFEST_SPECIAL_FILE');
    if (e.isFile()) files[relative(dir, p)] = digest(fs.readFileSync(p));
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
export function normalizeHistory(raw, model) {
  return raw.map((m, i) => {
    const { id, ...message } = m;
    return { type: 'message', id, parentId: i ? raw[i - 1].id : null, timestamp: '2026-01-01T00:00:00.000Z', message: { ...message, timestamp: i, ...(m.role === 'assistant' ? {
      content: typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content,
      api: 'openai-codex-responses', provider: 'openai-codex', model,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: Array.isArray(m.content) && m.content.some(p => p.type === 'toolCall') ? 'toolUse' : 'stop',
    } : {}) } };
  });
}
export function dataset(task) {
  if (!tasks.includes(task)) refuse('TASK_INVALID');
  const base = join(ARTIFACT, 'datasets', task);
  return { base, history: readJSON(join(base, 'history.json')), continuation: readJSON(join(base, 'continuation.json')), truth: readJSON(join(base, 'oracle/groundtruth.json')), workspace: join(base, 'workspace') };
}
