# P1 修复交接

目标是让 pi-compact 的普通扩展接入满足失效实例拒绝、原生单 owner、操作隔离和真实会话所有权，为后续可安装插件及 PR 提供可独立复验的基础。本轮只处理 F1、R1、R2、R3、C1。

结论为 **ISSUES**。F1、R1、R3、C1 通过本地回归。R2 的普通输入竞争和同进程共享 manager 场景通过，但发现 Pi 在加载扩展之前执行 `--name` 写入的真实反例。在不改 launcher 或 Pi 安装的约束下，本扩展无法保护已经发生的写入，因此不宣称 P1 完整放行。

## 提交与范围

- 原候选 SHA 为 `20e1edd956ee224af7c9bdc41d9386b6c036c69e`。进入任务时实际 HEAD 匹配，工作树干净。
- 失败回归提交为 `aa8c42bf24e23dda0bb83de6fc7edb5ff2fe730e`。该提交保留原产品源码，加入可复跑断言。
- 修复及最终被测代码 SHA 为 `9405011b18d4a2887c558e195b6e48713b7c596e`。本报告随后以独立证据提交保存，产品源码不变。
- 分支为 `t3/fix-p1-lifecycle-retry-ownership`。
- Worktree 为 `/Users/wangxuyang/.t3/worktrees/compact/t3-4caa62ef-20ed12fb98efc9e3`。
- 未启动子代理，未改原 owner、根 checkout 或安装的 Pi。未 push、创建 PR、merge、发布或 watch。未开发 P2 至 P6。

## Red 与 green

[证据摘要](evidence-summary.json) 保存请求计数、操作时序、关键 probe、所有 lane 结果和包校验。[源码冻结](freeze.json) 保存产品、脚本、测试、锁文件及实际安装来源哈希。

| 项目 | 原候选实测 | 修复后实测 |
| --- | --- | --- |
| F1 | dispose 后子会话两次正常请求，队列由 1 变 0 | 子会话零请求，队列内容完全相同。活跃父会话一次正常请求。最后实例退出后 registry、dispatcher 和锁释放，旧 continue 仍被拒绝 |
| R1 | 首次失败 hook 未释放时已发送第二次摘要请求。旧 catch 将重试阻断 | 第二次显式 retry 等待原生 hook 和 finally。释放前只有一次摘要请求，释放后完成第二次摘要请求，恰好一个 checkpoint、一次成功通知和一次正常续跑。真实 TUI 不再显示 Compacting context |
| R2 普通启动及输入 | 第二进程没有模型请求，但共享 JSONL 增加 system、user、error assistant | 第二进程启动失败，文件字节及 owner 锁字节不变，零正常和摘要请求。合法 owner 继续请求成功 |
| R2 同一 manager | 嵌入式第二实例未在接入前被拒绝 | SDK bootstrap 被拒绝，文件字节不变，原 owner 正常请求一次 |
| R3 | enabled=false、window=10000、maxTokens=1000、reserve=8000、12000 ASCII 的输入零正常请求并 blocked | 同一输入在 baseline 和 head 都正常请求一次、零压缩、没有 blocked 记录。44000 ASCII 的真实超窗对照零请求且保持 blocked |
| C1 | 有 begin 和无 begin 的 block 保存失败都返回 undefined。无 begin 时重建恢复 idle | 返回明确的保存失败、错误和 recoveryBlocked。覆盖有 begin、无 begin 的内存故障及真实 EISDIR 故障，并覆盖 idle 替换已发生但保存报错的保守结果 |

原候选直接运行新合同的输出包括以下记录。

```text
retry waits for native finally
2 !== 1
```

最终运行输出如下。

```text
{"name":"dispose","pass":true}
{"name":"disabled","pass":true}
{"name":"retry","pass":true}
{"name":"ownership","pass":true}
{"name":"shared","pass":true}
```

原评审机制也已先行原样移植和复现，证据在 [red/probes.log](red/probes.log)、[red/dispose.log](red/dispose.log)、[red/persistence.log](red/persistence.log)。随后使用新合同对原候选源码再次运行，[red/contracts.log](red/contracts.log) 和 [red/shared.log](red/shared.log) 均退出 1。C1 的原候选失败断言在 [red/unit-contracts.log](red/unit-contracts.log)。新回归最终证据位于 [runs/1794807397798](runs/1794807397798/result.json)。大量原始尝试、假配置和包保持 ignored，原有版本化 P1 证据未改。

## 实现与审阅重点

执行租约 `Execution` 独立于 `CompactionState`。原生调用处于异步失败收尾时，blocked 不再意味着可启动第二个 native owner。提交 ID、挂起事件和完成通知归属于该租约，catch、append、event 和 abort 使用对应 operation identity。租约在成功发布 TUI 完成事件之前释放，以保留原生队列恢复。

实例生命周期显式区分 active 和 disposed。dispose 释放原生订阅、事件包装、文件锁和全局 dispatcher，但保留实例的请求和写入守卫。新 observer 只在 ModelRuntime 注入 fixture fetch 并订阅事件，不包装 prepareRequest、agent.streamFunction、continue、compact 或 dispose。相同 observer 在原候选上仍复现 F1，排除了旧 observer 保留安全 wrapper 的假通过。

文件锁提前到 SDK 的 `buildSessionContext` bootstrap，覆盖 session_start 之前的 model/thinking metadata。原生 `_appendEntry` 和 `_rewriteFile` 在写入前检查所有权。绑定目标通过 ordinary loader 的实际扩展路径识别。进程内 adapter 活跃期间，SessionManager 写入口参与统一文件所有权检查。

为了在同一 manager 被再次传给 SDK 时早于 metadata 写入拒绝，已附着 manager 的 `buildSessionContext()` 会拒绝再次调用。读取投影使用 `buildSessionProjection()`。这是一项明确的兼容性限制，第三方扩展若继续调用旧读取入口会收到错误，不能把它隐去。该行为已写入 [adapter 文档](../../docs/p1-adapter.md)。

自动触发继续使用 Pi 原生 enabled 和 reserve 设置。最终请求容量检查使用 contextWindow 与模型输出容量，不再把停用的 reserve policy 当硬容量。C1 的保存状态显式可读，UI 错误说明保存失败和恢复保障是否存在。磁盘无法保存且无先前持久屏障时，仅保证当前实例 fail-closed。没有复制 P3 事务实现。保留了已经核验的 loader 吞异常与启动退出注释。

## R2 的加载前反证

最终候选运行以下命令仍退出 1。

```sh
node scripts/probe-preload-ownership.mjs
```

两个真实进程打开同一 synthetic session。首进程持有真实锁，第二进程使用 `--name synthetic-unowned-name`。第二进程没有模型请求，最终启动失败，锁仍属于第一进程，但文件已增加一条 `session_info`。第一进程之后仍可正常请求。

[最终反证日志](preload-ownership-final.log) 及 [证据摘要](evidence-summary.json) 保存 `unchanged=false`、追加内容和 `lockUnchanged=true`。实际安装 Pi 的 main.js 在 `createSessionManager` 后执行 `appendSessionInfo`，之后才调用 `createAgentSessionServices` 和 resourceLoader.reload。最终实测覆盖了这一先后关系。加载后的扩展没有机会撤销这次未授权写入，且不能通过回滚活跃 owner 文件来假装安全。

需要根协调者处理这个接入边界冲突。完整的“所有启动写入都由插件所有权约束保护”要求需要 Pi 的加载前接入支持或另行批准的 launcher 边界。当前禁止修改这两者，因此此项保留 ISSUES，未擅自改变架构或降低验收条件。

## 验证和包

[commands.json](commands.json) 列出正式命令与退出码。lint、typecheck、19 项测试均通过。原来的 36 次断言仍通过，新增测试未接入原文件的断言计数代理，不能把 36 当全部断言总数。

原十个真实 CLI/TUI lane 全部重新通过，见 [live.log](live.log) 和 [live/live-results.json](live/live-results.json)。所有最终 lane 的 provenance 源码哈希均与冻结版本一致。实现过程中有一次 lane 7 失败，原因是租约释放晚于 TUI flush，已修正并完整重跑；该失败保存在 [live-attempt.log](live-attempt.log)。不沿用先前九个成功结果替代最终十个结果。

复跑命令如下。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:p1-fixes
pnpm verify:live --pr P1 --output artifacts/P1-fixes/review-live
pnpm verify:perf --pr P1 --pairs 5 --output artifacts/P1-fixes/review-perf --lanes artifacts/P1-fixes/review-live
pnpm pack --pack-destination artifacts/P1-fixes/review-package
```

开发包为 [pi-compact-0.1.0.tgz](package/pi-compact-0.1.0.tgz)，SHA-256 为 `b24cda98338a569d941e1f2d80fa86b9d21b6606bf8b7c1c62a8d48b5c164662`。11 个包文件均在产品白名单内，没有 fixture、auth、测试或临时文件。除打包调整的 package.json 外，全部包文件与工作树字节一致。解包后的正式入口通过实际 Pi 1.5.2 shim 加载，managed=true，正常请求一次、退出 0，见 [package/result.json](package/result.json)。这是 P1 开发包 smoke，不是 P6 安装验收或发布。

## 针对性性能检查

本轮修改了普通 admission 和原生持久化入口，故没有仅以“dispose 修复”跳过性能检查。新增写入守卫只做生命周期与所有权查询，正常 append 没有新增 journal fsync。五对交替 baseline/head 的真实 TUI 测量均完成正常请求、零错误、零压缩，逐轮事件保留在本地。

在该固定合成负载下，预算通过。新增请求检查耗时中位数为 0.162 ms，范围 0.148 至 0.181 ms，p95 为 0.181 ms。新增 TUI 可输入启动耗时中位数为 35.03 ms，范围 30.11 至 92.72 ms，p95 为 92.72 ms。四个压缩后续跑场景最大为 5.69 ms。分别低于既定 10 ms、150 ms 和 500 ms 预算。

五样本 p95 是最大值，不用于精细尾延迟判断，也不宣称相对旧候选提速。baseline 是相同 fixture 的无插件 Pi。机器有 10 核，测量前 load 为 1.75、1.34、1.25。独立、不计时的 CPU profile 显示启动主要成本在模块编译和 bundle 初始化。启动测量包含 tmux 和 30 ms readiness 轮询，正常请求检查时间排除网络及模型等待。详见 [perf-results.json](perf-results.json) 和 [五对原始样本](perf/1794807442834/samples.json)。原 30 对证据保留，未无理由再跑 30 对。

## 清理与边界

[cleanup-audit.json](cleanup-audit.json) 确认本轮证据中记录的 152 个 Pi 和 pane PID 均已退出，56 份 TUI 清理记录没有存活进程或监听端口。工作树关联 tmux/Pi 进程为零，lsof 无 TCP listener 输出。两个失败启动残留的 socket 文件已在确认无 server 后删除，见 [socket-cleanup.json](socket-cleanup.json)。这些 PID 不覆盖每个短命 renderer、conda 或 git 辅助进程，未声称完整记录所有 fork。

所有模型响应、session 和凭据均为 synthetic。preload 拒绝 sockets，只允许 fixture.invalid 的本地 fetch 实现。未访问真实服务、凭据或用户历史，未重设 HOME 或 CODEX_HOME。真实 provider、所有第三方扩展组合和跨机器共享文件系统未验证。

Model the Domain 原则使执行租约与实例生命期有明确表示。Fix Root Causes 原则使文件拒绝前移到写入之前，并使原生 finally 参与执行租约。Test Behavior, Not Implementation 原则使回归断言请求、队列、文件字节、事件和真实 TUI。按 bug-fix、control-cli、technical-writing、unslop 和 benchmark-checklist 执行，提交前按 deslop 检查。未执行与用户“禁止子代理”冲突的技能委派步骤。

根协调者可基于上述代码 SHA 派发新的独立复审。请保留 P1 的整体 ISSUES，直到加载前写入冲突有明确且可验证的解决办法。
