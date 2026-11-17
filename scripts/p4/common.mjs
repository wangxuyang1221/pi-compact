import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../fixture/runtime.mjs';
import { options as p3 } from '../p3/common.mjs';
export { count, entries } from '../p3/common.mjs';
export const options = { ...p3, extensions: [...p3.extensions, join(root, 'scripts/p4/observer.ts')],
  extraEnv: { NODE_OPTIONS: '--import=' + join(root, 'scripts/p4/preload.mjs') },
  configure(dir) {
    p3.configure(dir);
    const file = join(dir, 'agent/models.json');
    const config = JSON.parse(readFileSync(file));
    const codex = config.providers['openai-codex'];
    codex.models.push({ ...codex.models[0], id: 'gpt-6.1-sol', name: 'fixture-model compatible Codex' });
    config.providers.deepseek = { baseUrl: 'https://fixture.invalid/v1', api: 'openai-completions', apiKey: 'fixture-deepseek',
      models: [{ ...codex.models[0], id: 'deepseek-chat', name: 'fixture-model DeepSeek' }, { ...codex.models[0], id: 'deepseek-reasoner', name: 'fixture-model DeepSeek final' }] };
    writeFileSync(file, JSON.stringify(config));
  },
};
