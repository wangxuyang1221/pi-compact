# P1 implementation report

为 pi-compact 交付普通 Pi 扩展的首个可验证单元。用户继续使用原有 launcher、原生压缩 owner 和 SessionManager。本报告只涵盖 P1。

## Verdict

**P1 PASS，待根协调者独立验证。** 14 项单元测试、36 次断言、十个真实 CLI/TUI lane 和性能门槛通过。没有创建 PR、push、merge 或发布。没有真实模型服务请求。

- 验证代码 head 为 `0c4cf9ba90bcdc0cbef9e26b4fb97eb82b378a33`。
- 基线为 `c80aa5d4073056bef02cad30715356610406da9c`。
- 分支为 `t3/implement-p1-pi-compact`。
- Worktree 为 `/Users/wangxuyang/.t3/worktrees/compact/t3-ffc0cc73-3dfcde48e9a1b862`。
- 当前报告随后以独立证据提交保存。该提交只添加审计产物及其 Git 显示属性，验证代码 head 不变。

## Delivered

`src/state.ts` 实现 idle/running/blocked、操作 ID、取消和 generation。`src/pi-adapter` 从普通 loader 的包根获得实际宿主类，保留原生 manual/auto 执行和单次 append。首请求检查包含当前输入，工具检查等待完整批次。

失败屏障覆盖 prompt、steer、followUp、sendUserMessage、post-run、before-settle、直接 continue 和受管理会话的 warming。普通输入、模型变更、扩展发起的 compact 和 reload 不解除 blocked。TUI 原生 /compact 的重试权限只消费一次，失败 hook 不能继承该权限自动重试。Pi 的队列保留，退出后的迟到回调被拒绝。

操作记录使用相邻 sidecar。原生 checkpoint 按真实 entry ID 回读并 fsync。原生写失败不发成功事件，也不放行正常请求。session_compact 与成功 compaction_end 在状态与持久化接受后发布。相同摘要文本不会误选旧 entry。

开发包为 [pi-compact-0.1.0.tgz](package/pi-compact-0.1.0.tgz)，SHA-256 为 `687cb8264d7c84006b292b4366b7019070367cedba65c703705ee783e0a43529`。白名单内容见 [contents.txt](package/contents.txt)。解包后由真实 shim 通过 -e 加载正式入口并完成合成请求，见 [package/result.json](package/result.json)。这不是发布，也不是 P6 的最终安装验收。

## Commands and evidence

完整命令及退出码见 [commands.json](commands.json)，全部为 0。`pnpm install --frozen-lockfile` 使用锁文件。另将 package.json 与锁文件复制到空目录执行独立安装，见 [clean-install.log](clean-install.log)。实际安装 Pi 为 1.5.2，Node 为 v22.22.2。安装 package.json、bundle chunks、关键 source maps 和实现源码的 SHA-256 见 [environment.json](environment.json)。安装来源没有用 reference checkout 的 SHA 替代。

| Lane | 场景 | 结果与证据 |
| --- | --- | --- |
| 1 | 原生手动压缩对照 | PASS，[断言结果](lane-1/verdict.json)，[画面](lane-1/native.png) |
| 2 | 首请求含当前输入 | PASS，[断言结果](lane-2/verdict.json)，[画面](lane-2/first-input.png) |
| 3 | 从真实 JSONL 恢复后输入 | PASS，[断言结果](lane-3/verdict.json)，[画面](lane-3/resume.png) |
| 4 | 三个工具逆序完成 | PASS，[断言结果](lane-4/verdict.json)，[画面](lane-4/tools.png) |
| 5 | 原生 manual/auto 失败与各入口屏障 | PASS，[断言结果](lane-5/verdict.json)，[画面](lane-5/failure.png) |
| 6 | 真实 Escape 取消 | PASS，[断言结果](lane-6/verdict.json)，[画面](lane-6/cancel.png) |
| 7 | 重入、TUI 队列与显式重试 | PASS，[断言结果](lane-7/verdict.json)，[画面](lane-7/reentry.png) |
| 8 | 两个 TUI 与同进程双 session | PASS，[断言结果](lane-8/verdict.json)，[画面](lane-8/isolation.png) |
| 9 | 能力缺失、大输入、写失败、payload 冲突 | PASS，[断言结果](lane-9/verdict.json)，[画面](lane-9/compatibility.png) |
| 10 | 两次 reload、持久恢复与退出 | PASS，[断言结果](lane-10/verdict.json)，[画面](lane-10/reload.png) |

每个 lane 的目录保留 events.jsonl、原始 ANSI、终端截图、会话 JSONL 和 cleanup.json。Lane 1 的 baseline 不加载 pi-compact。Lane 2 以 SessionManager 写入合成旧历史，第一次正常请求前添加 35,200 个字符的新输入。Lane 3 先由真实 CLI 生成并退出，再用另一个 TUI 进程打开 JSONL。单条无法缩减的 40,000 字符输入在 lane 9 单独验证，正常请求为零。

Lane 4 的工具完成顺序为 gamma、beta、alpha，压缩在最后一个工具完成之后开始。完整 call ID 与结果保留在原生日志中。Lane 5 同时覆盖自动失败和手动失败，并验证失败 hook 的 ctx.compact 不获得显式重试资格。Lane 8 另在真实 CLI 进程内创建两个实际 AgentSession，验证一个取消、另一个提交，以及前者 dispose 后后者仍可续跑。

PNG 来自真实 tmux 屏幕文本，字体 Menlo 与背景由渲染器提供。截图等待 TUI 清除压缩中提示。原始 ANSI 保留原生输出。fixture 只提供合成历史、工具工作量、凭据与网络响应，并做计时与观察；未替换 loader、AgentSession、SessionManager、工具编排或 TUI。启动预加载拒绝 sockets，只有明确的 fixture fetch 函数接受 https://fixture.invalid。PI_CODING_AGENT_DIR、临时目录和会话全部隔离，HOME/CODEX_HOME 未重置。

## Performance

同机 baseline/head 交替各 30 次。baseline 只加载相同观测 fixture。固定工作量为 100 次合成历史文本、保留输入和一个短请求，无压缩。每个样本验证正常请求到达 fixture 且 assistant 正常结束，失败数为零。

| 指标 | 实测 | 门槛 |
| --- | --- | --- |
| 未触发的完整请求安全检查新增 p95 | 0.198 ms | ≤10 ms |
| 真实 TUI 可输入启动新增 p95 | 36.95 ms | ≤150 ms |
| fixture 成功至下一次请求最大值，4 个续跑场景 | 5.64 ms | ≤500 ms |

安全检查计时包含 prepareRequest、stream 调用及最终 onPayload 回调，排除模型网络与响应等待。完整原始配对样本见 [samples.json](perf/1794804880117/samples.json)，方法见 [method.json](perf/1794804880117/method.json)，统计及各续跑原样本见 [perf-results.json](perf-results.json)。测量前后校验源码哈希没有变化。

启动包含 tmux 和 30 ms 轮询粒度，不能把新增耗时解释为精确的纯插件初始化时间。独立、不计入样本的 CPU profile 显示主要启动成本在模块编译与 bundle 初始化，见 [profile-summary.json](perf/1794804880117/profile-summary.json)。此处结论是预算通过，不宣称吞吐或真实服务延迟改善。插件没有把这些预算用作网络超时。

## Scope and limits

- 当前使用原生文本摘要和 Pi 原生预算。90% 配置、remote/opaque、migration 和新 divider 留给 P2 至 P5。
- 真实模型服务额度未获新增授权，因此没有真实服务调用。OpenAI Responses SSE fixture 通过，不等于所有 provider、协议和第三方扩展组合已验收。
- Virtual model 与不持久化 session 明确拒绝。显式失败重试当前绑定 TUI /compact，RPC 重试意图未纳入本轮支持证明。
- 受管理会话的 cache warming 被取消并禁用。Lane 5 将原生设置改为 idle 后直接尝试 start，仍无 warm run。
- P1 验证原生 append 抛错及回读一致性。完整 partial-write 恢复、checkpoint 事务、版本化 opaque/replay 属于 P3；P1 不修复损坏的原生 JSONL。
- 同机文件锁用于阻止共享会话写者，不支持跨机器共享文件系统。所有测试使用独立会话文件。
- 运行宿主为 gpt-6-astra/high。遵守唯一实施者要求，没有启动代理。根协调者仍需独立审查、Comment Sicko 和最终 PR 流程，未把自检当作独立审查。

## Cleanup and decision trail

76 份最终 TUI 清理记录覆盖独立 tmux server。所有记录的 Pi 和 pane PID 已退出，TCP listener 检查无输出，任务所属 tmux 进程为零。见 [cleanup-audit.json](cleanup-audit.json)。CPU profile 使用进程退出自动落盘，没有启动 inspector 或网络 server。没有停止无关进程。

[decisions.tsv](decisions.tsv) 为当前 worktree 的追加式记录。前四行时间未实测，后续修正行已明确说明；性能和事件时间来自 runner。没有写协调者 notes/decisions。技能路径及哈希见 [skill-manifest.json](skill-manifest.json)。

Model the Domain 决定单一状态机。Boundary Discipline 将 Pi 私有知识集中到 adapter。Build the Lever 产生可复跑 CLI/TUI runner。Prove It Works 要求实际 shim、真实 TUI、落盘记录和计数断言。Explain the Number 决定交替样本、完整边界计时、独立 profile 与源码冻结检查。提交前执行 deslop，自查仅保留两条解释外部约束的代码注释，没有 any 绕过或 lint 抑制。
