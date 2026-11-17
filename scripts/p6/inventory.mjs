import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const roots = [process.env.PI_CODING_AGENT_DIR || '/Users/wangxuyang/.pi/agent', '/Users/wangxuyang/Code/codex/pstack/compact/.pi'];
const inventory = roots.map(path => {
  const settings = join(path, 'settings.json');
  const selected = existsSync(settings) ? JSON.parse(readFileSync(settings)) : {};
  const extensions = join(path, 'extensions');
  return { path, settingsExists: existsSync(settings), packages: selected.packages ?? [], explicitExtensions: selected.extensions ?? [], autoDiscoveryEntries: existsSync(extensions) ? readdirSync(extensions).map(name => ({ name, children: name === 'pi-openai-fast-mode' ? readdirSync(join(extensions, name)) : undefined })) : [] };
});
writeFileSync('artifacts/P6/plugin-inventory.json', JSON.stringify({ readScope: 'Only settings packages/extensions fields and auto-discovery entry names. No auth, history or env credential reads.', inventory, conclusion: 'No executable external extension entry found. pi-openai-fast-mode contains config.json only; its contents were not read. subagents.zip is not an autoloadable extension. Host builtins are exercised by ordinary discovery. Arbitrary third-party combinations remain untested.' }, null, 2));
