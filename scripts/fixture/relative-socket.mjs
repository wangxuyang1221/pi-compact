import cp from 'node:child_process';
import { relative } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const native = cp.execFileSync;
cp.execFileSync = function(file,args,options) {
  if (file === 'tmux' && args.includes('-S')) {
    args = [...args];
    const index = args.indexOf('-S') + 1;
    args[index] = relative(options?.cwd ?? process.cwd(), args[index]);
  }
  return native.call(this,file,args,options);
};
syncBuiltinESMExports();
