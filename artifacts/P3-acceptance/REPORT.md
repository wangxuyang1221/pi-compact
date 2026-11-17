目标是独立判断 P3 修复是否允许 pi-compact 进入 P4。结论为 **PASS，支持 P3 进入 P4**。前次 R1 与 R2 均关闭，本次没有发现新的阻塞缺陷。本结论限定于现有 fixture-only P3 范围，不等于 P4 迁移、P6 真实服务验收或发布许可。

被验 HEAD 为 `714114416a48b9789fd3b674aca8df073ad14352`。产品为 `c5deb375352c4dedac3c1b894e78d637141b4d42`，修复基线为 `05dfe3870131a89df72c3021f6c38a0f49c7690f`。产品源码只有 `src/pi-adapter/session.ts` 改动，31 行增加、11 行删除。产品提交到 HEAD 仅新增报告和证据，产品字节未变化。见 [产品差异](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/product.diff)、[交付范围](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/delivery-scope.txt)。

本人按指定 Astra high 角色独立审查，没有子代理、产品编辑或提交。全部新增证据在本目录。`checks` 是当前源码、脚本、测试和文档的冻结副本，不是另建 worktree。root、前次 reviewer 和 owner 目录只读。实际运行使用已安装 Pi 1.5.2 shim、bundle、普通 extension loader、AgentSession、SessionManager、TUI。网络和模型输出为合成 fixture，预加载器拒绝真实 socket 与真实 Pi 配置读取。

**R1 已关闭，恢复前写入与重试被正确拦截。**

直接复跑前次独立 `crash-probes-v2.mjs` 的三个最小案例。真实 append 半写 70 字节并使 ftruncate 失败，随后普通输入不再污染 pending 后缀。direct 和 blocked-input 在恢复后的第一次显式重试成功，未再出现多做一次 remote 才在 finally 恢复的行为。idle journal rename 后 SIGKILL 的独立对照也成功恢复并重试。见 [最小探针](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/crash-probes-v2.mjs)、[本次结果](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/crash-v2/result.json)、[原始输出](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/original-crash.log)。

本次另外编写独立注入器与观察扩展，直接检查真实磁盘内容、manager 分支、agent 上下文哈希和 transport 请求。9 项顺序场景全部通过。

| 本次独立场景 | 实际结果 |
| --- | --- |
| pending 临时文件 open 失败 | 未追加 checkpoint，旧字节完整，首次恢复重试成功。 |
| pending 临时文件 write 失败 | 同上，未把临时文件误认为已完成的事务。 |
| pending rename 前失败 | 同上，旧 checkpoint 保留。 |
| pending rename 成功后目录 fsync 失败 | 从磁盘 pending 找回记录，恢复旧字节。 |
| finish unlink 已执行，随后 rollback truncate 一直失败 | 内存 record 跨 execution finally 保留，恢复失败时无新摘要、无写入。 |
| finish unlink 已执行，随后重新写 pending 一直失败 | 即使磁盘 pending 不存在，内存 pending 仍冻结写入和重试。解除故障后首次重试成功。 |
| 磁盘已回滚，但 manager.setSessionFile 失败 | 仍保留 pending 状态。重试不会提前请求模型，重载成功后才启动新 operation。 |
| 半行后额外追加无关 suffix | 精确后缀保护拒绝恢复，字节与 pending 保留，remote 无增长。保存损坏样本后，只在该合成 fixture 中撤掉额外注入，再验证正常恢复。 |
| blocked 但没有 pending | 自定义 metadata 仍可写，无关 in-memory manager 仍可工作，写禁令未扩大为全部 blocked 或全局 manager 禁令。 |

见 [独立注入器](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/edge-fault-v2.mjs)、[观察扩展](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/edge-observer.mjs)、[独立驱动](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/edge-cases-v2.mjs)、[9 项完整结果](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/edges-v2/result.json)。观察扩展只记录状态、发起入口调用和注入重载失败，没有替换产品 guards 或代替产品恢复。

持续恢复失败的场景在解除故障前再次显式重试，断言 remote 与 preparation 均零增长。message、assistant error、custom、session metadata、thinking metadata、rewrite、agent.prompt、session.prompt 八个写入口均拒绝，session 字节不变。`/ind-state`、`/compact-config` 及原有 `/p3-restore` 可执行。磁盘恢复后输入普通消息也不会自行解除 pending；首次 `/compact` 才完成恢复并只发送一次新 remote。

首次新 operation 的 `session_before_compact` 观察到的 agent 上下文哈希等于故障前哈希，可读分支等于故障前活动分支去除 compaction 条目。实际 retry payload 使用旧已提交 checkpoint 的完整有序 items，不含失败 operation 的 `SYNTHETIC_OPAQUE_2`。正常续接则使用新成功 checkpoint。11 个原始与独立案例的旧字节前缀、pending hash、实际 replay 与 continuation 已另行审计，见 [逐字节与请求审计](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/runtime-audit.json)。旧 reviewer 损坏样本也直接读回核对，保留了 16,530 字节前缀、70 字节初始半行和 1,180 字节污染后缀，未覆盖旧目录。

静态路径审查与运行结果相符。`appendState` 在 beginAppend 前进入 pending，因此 beginAppend 内 write/rename/fsync 抛错也进入恢复；存在 sidecar 时从磁盘恢复，sidecar 已删除时使用 closure record。成功 finishAppend 后才清除。recoverCheckpoint 只有在恢复及 manager/agent 重载完成后才 ready，异常保持 pending 并 block。显式 retry 在 controller.begin 与新 branch 快照之前恢复。finally 仍执行相同恢复逻辑。

实际 bundle 的 `_appendEntry` 在方法体内才修改 fileEntries/byId/leaf，因此外层 guard 阻止的是写入前状态。原生 prompt 先分发扩展命令，产品只对 agent.prompt 与实际 manager append/rewrite 冻结，未冻结整个 dispatcher。`binding.execution`、settled、operation identity、generation、retry intent 和 disposed 检查未改变。P1 的实际 dispose、retry、ownership 与 scope 回归也通过。见 [安装 bundle 摘录](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/installed/bundle-excerpts.json)、[安装 session 源码](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/installed/agent-session.ts)、[安装 manager 源码](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/installed/session-manager.ts)。没有新增产品注释或 suppressions。

**R2 已关闭，默认 native 小窗口恢复原生行为。**

复跑前次独立 `probes.mjs`，相同 4096 contextWindow、1000 maxTokens、40 keepRecentTokens 和 1,000 字符合成历史。baseline 与 head 各产生 native=1、normal=1、remote=0，均提交一次并继续。独立 split-turn 对照各执行两次 manual compact，native=4、normal=1，保留自定义指令及 previous summary。root 新 runner 的 opaque-small 则保持 blocked，native=0、normal=0、旧 checkpoint 保留。见 [小窗口原始结果](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/probes/result.json)、[split-turn 原始结果](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/native-split/result.json)、[root7 本次日志](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/root-seven.log)。

静态检查确认 4096 分段 reserve 只在 active checkpoint 为 opaque 时计算与应用。普通 native 使用原 preparation 与原摘要路径。opaque 容量不足仍拒绝，没有放宽预算或 suffix 校验。

**本次运行与沿用范围。**

| 本次实际执行 | 结果 |
| --- | --- |
| lint、typecheck | 通过。 |
| unit | 最终 35/35 通过。 |
| root7 | 7/7，包括 fault-active retry、五写入口、输入冻结、restart、kill-idle、小窗两侧和 opaque-small。 |
| 原 P3 persistence faults | 5/5，包括 partial、fsync、idle-rename、commit-unlink 和 append SIGKILL。 |
| 前次独立最小 crash、small、split | crash 3/3，小窗两侧通过，split 两侧通过。 |
| 新增独立顺序故障 | 9/9，详见上表。 |
| P1 fixes | dispose、disabled、retry、ownership、shared 五组通过。 |
| P1 scope | scope 与 managed-read 的 baseline/head 四侧通过。 |
| P2 fixes | 11/11，包括低阈值、工具、system/context 修改与容量、失败/取消重试、corrupt-repair。 |
| 解包普通 loader | 默认 native 与隔离 remote 两侧均成功压缩并续接。 |

日志为 [lint](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/lint.log)、[typecheck](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/typecheck.log)、[unit 最终](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/unit-retry.log)、[prior5](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/prior-five.log)、[P1 fixes](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/p1-fixes.log)、[P1 scope](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/p1-scope.log)、[P2 fixes](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/p2-fixes.log)、[包 smoke](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/package-smoke.log)。[命令执行记录](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/checks-processes.json) 保留初次失败，不将整批初次退出码 1 写作全绿。

前次独立通过的 P3 原 25 协议与边界场景、额外坏流、完整可读切片、late auth/source、同源回忆以及 P2 reconstruction 18 项，本轮沿用，没有机械重跑。理由是本次源码只改变 pending 写入准入、恢复顺序和 native reserve 分支；transaction、protocol parser、checkpoint、budget 与 reconstruction 字节不变。本轮已重跑其直接受影响的 persistence、native、P1 安全和 P2 边界行为。

**性能证据沿用，不声称本 HEAD 有新测量。**

审阅 benchmark-checklist 与 Explain the Number 后，决定沿用前次 `05dfe387` 的限定负载结果。本次正常 prompt/append/rewrite 仅新增会话内 pending 判定，ready 恢复路径立即返回。没有新增正常请求磁盘检查、随历史增长的扫描或协议序列化。成功事务的原有 fsync/rename/unlink 顺序未增加。故障恢复成本不属于原来的正常路径预算。

重新读取前次 40 对数据并计算 nearest-rank p95，10,000 消息增量 p95 为 7.463083 ms，最大 7.612334 ms，仍对应前次每负载 20 对、共 80 requests。P3 原 30 对、60 samples 的先前独立重算结果为 local p95 21.415667 ms、resume p95 70.406666 ms。没有把不同 HEAD、不同批次或本轮功能测试墙钟混入这些数字。见 [沿用决定与来源](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/performance-reuse.json)。

hotpath 指标只覆盖 awaited prepareRequest、awaited transformContext 与同步 streamFunction，不是全部异步编码成本。P3 local 扣除 synthetic fetch 的构造与日志工作，resume 从 fixture success 到 actual normal fetch，不含真实服务时延。前次 profile 中线性遍历/序列化与 fsync 仍解释主要成本，本轮未重新 profile，不声称新增提速或真实服务容量保证。

**包与证据完整性。**

逐项读取 root `evidence.tar.gz`，939 个文件均与 manifest SHA-256 匹配，archive SHA-256 为 `5cd989c91489903f178746917c8eceaa841d319929e53f3e9a031835a4041ad8`。manifest 和 archive 没有包含自身，未发现 stdout 自引用。解压仅进入本目录 `root-archive`。核对 root 最终七项结果的所有产品 source hash 与当前 HEAD 相同。root 汇总数字未直接当作本次通过依据。

实际 tgz 的 20 个发布文件与本 HEAD 相同，package.json 仅按 pnpm 的 packageManager 移除规则做结构比较。在冻结副本重新 `pnpm pack` 得到完全相同 SHA-256 `c2acaed907cc07bcb663602d97d4e286574e4a302584c310cbebdb662e1044f2`。解包后普通 loader 的默认 native 与隔离 remote smoke 均通过。打包之后增加的 root 报告不在发布白名单，产品 docs 的实际包字节已独立匹配。见 [归档与包逐项审计](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/archive-audit.json)、[本次包审计](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/checks/artifacts/P3-fixes/package/audit.json)。

**保留失败、清理与边界。**

初次 unit 的四个失败是冻结副本未创建 artifacts/P1、P2、P3 父目录导致 mkdtemp ENOENT。创建空父目录后原样 35/35 通过，未改测试。独立 edge 注入器初版 config 读取走被自身包装的 openSync，产生递归；保留六项超时与活动第七项记录，确认进程身份后终止无效 runner 和其 tmux。v2 使用原始 open 加 fd 读取配置，9 项重跑通过。首次事后 auditor 把 result.json 当目录，保存失败后仅修正目录过滤并通过。见 [初次 unit](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/unit.log)、[初版 edge](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/edges.log)、[停止无效探针记录](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/cancel-broken-probe.json)、[最终 edge](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/edges-v2.log)、[首次审计错误](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/runtime-audit.log)、[最终审计](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/runtime-audit-retry.log)。这些均未作为产品缺陷或成功案例计数。

最终核对 446 个当前 tracked 文件未变、HEAD 未变，71 个冻结源码/脚本/测试文件与当前源匹配。运行期间记录的已安装 package、CLI、source maps 与 bundle 指纹在最终复核一致。64 份本次运行事件日志均无 network-blocked。283 个登记 PID 全部退出，50 个 socket 不存在，lsof 监听输出为空。停止无效探针时遗留的一个 tmux socket 经确认无 server 后移除，未杀无关或复用 PID。短命 pnpm/conda/render 子进程以已完成父调用、runtime 的进程树和最终进程扫描核对，不声称逐个保存过 starttime。见 [清理与完整性](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/cleanup-and-integrity.json)。root 所记 58 logs、152 PIDs、42 sockets 属于其旧记录，没有冒称本轮启动或逐个复验过它们。

本轮没有真实 provider 请求，没有读取真实 auth/history，没有修改 Pi 安装、全局配置、root 或旧 worktree。没有 push、PR、merge、publish、watch 或浏览器操作。

仍保留已接受边界。P3 remote 仅 fixture-only 环境、精确 endpoint/model 和合成授权；P4 负责 provider 迁移及 late model 快照策略。opaque local estimate 不是服务端 token 上界证明，P6 真实验收仍待新的请求授权。P1 loader 前 metadata、独立 manager/file 与 P2 不可观察的等字节 occurrence 限制未重开。P5 UI 未合入，用户视觉审阅未完成不阻塞本次代码复验。

本轮已读取适用用户指令、pstack 模型映射、poteto-mode、how、no-comments、Model the Domain、Fix Root Causes、Prove It Works、control-cli、unslop、technical-writing、show-me-your-work、benchmark-checklist、Explain the Number，以及 root notes、architecture synthesis、implementation-plan P3、当前和前次完整报告。how/no-comments 按用户限定直接应用，不委派、不删除代码注释。Model the Domain 使审查围绕 session lifetime pending；Fix Root Causes 使检查落在首次写入与新摘要之前；Prove It Works 使 verdict 以真实字节、branch 和请求为准。吞吐检查为只读调查，不适用实现拆分。

决策记录见 [decisions.tsv](/Users/wangxuyang/.t3/worktrees/compact/t3-731da4a2-cdad8a0a84a87ad5/artifacts/P3-fixes-independent/decisions.tsv)。本人完成证据自审，未另开跨模型或跨家族 trail review，遵守本任务禁止子代理的约束。没有用同一人的复读冒充新的独立审查。
