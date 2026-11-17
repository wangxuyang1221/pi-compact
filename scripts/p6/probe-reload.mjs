import '../fixture/relative-socket.mjs';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tui, root, waitFor } from '../fixture/runtime.mjs';
import { options } from './common.mjs';
const dir = join(root, 'artifacts/P6/native-reload', String(Date.now()));
const t = await tui(dir, options('', { installed: false }));
try {
  await t.text('/reload');
  await waitFor(() => t.log().filter(e => e.event === 'p6-loaded').length === 2, 'native builtin reload success');
  writeFileSync(join(dir, 'screen.txt'), t.tmux('capture-pane', '-p', '-t', 'fixture'));
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ nativeReloadSuccess: true, error: null, loaded: t.log().find(e => e.event === 'p6-loaded') }, null, 2));
} finally { await t.stop(); }
console.log(dir);
