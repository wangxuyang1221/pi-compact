# Comparison 请求阶段与质量约束修复候选

协调者本地验证 PASS，待 fresh 独立复审。没有真实请求、真实凭据/历史读取或有效 real grant；没有模型效果或优势结论。产品和共享功能执行器未改，包仍为209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d。

实现提交：b52a335a3352697d8429cd2ea6d002b462afad62；最后的审计phase一致性修正bd89a6ee161bc4eb041646c171a499a5f8048be6。前一独立审查绑定01b877e，完整报告保留在 /Users/wangxuyang/.t3/worktrees/compact/t3-227d50e4-aee5600a31a889c8/artifacts/P6-comparison-independent/REPORT.md。此次先复现CMP-1、CMP-2及N1，再修改，原读数见before-probe-results.json；原脚本在artifacts/P6-comparison-fixes/probes-before.mjs。

## 修复

CMP-1：installed Pi手动和自动路径都调用 _runDefaultCompaction。测试适配器在绑定扩展之后对这一实例方法包裹AsyncLocalStorage，覆盖native/remote/fallback内部请求；ModelRuntime.streamSimple捕获该可信调用范围。每个fetch带固定compact/continuation阶段，ComparisonLedger按范围计数并覆盖共享guard的旧文本operation推断。stage、operation及审计phase一致。续做始终检查配对wire，任何正文关键词均不豁免；续做中若出现真正结构化compaction_trigger直接拒绝。没有改共享guard，既有功能执行器不受影响。

CMP-2：派生pair保留完整record、behavior、workspace、capturedFirst质量向量，以及compact/continuation/total成本向量；排除PID等执行身份字段。无差异需要完整向量相等。体积数值仍展示；质量下降时标tradeoff-smaller-input-quality-regression，质量维度缺失则inconclusive，不能给正向优势。更大输入但更高质量有对称tradeoff。速度仍保持没有瓶颈证据则inconclusive。

N1：server rawUsage只保留数值allowlist，任意额外字符串不落公共账本；缓存分项之和不得超过input，optional非法数值及reasoning/total不一致会停止。缺失项仍记null，不虚构0。

N2：实际最新契约在e58。criticalEntries已包含e0..e10及e58，逐ID验证存在且位于切分前；preflight记录这一事实。此前“所有关键事实均在e0..e10”的说明不准确，本报告纠正。数据本身未修改，e58在e227前缀内。

## 验证与证据

- 反例回归：普通文本、# Conversation、<conversation>、source固定句均可完成1compact+5continuation，关键词不改变阶段。两种正文下，不同instructions/tools均在send前拒绝。质量下降+更小输入显示tradeoff；行为、文件或checkpoint时序不同均不判无差异；完整相同质量可判本样本无可测差异，质量相同且较小input保留限定正向判定。非法缓存拒绝且private_debug不落盘。见regressions.json及scripts/verify-comparison-fixes.mjs。
- 真实installed宿主范围探针：预加载器故意把所有外层ledger阶段设成continuation；真正SDK压缩仍按可信范围记录4compact+4continuation，共8fixture dispatch。native与remote都通过；最后版本phase与stage逐条一致。见scope-result-final.json、scope-ledger-final.json；注入器artifacts/P6-comparison-fixes/scope-preload.mjs。
- 完整56fixture：4pilot+8正式lane、实际文件修改、7/8业务用例、保护文件及成对wire均通过。当前preflight绑定数据及实际编码。最后一行phase日志修正后，定向真实宿主8次复跑通过；未将较早56次冒称在该单行修正后重跑。
- 12安全/评分组、7实际宿主故障场景、lint/typecheck通过。原248次完整paired-five和74tests是前次独立证据，不冒称本次新测量。scope修正不涉及产品/共享helper。
- 三个profile的最终verifyFrozen通过。旧P6-comparison、P6-comparison-ready及其manifest没有改写；当前冻结单独在本目录。
- 114个登记PID均已退出，无监听；各实际run trackedSockets=0。见cleanup.json。没有真实服务、auth读取或未清理后台进程。

默认plan/help没有授权。real仍须新明确授权并绑定当前freeze，原8/56/248提案不构成授权。本候选只修正测量流程，statisticalComparison在fixture下仍为null。真实质量、cap/usage能力、用户视觉与完整P6均pending。

复跑使用新私有目录：node scripts/verify-comparison-fixes.mjs scratch/comparison/new-fix-probes；node scripts/comparison/verify.mjs scratch/comparison/new-security；node scripts/comparison.mjs offline --profile quality-observation --out scratch/comparison/new-quality；node scripts/comparison/verify-runs.mjs scratch/comparison/new-faults。实际scope探针在comparison命令前加入 --import=./artifacts/P6-comparison-fixes/scope-preload.mjs，并用compatibility-only。不要覆盖旧输出或重新生成旧freeze。
