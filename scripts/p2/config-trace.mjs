import { writeFileSync } from 'node:fs';
const records = [];
const mark = (event, data = {}) => records.push({ ns: process.hrtime.bigint().toString(), event, ...data });
globalThis[Symbol.for('pi-compact.config-trace')] = mark;
const emit = process.stdin.emit;
process.stdin.emit = function (event, ...args) {
  if (event === 'data') mark('stdin', { text: String(args[0]) });
  return emit.call(this, event, ...args);
};
const write = process.stdout.write;
process.stdout.write = function (data, ...args) {
  mark('stdout-entry', { text: String(data) });
  const result = write.call(this, data, ...args);
  mark('stdout-return');
  return result;
};
process.on('exit', code => { mark('exit', { code }); writeFileSync(process.env.PI_CONFIG_TRACE, JSON.stringify(records)); });
