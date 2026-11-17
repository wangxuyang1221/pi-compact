# P6 comparison 修复独立复审：PASS

**当前候选已准备好交用户审阅，并请求绑定具体真实模型、阶段和预算的明确授权。** CMP-1、CMP-2 两个原阻塞项及 N1、N2 已关闭，本次未发现新的阻塞项。这里的 PASS 仅指本地技术审查，不放行真实服务，不生成授权，不代表真实模型比较或 P6 complete。

## 完成情况与精确绑定

- HEAD：`22217359fb879a581a2c5f787d67786af0dd36b9`。
- 修复实现：`b52a335a3352697d8429cd2ea6d002b462afad62`；最后审计 phase 修正：`bd89a6ee161bc4eb041646c171a499a5f8048be6`。
- 包 SHA256：`209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d`。
- 当前 freeze 文件 SHA256：`5354ad1dcb046321413c6bb0c76b6c0c76d21f0ace741c2eb5eae0019b3adf41`。
- 三个 profile 的 `verifyFrozen` 在开始、结束均通过，runner 为 `0fa4d9fca61bf721547864ea101d73a933f8ffdf4e67b980b2def58bc64d9b3d`。见本目录 `bindings.json`、`bindings-final.json`；二者及全部冻结文件逐项相同。
- src 相对 `713acbf87bfa87b3d6eb208fb55bdb3b6651fd49` 零 diff；共享 `scripts/live/*`、fixture preload 相对前次审查 HEAD 零 diff。旧 comparison、ready、当前 cmp-fixes 的 public manifest 分别重算 254、239、245 个文件，全部匹配。

读取了提供的 AGENTS、祖先目录规则检查、pstack-models，以及 Prove It Works、Explain the Number、Model the Domain、benchmark-checklist。没有发现额外适用仓库 AGENTS。读取了前 fresh 完整报告与 probes、根的修复前反例/当前回归/最终 scope ledger/preflight/freeze/manifest，并审查当前 comparison diff、回归脚本及 installed Pi 1.5.2 的手动和自动压缩调用链。

独立完成，没有子代理。未改产品、现有 scripts/tests、旧证据；未 commit/push/PR/merge。新增文件仅在 `artifacts/P6-comparison-fixes-independent`。真实 provider 请求、真实 auth/history 访问、有效 real grant 均为 0；授权拒绝测试只使用失效模板。

## Prove It Works：原反例关闭证据

### CMP-1：可信调用范围取代正文猜测

独立 `probes.mjs` 经实际 comparisonFetch → shared guardedFetch → ComparisonLedger 验证：普通正文及 `# Conversation`、`<conversation>`、source-summary 固定句四种正文均完成 1 compact + 5 continuation；未误占 compact 分项。每种正文分别改变 instructions、tools、system/developer 消息，共 12 个不匹配请求，全部在 send 前拒绝。normal 的结构化 compaction_trigger 也在 send 前拒绝。

`host-scope.mjs` 直接调用当前 createSession/loadRuntime，安装并运行既有发布包，使用 installed Pi 1.5.2 实例。所有外层 ledger lane 都故意标为 continuation；没有给真实宿主 fetch 手传 compact stage。

| 实际宿主探针 | 覆盖与本次结果 |
| --- | --- |
| manual | 两模型 × 两臂，4 个真实会话、16 个 fixture dispatch；实际 checkpoint 提交成功 |
| auto threshold | 调用实例 `_runAutoCompaction('threshold', false)`，4 会话、16 dispatch；compaction_end reason 与 checkpoint 均验证 |
| auto overflow | 调用实例 `_runAutoCompaction('overflow', true)`，4 会话、16 dispatch；验证自动重续标志路径中的压缩范围 |
| auto fallback | remote 返回缺失 opaque 的合成结果，实际产品转 native；4 会话、18 dispatch；remote 两次摘要均记 compact |
| 并发异步 | 在实际 SDK onPayload 暂停压缩，再从范围外发普通请求，释放压缩；4 会话、8 dispatch；账本顺序 continuation → compact，没有范围串扰 |

每个非并发会话的压缩之后，再通过真实 ModelRuntime/SDK 编码发送三个含旧关键词的普通 assistant 消息。请求全部记 continuation；stage、operation、phase 一致。onPayload 额外跨异步调度，退出压缩后 operationScope 已为空。这里验证调用范围和编码/账本，不把 fixture 返回的文字当作正常业务质量证明；fixture 自身仍有正文匹配逻辑。

这些自动探针验证实际自动执行方法及共用 default-compaction 边界，不声称重新验证了自动阈值选择策略或全部 TUI。产品接管后包裹的实例方法、内部 remote/native fallback 调用以及普通 SDK 调用都实际执行了。

另复跑根原 scope-preload + compatibility-only：8 fixture dispatch，4 compact + 4 continuation，最后 phase 修正版通过。独立 pure transport 并发探针还让 compact 的 send 保持未返回，同时完成 normal send，核对两行归属与终态。

实际 worker 故障复跑见 `targeted-fault-results.json`：hidden-round 共 56 预约，正式 lane 均为 1 compact + 5 continuation，第六轮被拒绝，8 个失败保留；comparison-no-opaque 共 56 预约，remote 正式 lane 均为 2 compact + 4 continuation，fallback 有效臂变为 native，4 个失败保留。没有退款、补抽或扩大 cap。HTTP 拒绝探针只预约/发送 1 次，记录 compact/HTTP_REJECTED 后全局停止；冻结零重试配置没有发生额外请求。

### CMP-2：完整质量向量约束已进入判定

独立生成五对纯合成输入，通过真实 reportData 验证，不创建 real grant、不运行 real 分支。`probe-results-v2.json` 包含 45 个组合：11 项质量退化分别配较小/相同/较大输入，加上 record、behavior、workspace、capturedFirst 四维缺失的三种输入组合。

- 两侧 strictFail、record 相同但 behavior 6/7 对 0/7：相同输入判 inconclusive，不再判无差异。
- record 的 facts/state/pending/stale，behavior 分数和 error，保护文件、未授权修改、额外文件、sourceChanged、capturedFirst 的退化均实际控制结论。更小输入且质量下降为 tradeoff；维度缺失为 inconclusive-quality-constraint。
- 更大输入且质量更好显示对称 tradeoff。完整同质量的较小输入保留限定的 cell 正向判定；完整相同质量和输入可判“本样本无可测差异”，不称等价。
- PID 差异不改变质量向量。compact/continuation/total 成本逐项断言，数值与失败分母没有被标签修正隐藏。
- `extra-results.json` 的 10 个附加负测覆盖缓存干扰、缺 usage、fallback、未完成、第五对缺失、混合方向、过大变异，以及单个质量字段缺失，均 inconclusive。没有瓶颈和 cache/order 证据时 latency 始终 inconclusive。

根的 3 组现有修复回归也在新目录复跑通过。修复前失败读数来自保留的 `before-probe-results.json` 和前次独立报告，不冒称本次重新执行旧实现。

### N1 / N2

N1：14 个独立 usage 边界用例验证 allowlist 和终态拒绝。未知顶层/嵌套字符串不落公共 ledger；缺 optional 项为 null；cacheRead + cacheWrite 恰好等于 input 可接受，超过则拒绝。缺 required、字符串、负数、小数、不安全整数、显式 null cache、reasoning 超 output、total 不一致都产生 USAGE_UNAUDITABLE，随后新请求在 send 前因全局停止被拒绝。预算 bytes/4 与服务 usage 分开，未把 opaque bytes 当服务 token。

N2：两任务逐 ID 验证 e0..e10 和 e58 存在且早于 e227。实际 e58 是 **Contract amendment**：settlement 改为 tenant+event、first-valid、包含零金额；redirect 改为 308、GET+HEAD、保留 en/fr。与 oracle 最终契约一致。四个 preflight pair 的 boundary 均记录完整 criticalEntries 和 criticalBeforeCut=true；数据未改动。

## 本次与历史范围、负结果

本次还串行复跑 12 组既有安全/评分检查，包括预算预约、失效 real 拒绝、崩溃预约保留、typed scorer、实际业务正负例、OS 沙箱文件/网络/进程拒绝及超时。全部通过；没有因 2.5 秒评分超时放宽配置。

本次 installed 宿主 fixture dispatch 总计 **195**：独立范围探针 74、根 scope 8、两组定向故障 112、HTTP 拒绝 1。这是多个隔离测试的总数，不是新的真实授权方案或模型评测样本。预算安全测试的纯预约数、直接合成 transport 次数另计，不混入这 195 次。

根的完整正常 quality-observation 56 fixture、7 故障组、lint/typecheck 属于提供的历史证据；本次只重跑上述指定部分。根已明确最后单行 phase 修正后只定向重跑 8，没有把较早 56 冒称最后版本全跑。前 fresh 的完整 paired-five 248 fixture / 40 业务、33 进程预算竞争和 worker 崩溃恢复，以及更早 74 tests，均为历史；本次没有重新运行完整 248、TUI 或 perf。

保留本次探针开发失败，未当产品缺陷隐藏：第一次统计断言把 latency 状态名的 analysis 写成 control；第一次 N2 内容断言误写 Contract final，实际为 Contract amendment；一次即时绑定检查手工重复了 freeze hash 子串。修正的是本目录探针预期，产品/阈值/超时未改。初次脚本和日志保留为 `probes-attempt1.mjs`、`probe-results.json`、`probes.log`、`audit-attempt1.mjs`、`audit.log`，即时 hash 误抄记入 `probe-development-notes.json`。所有最终断言通过。**没有新发现需要根修代码。**

## Data 与结论边界

Terra（gpt-6.1-terra）与 Luna（gpt-6-luna）的真实比较仍无数据；不能宣布任何一个模型或压缩臂更好、更快、更省。fixture 的摘要、opaque 与业务输出是预先编写的，统计比较为 null。合成统计反例仅证明报告规则，故障中的业务失败也不能当作真实模型劣势。

未来仅能在冻结的同模型双臂、AB/BA 顺序、reasoning off/none、SSE、零 retry、cap 1000、统一工具编码等约束下解释数据；不能外推到未受约束的生产默认配置。没有未压缩服务输入 baseline，不算压缩百分比；没有实测瓶颈，不作速度新主张。真实 provider 资格、cap/usage 实际支持、真实业务质量与成本、用户视觉及完整 P6 仍 pending。8/56/248 均仍是提案，当前真实活动预算为 0。

## 清理与复跑

`cleanup-final.json`：登记的 126 个 PID 全部退出，按 PID 检查网络/Unix socket 描述符为 0，独立目录 socket 路径为 0。没有启动监听服务，没有停止他人进程。早期同步 discovery/audit/manual 中的 tar/which 等短命命令在 PID instrumentation 之前已同步等待完成；Node 安装与宿主 PID 从 preload 日志回收登记。清理检查器自身也已同步退出。

独立 outer-deny 在 DNS/socket 原生调用之前拒绝 DNS/TCP/UDP 三个 canary；除此之外无网络拒绝事件，也无真实 auth/history 拒绝事件。SDK 运行仍叠加原有 offline networkBoundary；评分子进程保留原有 OS 沙箱。未读取真实身份数据，未访问外网。

复跑入口：`probes.mjs`、`host-scope.mjs`、`run-review.mjs`、`extra-checks.mjs`、`audit.mjs`、`cleanup.mjs`。本次输出保留不可覆盖；重跑时将探针的独立根目录改为新目录，并同步调整拒绝器日志根。任何真实服务测试必须等用户新的、明确的模型/阶段/预算授权，不从本 PASS 或离线 grant 推导授权。

主要证据入口：

- [最终绑定](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/bindings-final.json)
- [独立统计与 usage 反例](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/probe-results-v2.json)
- [真实宿主并发范围](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/host-concurrent/observations.json)
- [实际宿主故障](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/targeted-fault-results.json)
- [统计干扰与零重试](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/extra-results.json)
- [安全矩阵](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/security/security-evidence.json)
- [进程与 socket 清理](/Users/wangxuyang/.t3/worktrees/compact/t3-dd5c9ad9-ae98db4a396c90de/artifacts/P6-comparison-fixes-independent/cleanup-final.json)
