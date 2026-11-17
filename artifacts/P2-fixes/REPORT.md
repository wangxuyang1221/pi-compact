# P2 native 请求边界修复交付

目标是在普通 Pi 1.5.2 扩展中修复低百分比误阻断，以及公开 hook 的实际请求遗漏百分比预算。沿用 native owner 和 session controller。I1、I2 已修复并完成本地自验证。本报告不是独立 clean verdict，仍等待根协调者安排 fresh reviewer。

## 版本与范围

- 分支为 `t3/fix-p2-compaction-boundaries`。
- 产品修复提交为 `1d99fdc0232a7b6be06496b4cca4584296adb33f`，直接父为交付提交 `408293f206eb871f9299b46a7b7105227b9bbb6b`。
- 原 P2 产品提交 `046f56d4654959474335490e1e0635c89d481ebc` 的直接父是 `82c33d45ba7b351c9cefbfa2390d651953c80f31`。原 owner 将 `aff5037` 写为直接父不准确。
- 最终 `src/pi-adapter/session.ts` SHA-256 为 `c0a085fb278ebfa0192c2a62bbccb6e1446117492b77314b0cf136c98ed01894`。`final-source.json` 固定 src、scripts、tests 字节。产品提交后的追加内容仅为验证 runner 和报告。
- 没有实现 P3、P4、P5，没有改变 launcher、provider、认证、Pi 安装或全局配置。没有真实 provider 请求，没有读取真实凭据或用户历史。

## 实现

`NativeProgress` 区分 preparing、started、committed。threshold auto 在原生尚未发出 `compaction_start`、正常返回 false、当前 lease 仍有效时作为 no-work 完成。它只释放本次操作，不发布成功 checkpoint 或完成事件。已开始的失败、取消、写入失败、overflow 失败和 manual retry 无 checkpoint 仍阻断。结束与 explicit retry 沿用 P1 lease、generation fence 和 native finally。

`PolicyBoundary` 记录最近 user、完整工具批次末尾 toolResult 或 context edit 的 entry，以及模型和百分比。同一边界只尝试一次策略压缩。新输入、工具批次、context edit、模型或配置变化可重新触发。pre-input 的 threshold 判断延后到输入准备完成，避免先压缩旧历史、加入当前输入后立即再压缩。原生 overflow 路径保留。

最终预算检查位于 native `transformContext` 之后。公开 context hook 和 forced system prompt 的输出先参与编码消息估算，再决定是否复用原生 auto compaction。压缩后重新投影 checkpoint，替换被压缩且未由 hook 改写的旧消息，保留 hook 新增、修改的消息和最终 system prompt。不重跑 public hook。发送前仍对实际 transport context 做容量检查。

容量错误现在是 `Prepared request exceeds the model input capacity.`。它不再声称没有发生的压缩已经执行。90% 策略、原生 summary reserve、keepRecentTokens 和普通请求输出保留仍独立。原 prepare projection cache 已删除，公开 projection 读取不被替代。

Model the Domain 决定用 native 进度和请求边界表达状态。Prove It Works 决定检查 ordinary loader 的 payload、JSONL checkpoint 和 journal。Explain the Number 决定保留 Enter 之前的计时起点与真实终端输出终点。这些叶子指引已读取。按委派约束直接完成 how、architect、deslop 和 no-comments 自检，没有启动子代理或声称跨模型审查。

## 先复现，再验证

`before/minimal-probes` 和 `before/additional-probes` 是在修改产品前，从独立审查脚本移植运行的失败证据。原脚本断言缺陷行为，退出 0 只证明复现。

I1 的 1% 最小用例有两次摘要、两个 checkpoint、一次正常请求，随后 journal blocked。0.1% 也复现。I2 的 22,000 字符 system prompt 有零摘要、一次 6,465-token 普通 transport。34,000 字符原例有零摘要、零普通请求，并错误显示 after compaction。

最终正式回归位于 `regression-1794814995920/result.json`。11 个用例全部通过。

| 用例 | native 请求 | 正常请求 | checkpoint | 最终状态 |
| --- | ---: | ---: | ---: | --- |
| 1% 与 0.1%，分别含下一条输入 | 1 | 2 | 1 | idle |
| 1% 与 0.1%，分别含完整三工具批次和下一条输入 | 3 | 3 | 3 | idle |
| 50%，公开 system prompt 22,000 字符，含下一条输入 | 1 | 2 | 1 | idle |
| 50%，公开 context hook 增加 22,000 字符，含下一条输入 | 1 | 2 | 1 | idle |
| system 或 context 增加 38,000 字符 | 1 | 0 | 1 | blocked |
| 摘要失败后 explicit retry | 2 | 1 | 1 | idle |
| Escape 取消后 explicit retry | 2 | 1 | 1 | idle |
| seeded history 上修复 corrupt config | 0 | 1 | 0 | idle |

工具用例第一条输入在发送前产生一次摘要，三个工具全部完成后再摘要，后续新输入产生第三次摘要。工具完成顺序是 gamma、beta、alpha。没有从单个工具结果中间触发，没有多余正常请求或无限摘要循环。低百分比的下一条短输入走 native no-work，保持 idle，成功事件数仍等于持久 checkpoint 数。

system prompt 用例首次最终 transport 为 5,547 tokens，仅一条 system message，包含实际 hook marker。它仍高于 5,000 的策略目标，但低于 9,000 的物理输入容量，因此允许继续。before_agent_start 和 context hook 每次对应请求只执行一次。context hook 用例也核对了最终 payload marker。

补充原 34,000 字符案例现在先摘要，再发送容量安全的 8,547-token 请求。见 `capacity-recovery/1794815475006/result.json`。这与不可减少的 38,000 字符案例不同，后者仍暂停并保留旧历史文件字节前缀。

额外真实持久化回归在 `persistence/1794815413713/result.json`。fixture 只在实际 `appendFileSync` 写入 compaction 行时抛错，不替换 compaction、SessionManager 或 controller 方法。第一次失败没有 checkpoint、没有普通请求，journal blocked。恢复磁盘后普通输入仍阻断，只有显式 `/compact` 才恢复。总计两次 native 请求、一次 checkpoint、一次正常续跑。

## 原验收与 P1

- `lint-final.log`、`typecheck-final.log`、`test-final.log` 通过，21/21 tests。
- `live-final.log` 十 lane 全通过。包含精确 9,000 边界、8,999 不触发、restore 项目配置、真实模型切换、manual instructions、DeepSeek 加 fixture Codex 授权不换 provider。
- 超过 60 秒的 lane 在等待期间没有 completion 或普通请求。取消 lane 保留旧历史和项目配置。
- `p1-fixes-final.log` 五组通过。包含 dispose 迟到拒绝、disabled capacity、retry 等待 native finally、跨进程锁和共享 manager 拒绝。
- `p1-scope-final.log` 四侧通过。包含无关 session、公开 context/projection 读取与 dispose/reopen。
- `p1-tools.log`、`p1-failure.log`、`p1-capacity.log` 补跑原 P1 lane 4、5、9，通过工具完整批次、失败 hook、入口屏障、持久化失败和 payload 改写拒绝。这轮在最后的 system-message 重建修正之前运行，不能冒充最终字节重跑；最终字节由新工具、失败、取消、容量和真实磁盘重试回归覆盖。
- 全部使用 installed bundled Pi 1.5.2 shim、ordinary loader、独立 agentDir、synthetic transport 和 fixture-only key。preload 拒绝真实网络与真实 Pi 配置历史。provenance 保存 shim、bundle、source map 与产品源码哈希。

## 最终计时

根据根协调者对独立性能调查的裁定，100ms 只针对测试数据和原生 UI 初始化完成后的配置命令。新 runner 先等待 perf-seed 完成，再通过公开 ready 命令的终端应答确认宿主输入和绘制就绪。ready 同步本身的等待保留在 raw 中，不计作配置命令样本。

主指标使用同一 `hrtime.bigint` 时钟，从 `send-keys Enter` 调用前，到首个包含唯一当前阈值结果的 stdout 写入。保留 Enter IPC、stdin 回调、handler、capture 观察，未把 stdin 回调或 handler 作为用户等待的起点。终端输出不是 OS GPU 绘制或肉眼可见时刻。

最终批次为 `checks/artifacts/P2/perf/1794815106983`。机器负载、逐样本源码哈希和原始 trace 位于该目录。设置与查看各 30 次，两个尺寸各占一半，均通过真实 paste 和 Enter。

| 指标 | n | median ms | p95 ms | 完整范围 ms |
| --- | ---: | ---: | ---: | --- |
| 设置 Enter 到唯一终端结果 | 30 | 36.694 | 41.918 | 19.839–42.257 |
| 查看 Enter 到唯一终端结果 | 30 | 36.695 | 51.939 | 19.761–60.804 |
| 设置 handler，诊断项 | 30 | 0.435 | 0.628 | 0.305–0.667 |
| 查看 handler，诊断项 | 30 | 0.147 | 0.263 | 0.099–0.606 |
| 1,000 消息准入配对新增 | 5 对 | 0.650 | 0.941 | 0.642–0.941 |
| 10,000 消息准入配对新增 | 5 对 | 2.646 | 4.698 | 0.197–4.698 |

准入计时现在包含 awaited prepareRequest、awaited transformContext 和同步 streamFunction 调用，包含投影、设置读取和最终预算估算。它仍不包含后续异步 payload 构造或 provider 请求墙钟时间。每个样本验证一次真实合成正常请求、零摘要和正确 seed 消息量，不是 lazy no-op。相对方是普通原生 Pi，不是上一版 P2，不宣称上述差值是此次修复的加速比例。

新局部增量没有接近 10ms 预算，因此按委派要求停在每尺寸 5 对，没有再跑 30 对进程矩阵。5 对 p95 实际等于最大值，不能外推总体尾部保证。新完成到续跑沿用最终 lane 3、4、9 的 3 个样本，fixture-success 到 normal-request 范围 21.784–40.304ms。未把旧 30 个恢复样本计为新 HEAD 实测。

本任务最初 profile 和 5 对原口径测试保留在 `checks/artifacts/P2/perf/1794814622308`。该轮 startup/config capture p95 673.253ms，pass 为 false，未改写。`perf-final.log` 对应另一次已完成准入样本后的汇总失败，当时 lane 9 仍运行，缺少完成请求，保留全部 raw。最终完整复跑日志为 `perf-final-complete.log`。

已有独立调查中的常态瓶颈是宿主调度、16ms render interval 和绘制。启动期提前输入还包含 fixture 同步写历史与原生初始渲染。本次没有重做冷启动 profile，也没有把历史调查 120+30 样本算作新 HEAD 数据。精确外部来源为 `/Users/wangxuyang/.t3/worktrees/compact/t3-56827879-2a43009f77b3e718/artifacts/P2-perf-investigation/REPORT.md` 与 `runs/1794813345608`。计时事实满足本轮已澄清口径，独立验收权仍在根协调者。

## 包与演示

开发包为 `package/pi-compact-0.1.0.tgz`，SHA-256 为 `4d0cce15c6d6da6d6bc926de83708ae07f3be956c84b25c949ab80ffe2f47524`。ordinary-loader smoke 解包审计 14 个文件，源码与产品一致，配置命令和 9,000 边界通过。manifest 的 packageManager 字段由 pnpm 打包器省略。见 `package-smoke.log` 和 `checks/artifacts/P2/package/audit.json`。这是开发包验证，不替代 P6 安装验收。

全新目录的 40 秒配置/manual 演示位于 `checks/artifacts/P2/review/demo.mp4`。保留 raw ANSI、逐秒文本、PNG 和事件，已查看第 10、32 秒帧。它显示默认 90%、修改为 80%、manual instructions 和成功结果。这些材料是实际 tmux 文本渲染，不是 OS 截图。

## 复跑与清理

从本 worktree 运行以下命令。新回归、配置和磁盘 runner 自动创建唯一目录。固定输出的旧 runner 应复制到新 checks 目录运行，避免覆盖已有材料。

```sh
pnpm lint
pnpm typecheck
pnpm test
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-fixes.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-persistence.mjs
node --import=./scripts/fixture/relative-socket.mjs artifacts/P2-fixes/capacity-recovery.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-config.mjs
```

本次旧 runner 在 `artifacts/P2-fixes/checks` 副本中执行。完整 live 结束后，再执行 perf，避免从活动 lane 读取未完成证据。

```sh
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-live.mjs --pr P2
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p1-fixes.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p1-scope.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p2-perf.mjs --pairs 5
```

`node artifacts/P2-fixes/audit.mjs` 可重审最终来源、结果、包、旧证据完整性和进程。`audit-result.json` 保存本次 PID 清单与直接存活检查，全部任务进程已退出，监听和 socket 均为空。未停止无关任务。`git diff 408293f -- artifacts/P1 artifacts/P2` 为空。原 owner、独立审查目录和 root checkout 仅只读访问。

保留全部失败尝试，包含首次重复摘要、工具下一输入预期计数修正、TUI 换行导致的等待误判、初轮计时失败和活动 lane 汇总失败。没有再次 force-add 巨大 raw。提交内容只含源码、可复跑 runner、必要摘要及来源清单，raw 保留本地供独立审查。

本地 commit 已授权。没有 push、PR、merge、publish 或 watch。未修改用户 gate。fixture 不能证明真实 provider 的摘要质量或所有第三方扩展组合，仍需 fresh reviewer 验证最终交付 HEAD。
