import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
export default function fault(pi) {
  let restore;
  const note = event => fs.appendFileSync(process.env.PI_FIXTURE_LOG, JSON.stringify({ at: performance.now(), event }) + '\n');
  pi.registerCommand('p2-disk-fail', { description: 'Inject a checkpoint append failure', handler: async (_args, ctx) => {
    const native = fs.appendFileSync;
    const file = ctx.sessionManager.getSessionFile();
    fs.appendFileSync = function (path, data, ...args) {
      if (path === file && String(data).includes('"type":"compaction"')) {
        native.call(this, path, String(data).slice(0, 70));
        note('disk-fault-fired');
        throw new Error('Synthetic checkpoint disk failure');
      }
      return native.call(this, path, data, ...args);
    };
    syncBuiltinESMExports();
    restore = () => { fs.appendFileSync = native; syncBuiltinESMExports(); };
    note('disk-fault-armed');
  } });
  pi.registerCommand('p2-disk-restore', { description: 'Restore fixture persistence', handler: async () => {
    restore(); note('disk-fault-restored');
  } });
  pi.on('session_shutdown', () => restore?.());
}
