import fs from 'node:fs';
import { dirname } from 'node:path';
import { runWorker } from './executor.mjs';
import { safeFailure, privateTree } from './guard.mjs';
try {
  privateTree(dirname(dirname(process.argv[2])));
  const result = await runWorker(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3], process.argv[4], process.argv[5]);
  if (result.status !== 'pass') process.exitCode = result.status === 'restart-required' ? 75 : 1;
} catch (error) { console.error(safeFailure(error)); process.exitCode = 1; }
