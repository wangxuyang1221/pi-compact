import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, shim } from '../fixture/runtime.mjs';
import { options as p4 } from '../p4/common.mjs';
export function install(dir, pkg, action = 'install') {
  const log = join(dir, 'install-events.jsonl');
  const env = { PATH: process.env.PATH, HOME: join(dir, 'home'), PI_CODING_AGENT_DIR: join(dir, 'agent'), PI_OFFLINE: '1', TMPDIR: join(dir, 'tmp'), NODE_OPTIONS: '--import=' + join(root, 'scripts/fixture/preload.mjs'), PI_FIXTURE_LOG: log, PI_FIXTURE_CONTROL: join(dir, 'control.json') };
  mkdirSync(env.HOME, { recursive: true });
  const out = execFileSync(shim, [action, pkg], { cwd: join(dir, 'cwd'), env, encoding: 'utf8' });
  writeFileSync(join(dir, `${action}-${Date.now()}.txt`), out);
  return out;
}
export function options(pkg, { installed = true, existing = false } = {}) {
  return { ...p4, variant: 'baseline', discover: true, captureReady: false,
    extensions: [join(root, 'scripts/p3/observer.ts'), join(root, 'scripts/p4/observer.ts'), join(root, 'scripts/p6/observer.ts')],
    extraEnv: { NODE_OPTIONS: '--import=' + join(root, 'scripts/p6/preload.mjs'), PI_P6_DENY_ROOT: root },
    configure(dir) {
      p4.configure(dir);
      const modelFile = join(dir, "agent/models.json");
      const models = JSON.parse(readFileSync(modelFile));
      for (const provider of Object.values(models.providers)) for (const model of provider.models) model.contextWindow = 200000;
      writeFileSync(modelFile, JSON.stringify(models));
      if (installed) install(dir, pkg);
      if (existing) throw new Error('Use a fresh isolated fixture agent for each run.');
    },
  };
}
export function filter(dir, pkg, enabled) {
  const file = join(dir, 'agent/settings.json');
  const settings = JSON.parse(readFileSync(file));
  settings.packages = [enabled ? pkg : { source: pkg, extensions: [] }];
  writeFileSync(file, JSON.stringify(settings));
}
