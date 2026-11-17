import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../fixture/runtime.mjs';
export const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: 4102444800, 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url') + '.fixture';
export const options = { observer: false, readyText: 'gpt-6-astra', extensions: [join(root, 'scripts/p3/observer.ts')],
  extraEnv: { PI_COMPACT_P3_DEV: 'fixture-only', NODE_OPTIONS: '--import=' + join(root, 'scripts/p3/preload.mjs') },
  extraArgs: ['--provider', 'openai-codex', '--model', 'gpt-6-astra'],
  configure(dir) {
    const file = join(dir, 'agent/models.json');
    const config = JSON.parse(readFileSync(file));
    config.providers['openai-codex'] = { baseUrl: 'https://fixture.invalid/backend-api', api: 'openai-codex-responses', models: [{ id: 'gpt-6-astra', name: 'fixture-model Codex', contextWindow: 20000, maxTokens: 1000, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] };
    writeFileSync(file, JSON.stringify(config));
    writeFileSync(join(dir, 'agent/auth.json'), JSON.stringify({ 'openai-codex': { type: 'oauth', access: token, refresh: 'synthetic-refresh-unused', expires: 4102444800000 } }));
  },
};
export const count = (t, event) => t.log().filter(e => e.event === event).length;
export const entries = dir => readFileSync(join(dir, 'session.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
