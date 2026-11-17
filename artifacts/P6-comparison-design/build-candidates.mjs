// Offline synthetic data authoring only. Does not import Pi or call any provider.
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const put = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, v); };
const json = (p, v) => put(p, JSON.stringify(v, null, 2) + '\n');
const scenarios = [
  {
    id: 'settlement-v1', module: 'settlement.mjs', exportName: 'settle',
    initial: 'export function settle(rows) { return []; }\n',
    reference: `export function settle(rows) {
  const seen = new Set(), totals = new Map();
  for (const r of rows) {
    if (r.status !== 'settled' || !Number.isInteger(r.cents) || r.cents < 0) continue;
    const key = JSON.stringify([r.tenant, r.event]);
    if (seen.has(key)) continue;
    seen.add(key); totals.set(r.tenant, (totals.get(r.tenant) ?? 0) + r.cents);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([tenant, cents]) => ({ tenant, cents }));
}\n`,
    facts: { currency: 'CNY-cents', duplicateKey: 'tenant+event', eligible: 'settled', duplicateWinner: 'first-valid', zero: 'include', sort: 'tenant-ascending' },
    stale: { duplicateKey: 'event', duplicateWinner: 'last', zero: 'drop' },
    pending: ['implement-settle', 'run-regression'],
    early: '财务对账导出只用整数人民币分，不允许浮点换算；只有 status=settled 且 cents 为非负整数才计入，pending/failed 不消耗去重键。暂定按 event 全局去重、最后一条覆盖、零金额不导出。输入租户和事件均为非空 ASCII 字符串。',
    update: '业务评审更正：撤销 event 全局去重、最后覆盖和丢弃零金额。按 tenant+event 去重，第一条有效 settled 记录生效；零金额也要建立租户行。输出按 tenant 升序，每行只含 tenant,cents。仍未实现 settle，也未运行回归。',
    cases: [
      { id: 'empty', input: [], expected: [] },
      { id: 'single', input: [{tenant:'b',event:'e1',status:'settled',cents:125}], expected:[{tenant:'b',cents:125}] },
      { id: 'cross-tenant', input:[{tenant:'b',event:'e1',status:'settled',cents:5},{tenant:'a',event:'e1',status:'settled',cents:7}], expected:[{tenant:'a',cents:7},{tenant:'b',cents:5}] },
      { id: 'first-valid', input:[{tenant:'a',event:'e',status:'pending',cents:99},{tenant:'a',event:'e',status:'settled',cents:4},{tenant:'a',event:'e',status:'settled',cents:8}], expected:[{tenant:'a',cents:4}] },
      { id: 'zero', input:[{tenant:'z',event:'e',status:'settled',cents:0}], expected:[{tenant:'z',cents:0}] },
      { id: 'invalid', input:[{tenant:'a',event:'e',status:'failed',cents:10},{tenant:'a',event:'f',status:'settled',cents:-1},{tenant:'a',event:'g',status:'settled',cents:1.5}], expected:[] },
      { id: 'sum', input:[{tenant:'a',event:'e',status:'settled',cents:10},{tenant:'a',event:'f',status:'settled',cents:2}], expected:[{tenant:'a',cents:12}] }
    ],
  },
  {
    id:'redirect-v1', module:'redirect.mjs', exportName:'redirect',
    initial:'export function redirect(request) { return null; }\n',
    reference:`export function redirect(r) {
  if (!['GET', 'HEAD'].includes(r.method)) return null;
  const m = /^\\/(en|fr)\\/old\\/([^/]+)$/.exec(r.path);
  if (!m) return null;
  return { status: 308, location: '/' + m[1] + '/articles/' + m[2] + (r.query ? '?' + r.query : '') };
}\n`,
    facts:{ status:308, methods:'GET+HEAD', locale:'preserve-en-fr', query:'preserve-raw', slug:'one-nonempty-segment', destination:'articles' },
    stale:{ status:301, methods:'GET-only', locale:'force-en' },
    pending:['implement-redirect','run-regression'],
    early:'迁移旧文章 URL /{locale}/old/{slug}。query 参数是没有问号的原始字符串，必须逐字保留编码与顺序，不可解析后重编码。无 query 不加问号。暂定 301、仅 GET，统一跳 en。路径区分大小写，slug 是一个非空路径段，不处理尾斜杠。',
    update:'撤销初版重定向决策：状态改为 308，GET 与 HEAD 都支持，保留 en/fr 原 locale，目标为 /{locale}/articles/{slug}。其他方法、locale、路径不匹配返回 null。redirect.mjs 仍为 stub，回归尚未运行。',
    cases:[
      {id:'get',input:{method:'GET',path:'/en/old/a',query:''},expected:{status:308,location:'/en/articles/a'}},
      {id:'head-fr',input:{method:'HEAD',path:'/fr/old/b',query:''},expected:{status:308,location:'/fr/articles/b'}},
      {id:'raw-query',input:{method:'GET',path:'/fr/old/a',query:'q=a%20b&x=1&x=2'},expected:{status:308,location:'/fr/articles/a?q=a%20b&x=1&x=2'}},
      {id:'post',input:{method:'POST',path:'/en/old/a',query:''},expected:null},
      {id:'locale',input:{method:'GET',path:'/de/old/a',query:''},expected:null},
      {id:'slash',input:{method:'GET',path:'/en/old/a/',query:''},expected:null},
      {id:'case',input:{method:'GET',path:'/EN/old/a',query:''},expected:null},
      {id:'empty-slug',input:{method:'GET',path:'/en/old/',query:''},expected:null}
    ],
  }
];
for (const s of scenarios) {
  const dir = path.join(root, 'datasets', s.id);
  const files = {[s.module]:s.initial, 'release.json':JSON.stringify({schema:2, owner:'platform', ready:false},null,2)+'\n', 'DO-NOT-EDIT.txt':'audit retention: 30 days\n'};
  for(const [p,body] of Object.entries(files)) put(path.join(dir,'workspace',p),body);
  put(path.join(dir,'oracle/reference',s.module),s.reference);
  const history=[];
  const user = content => history.push({id:`e${history.length}`,role:'user',content});
  const exchange = (name,args,result) => {
    const id=`call${history.length}`;
    history.push({id:`e${history.length}`,role:'assistant',content:[{type:'toolCall',id,name,arguments:args}]});
    history.push({id:`e${history.length}`,role:'toolResult',toolCallId:id,toolName:name,content:[{type:'text',text:result}],isError:false});
  };
  user(s.early + '\nContract draft: ' + JSON.stringify({...s.facts,...s.stale}));
  exchange('read',{path:s.module},s.initial);
  exchange('read',{path:'release.json'},files['release.json'].replace('"schema": 2','"schema": 1'));
  user('先完成元数据 schema 1→2（任务 ID metadata-upgrade），保留 owner 和 ready；业务函数实现和回归留待本轮维护检查后续做。其任务 ID: ' + s.pending.join(',') + '。DO-NOT-EDIT.txt 是外部审计约束，不能改。');
  exchange('edit',{path:'release.json',oldText:'"schema": 1',newText:'"schema": 2'},'Successfully replaced text in release.json.');
  exchange('read',{path:'release.json'},files['release.json']);
  // Deterministic, distinct maintenance records, not repeated target facts or x padding.
  // Each input batch has actual expected arithmetic and path results. All are synthetic.
  for(let i=0;i<100;i++) {
    if(i===12) user(s.update + '\nContract amendment: ' + JSON.stringify(Object.fromEntries(Object.keys(s.stale).map(k=>[k,s.facts[k]]))));
    user(`维护检查 ${i}: 检查独立模块 batch-${String(i).padStart(3,'0')} 的输入契约和输出样例。本模块无需修改；这些已完成的维护项与待完成业务函数同属本次发布。`);
    const records=Array.from({length:8},(_,j)=>({case:`b${i}-c${j}`,input:{quantity:i+j+1,unitCents:17+j,basePath:`/batch/${i}/item/${j}`},expected:{totalCents:(i+j+1)*(17+j),auditPath:`/audit/batch/${i}/item/${j}`},review:'checked',changeRequired:false}));
    const maintenancePath=`maintenance/batch-${String(i).padStart(3,'0')}.json`;
    put(path.join(dir,'workspace',maintenancePath),JSON.stringify(records));
    exchange('read',{path:maintenancePath},JSON.stringify(records));
    history.push({id:`e${history.length}`,role:'assistant',content:`batch-${i} 的 8 个整数乘积和路径拼接样例一致；无需变更，记录为已检查。`});
  }
  user('维护检查完毕。继续此前尚未完成的业务函数与回归，不更改已经完成的元数据和审计文件。');
  const state={metadataSchema:2, metadataReady:false, implementation:'stub', lastTool:'read', regression:'not-run'};
  json(path.join(dir,'history.json'),history);
  json(path.join(dir,'oracle/groundtruth.json'),{id:s.id,module:s.module,exportName:s.exportName,facts:s.facts,stale:s.stale,pending:s.pending,state,cases:s.cases,protectedFiles:['release.json','DO-NOT-EDIT.txt',...Array.from({length:100},(_,i)=>`maintenance/batch-${String(i).padStart(3,'0')}.json`)],allowedModifiedFiles:[s.module]});
  json(path.join(dir,'continuation.json'),{prompt:`先调用 record_checkpoint 工具，仅从已有上下文填写压缩时状态，再继续修改工作区中的业务函数并运行工具允许的回归。record_checkpoint 参数为 {facts:{},pending:[],state:{}}，facts 键为 ${Object.keys(s.facts).join(',')}；state 键为 ${Object.keys(state).join(',')}。metadataSchema 为整数，metadataReady 为布尔；implementation 为 stub 或 implemented；lastTool 填实际工具名称；regression 为 not-run、pass 或 fail。facts 值采用历史契约原值；未知可填 null。pending 从任务 ID ${[...s.pending,'metadata-upgrade','maintenance-review'].join(',')} 中选择未完成的项。记录完状态后可 read/edit/write/bash，完成后简短说明结果。`,pendingVocabulary:[...s.pending,'metadata-upgrade','maintenance-review'],toolPolicy:'record_checkpoint must be first; once only, no answers returned; read/edit/write confined to lane workspace; bash only deterministic local test command; oracle inaccessible'});
}
console.log(JSON.stringify({kind:'synthetic-candidate-generation',scenarios:scenarios.map(s=>s.id),providerRequests:0}));
