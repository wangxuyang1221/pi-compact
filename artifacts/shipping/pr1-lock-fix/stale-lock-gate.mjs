import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

const original = fs.unlinkSync;
let held = false;
fs.unlinkSync = function (file) {
  if (!held && String(file) === process.env.PI_LOCK_GATE_TARGET) {
    held = true;
    fs.writeFileSync(join(process.env.PI_LOCK_GATE_DIR, 'waiting.json'), JSON.stringify({pid: process.pid, file: String(file), lock: fs.readFileSync(file, 'utf8')}));
    const start = Date.now();
    while (!fs.existsSync(join(process.env.PI_LOCK_GATE_DIR, 'release'))) {
      if (Date.now() - start > 18000) throw new Error('Lock scheduling gate timed out');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  return original.call(fs, file);
};
syncBuiltinESMExports();
