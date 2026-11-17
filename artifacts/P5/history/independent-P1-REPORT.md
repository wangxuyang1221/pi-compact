# P5 提前开发候选独立审查

本次审查判断 P1 上的完成分隔线候选是否满足显示隔离、真实生命周期和开发验证要求。结论为 **ISSUES**。发现一个已在实际 Pi CLI 复现的加载路径缺陷。正常路径上的开发场景通过，但该候选尚不能取得独立 PASS。

审查 HEAD 为 `0cbcdc8895171e8eaef1193d2107e26ce35ae869`，基线为已验收 P1 `82c33d45ba7b351c9cefbfa2390d651953c80f31`。工作目录为 `/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef`。未修改产品、原测试或原 runner，未提交、push、创建 PR、merge、watch 或发布。

## 阻塞开发候选 PASS 的问题

**中等严重度。通过 symlink 加载扩展时，renderer 静默失效。**

[renderer.ts:80](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/src/pi-adapter/renderer.ts:80) 直接比较 `extension.resolvedPath` 与 `entrypoints`。后者在第 130 行通过 `realpathSync` 登记。Pi loader 的 `resolvedPath` 保留 symlink 路径，两者不相等。P1 的 [session.ts:340](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/src/pi-adapter/session.ts:340) 会先对 loader 路径做 `realpathSync`，所以同一会话的安全接管正常。

复现使用 installed Pi 1.5.2 的普通 `-e` loader。在本次证据目录创建 `alias/src`，指向当前产品 `src`，从 `alias/src/index.ts` 加载产品，然后执行 `/compact`。全程使用 synthetic fixture、隔离 agentDir 和原有拒绝外网 preload。可用以下命令在当前 worktree 生成新的复现目录。

```sh
node artifacts/P5-independent-development/probe.mjs symlink
```

实际结果为 `managed=true`、一次摘要请求、一个成功 compaction entry，但屏幕显示 `[compaction]` 和 `Compacted from`，没有 `Context compacted`，也没有 `visual downgrade` 提示。普通真实路径的对照场景显示分隔线。问题影响通过 symlink 安装或开发链接加载扩展的用户，不是压缩请求失败或持久化损坏。

证据见 [results.json](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813137949/results.json)、[原始事件](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813137949/symlink/events.jsonl)、[实际图像](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813137949/symlink/actual.png) 和 [session.jsonl](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813137949/symlink/session.jsonl)。修复需使 renderer 的路径身份判定与 P1 一致，并保留真实 symlink loader 回归。本轮没有实施修复。

## 源码和生命周期结论

已阅读完整产品 diff、新增测试、runner 和 P5 合同。`src/index.ts` 仅新增 import 与安装调用。`session.ts`、state、journal、compatibility、原 P1 测试和 fixture runner 与基线逐字节对应。未发现修改 owner、模型请求准入或持久化的产品改动。`pi-coding-agent` 与 `pi-tui` 的 peer 和开发依赖均精确固定为 `1.5.2`。

运行中的组件来自普通 Pi loader 提供的根包类。适配在原生 `addMessageToChat` 返回后筛选该类实例，仅处理 `compactionSummary`。展开调用保存的原 render。颜色段重置和终端 cell 截断的单测通过。公开注册的第三方消息 renderer 在实际 TUI 中保留。缺少 UI 组件能力的包副本会显示明确降级提示，仍能压缩并继续正常请求。类身份不符的故障注入单测也保留原生卡片。后两项是故障注入，不能说明 installed Pi 存在兼容故障。

独立探针补足了现有测试未覆盖的交互。

| 场景 | 实际结果 |
| --- | --- |
| 最后一个 renderer binding 释放后重新启用 | 实际 disable/reload 后 registry 消失；重新加入 loader 输入并 reload 后恢复一个 divider。 |
| 两个 managed SDK 会话和一个 unmanaged SDK 会话并存 | managed 组件显示 divider，unmanaged 保留原生卡片。关闭 A 后 A 恢复原生，B 仍显示 divider，B binding 保留。 |
| 第三方后来包装组件 render 和 `addMessageToChat` 原型 | disable 后保留第三方函数身份及其输出。再次启用和禁用不删除第三方包装。 |
| 第三方继续持有旧 render 闭包 | disable 后旧组件不再显示 divider；重新启用新 registry 也不会激活旧组件，第三方 marker 仍存在。 |
| 真实 SDK dispose 两次 | binding 与文件锁释放。未以 observer 替换 dispose。 |
| dispose 后真实 `agent.continue()` | 抛出 `Session is disposed`，队列前后相同，普通请求数为零。未替换 continue。 |
| 重新启用后最后一个会话直接 dispose | UI 和 safety registry 均释放，dispose 原型恢复原身份，addMessage 原型恢复到第三方函数，当前 divider 失活。 |
| 原生 session_shutdown、reload 两次和退出 | development runner 通过，禁用恢复原生卡片；直接 disposal runner 证明最后释放两个 registry、原型与锁。 |

这些检查没有把手动触发 mock shutdown 当作真实生命周期。多会话探针使用真实 `createAgentSession`、`bindExtensions` 和 `dispose`。子会话组件检查使用最小容器调用真实宿主 `addMessageToChat`，并未启动第二个完整 TUI。主会话的 reload、禁用、重新启用和第三方链使用实际交互式 CLI。

证据见 [生命周期事件](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813137949/lifecycle/events.jsonl)、[重新启用后的最终直接 dispose](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813258281/results.json) 和 [原直接 disposal 事件](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-development/disposal/1794813060570/events.jsonl)。

## 独立运行和原始证据

`pnpm lint`、`pnpm typecheck` 和 `pnpm test` 均退出 0，38/38 tests 通过。另在拒绝网络 preload 下重新运行同一 `pnpm test`，仍为 38/38。[lint.log](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/lint.log)、[typecheck.log](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/typecheck.log)、[guarded test.log](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/guarded-unit/test.log)。

独立完成一次 `pnpm verify:p5-development`，结果位于 [1794812713057](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-development/runs/1794812713057/result.json)。重新解析事件与 session JSONL 得到以下结果。

| 场景 | 摘要请求 | 普通请求 | 成功事件 | compaction entry |
| --- | ---: | ---: | ---: | ---: |
| 原生卡片对照 | 1 | 0 | 1 | 1 |
| 手动，含自定义 instructions | 1 | 0 | 1 | 1 |
| 自动压缩并续跑 | 1 | 1 | 1 | 1 |
| 摘要失败 | 1 | 0 | 0 | 0 |
| Escape 取消 | 1 | 0 | 0 | 0 |

手动场景的 instructions marker 到达 transport。Ctrl+O 前后 session JSONL 字节相等由实际 runner 断言，期间没有新增请求。独立 scope 检查复用了未改的 P1 observer，baseline 与 head 各 8 项通过，各只有两次 synthetic 普通请求；unmanaged 会话未取得 owner 或文件锁。未重跑无关 P1 大矩阵。

`pnpm verify:p5-package` 和原直接 disposal runner 均通过。新包有 14 个预期文件，SHA-256 为 `4c38ad6a6030f8112ac90cd353671b209b4032bad1343ed604854ee06f1b6d7d`。包内七个产品源码与当前 HEAD 相同，普通 `-e` 从解包路径加载。package smoke 为一次摘要、一个 checkpoint；能力降级副本另有一次正常续跑请求。见 [包审计](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-development/package/1794813061361/audit.json)。

[audit.json](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/audit.json) 保存七个源码 SHA-256、独立解析结果、包校验、生命周期记录和清理结果。它将本轮所有来源、上游最终视觉 run、上游性能 run 和 owner 当前源码逐项对照，全部匹配。当前 installed bundled CLI 指纹也匹配。审计不依赖 runner 的 PASS 字段。

## 实际视觉检查

已实际查看认可原型，以及本轮 dark、light、20/40/120 列、expanded、automatic、failure、cancel、reload、disabled、coexist 图像。正常路径的固定文案、细线居中、低对比前景、无背景卡片均符合原型。20 列完整保留文案，40 与 120 列调整线长，未发现下一行被破坏。Ctrl+O 展示真实 `Synthetic native summary.`，折叠恢复分隔线。自动续跑只显示一条 divider，失败和取消没有成功提示。

主题颜色随宿主变化，原生 chat 留白、Ctrl+O 状态文字和隔离 tmux 的 extended-keys warning 不构成本次新增产品缺陷。未以个人偏好扩大 UI 范围。symlink 路径下原生紫色卡片重新出现，是本次有实质影响的差异。

这些 PNG 来自实际 tmux ANSI cell 捕获，经 pyte 和 Menlo 16 渲染。画布默认背景由转换器设置，文件不是操作系统窗口截图，也不证明字体在所有终端中完全相同。本次没有重新制作视频。

## 性能证据及计时口径

没有重跑性能矩阵或 CPU profile，也未读取、修改或轮询 P2 调查。按 benchmark-checklist 审计已有脚本、30 组 raw 样本和独立 profile。逐项重新计算每组 1,000 对样本的统计量与 paired delta，结果与报告一致；checksum 为 23,367,500，错误为零。两侧独立 p95 差值和 paired p95 均满足 2 ms 预算。原始数据 SHA-256 为 `437527e7bd28910ecb53fe7ae7ae9facc27f0a367fb2464e36410cddc9913c16`。

计时包括同步 render，resize 还包括 invalidate。断言、消费输出、日志、PNG 和 profile 不在微计时区间。脚本每个宽度与操作预热 200 对，然后测五组，并非每组重新预热。工作主要是 ANSI 度量、截断和原生布局，profile 中这些函数确实执行；profile 也含区间外断言，因此不能直接把 profile 总占比当作被测组件内部占比。负 delta 不支持整体加速或用户可感知改善的结论。

首帧计时有一个小的口径偏差。[observer.ts:42](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/scripts/p5/observer.ts:42) 先同步写 `compaction_end` 日志，再保存 `successAt`。因此原报告的 5.451166、32.659083、3.375959 ms 从日志写入后开始，不是从 subscriber 进入时开始。原始两条日志的时间差分别为 5.567166、32.804875、3.446584 ms。后者还含写返回后的少量取时和记录开销，不能当成精确纠正值，但均小于 100 ms。

对此只执行了一次最小实际 Pi 探针。在先注册的 subscriber 中立即取时，在真实 `terminal.write` 返回后、任何探针日志写入前取结束时间，得到 4.236375 ms；同次原 observer 记录 4.148500 ms。两套 observer 嵌套也引入少量记录开销，所以该结果只确认起点差异，不用于替代原样本或建立分布。见 [timing 证据](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/probes/1794813299967/results.json)。

现有证据支持本地微开销预算和三次本地首帧观测。它不支持尾延迟保证、物理屏幕可见时间或一般性能加速。最终验收应准确注明计时起点，或将起点移到事件 callback 开始处。本轮未修改原 observer。

## 注释、隔离、清理和待完成事项

no-comments 直接检查新增 TS、MJS、Python 文件，新增注释和 lint/TypeScript suppressions 均为零。未删除注释、未修改代码，修复与架构步骤不适用。未调用子代理。使用 Prove It Works 的具体选择是复用真实 CLI 并独立解析 JSONL、校验源码与函数身份；control-cli 的具体选择是复用仓库隔离 tmux harness，而不是用 mock 生命周期替代宿主行为。

实际 CLI 与 SDK 模型请求全部为 synthetic fixture。所有运行使用隔离 agentDir。live/package/probe 中 `network-blocked` 为零。额外的 guarded unit run 有三次 tsx 子进程尝试连接本地父进程 IPC，被同一个拒绝 socket 的 preload 阻止；调用栈均在 tsx `connectToServer`。测试仍通过，没有放宽 preload。这三次不能误报为零，也不是 provider 请求。第一次独立审计因把所有 blocked 事件都当作异常而失败，保留 [audit.log](/Users/wangxuyang/.t3/worktrees/compact/t3-48fc6757-52d383aa396c31ef/artifacts/P5-independent-development/audit.log)；核实调用栈后，最终审计显式记录它们并通过。

直接检查 36 个已登记 PID，全部不存在。11 份 tmux cleanup 均无存活进程、监听或 socket。lsof 检查无监听，当前 worktree 根目录和独立证据目录无残留 socket，ps 无本任务 Pi/tmux/runner。短命 pnpm、conda、Python、tar 和审计命令已返回；这些辅助进程未全部逐 PID 登记。未停止无关进程。原 owner 与 root 仅只读，唯一产品环境变动是当前 worktree 的必要 pnpm 依赖安装。原 runner 仅创建新的时间戳证据目录。

远端 checkpoint 可读详情、fallback、P4 整合后的全部十 lane、组合 HEAD 的最终独立验收及用户视觉审阅仍为 pending。本次不要求用户立即审阅，也不替代这些最终门槛。

Attention。审查者为 `gpt-6-astra / high`。本报告是独立候选审查，未再次委派跨模型复核，遵守本轮禁止子代理的限制。当前必须处理 symlink 加载缺陷，首帧起点口径需在后续证据中纠正。
