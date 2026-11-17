import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../fixture/runtime.mjs';
export const input = 'CURRENT_INPUT_MARKER P2 boundary';
export const options = { observer: false, extensions: [join(root, 'scripts/p2/observer.ts')], configure(dir) {
  const file = join(dir, 'agent/models.json');
  const models = JSON.parse(readFileSync(file));
  models.providers.fixture.models.push({ ...models.providers.fixture.models[0], id: 'fixture-wide', name: 'Synthetic wide', contextWindow: 20000 });
  models.providers.deepseek = { ...models.providers.fixture, api: 'openai-completions', models: [{ ...models.providers.fixture.models[0], id: 'deepseek-chat', name: 'Synthetic DeepSeek' }] };
  writeFileSync(file, JSON.stringify(models));
  writeFileSync(join(dir, 'agent/auth.json'), JSON.stringify({ 'openai-codex': { type: 'api_key', key: 'fixture-only' } }));
} };
export const count = (t, event) => t.log().filter(e => e.event === event).length;
