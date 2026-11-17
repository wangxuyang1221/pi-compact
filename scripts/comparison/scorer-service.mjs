import { dataset, tasks } from './spec.mjs';
import { scoreBehavior } from './sandbox.mjs';
const truths = new Map(tasks.map(task => [task, dataset(task).truth]));
process.on('message', request => {
  if (request?.kind === 'close') { process.disconnect(); return; }
  if (request?.kind !== 'score' || !truths.has(request.task) || typeof request.source !== 'string' || request.source.length > 64000) { process.send({ id: request?.id, error: 'SCORER_REQUEST_DENIED' }); return; }
  try { process.send({ id: request.id, value: scoreBehavior(process.argv[2], request.source, truths.get(request.task)) }); }
  catch { process.send({ id: request.id, error: 'SCORER_FAILED' }); }
});
