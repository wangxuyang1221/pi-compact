# P6 本地交付

目标是交付可普通安装、可独立审阅的 pi-compact 扩展，让用户回来后能核对安装包和使用证据。Local owner **PASS**。P6 整体 **pending**，仍等待根负责人的 fresh 独立审查、真实 provider 新授权验收和用户视觉 gate。本报告不能作为全项目完成声明。

产品与包冻结于 `713acbf87bfa87b3d6eb208fb55bdb3b6651fd49`。基线为精确 P5 acceptance `143b0b0e7abeb02f5211e2718c29d1c9af09a510`，初始工作树干净。分支为 `p6-local-delivery`。工作目录为 `/Users/wangxuyang/.t3/worktrees/compact/t3-a5e921a8-de93512efb933bec`。后续本地提交只补审计工具、计数修正和交付证据，交付完整 HEAD 以最终回复和 `git rev-parse HEAD` 为准。

## 可安装成果

[安装包](release/pi-compact-0.1.0.tgz) 的 SHA-256 为 `dafa0fdd94b36a2fe3849c5575790e10dfcf577b5a20046807fea6a59cdb20c6`。包有 26 个白名单文件。[manifest](release/manifest.json) 记录每个文件的长度、SHA、产品提交、实际宿主和 CLI 来源。逐文件与源码比对通过。package.json 按 pnpm 删除 packageManager 的规则打包。没有 tests、fixtures、scratch、auth、opaque 会话、node_modules 或审计产物。精确 peer 为 Pi coding-agent/tui 1.5.2，无 runtime dependency，不携带第二份 Pi。Pi 通过 `pi.extensions = ["./src/index.ts"]` 解析资源，不需要额外 exports。

实际宿主是 installed bundled Pi 1.5.2，Node v22.22.2。CLI SHA 为 `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`。manifest 还记录 shim、package、source maps 和 bundle hashes。installedPi 没有修改。

普通安装已经验证。先解包 tgz，再用 `PI_CODING_AGENT_DIR=<隔离目录> pi install /绝对路径/package`，然后普通启动并自动发现。Pi 1.5.2 本地 source 注册目录，不直接解包 tgz。正式入口出现在实际 ready extensions 列表中，不用 `-e` 指向产品。测试 observer 单独通过 `-e` 注入合成 transport 和记录。产品无开发依赖，readFileSync guard 拒绝读取本 worktree 的 src/node_modules，包入口仍能运行。独立 agent、cwd、package、临时目录和合成 auth 均位于本 worktree。[完整运行日志](local-final.log) 和 [raw 自检](audit.json) 可定位实际路径。

[README](../../README.md)、[安装说明](../../docs/install.md)、[兼容矩阵](../../docs/compatibility.md)、[恢复说明](../../docs/recovery.md) 已反映当前实现。默认 90%、项目阈值、手动 compact、无限等待、取消不回退、双失败 blocked 与显式 retry、迁移、持久化、Ctrl+O、禁用和卸载边界均有说明。

## 核心最小修复

本轮核心不再与 P5 字节不变。[core.diff](core.diff) 只涉及 `src/pi-adapter/session.ts` 两行新增或替换。普通安装保留默认 builtins，禁用产品后 `/reload` 会让 ownership scan 对 `builtin:llama.cpp` 调用 realpathSync 并失败。现在只有绝对文件路径参与真实路径身份比较。虚拟 builtin 资源不属于文件入口。失败保留在 [local-errors.log](local-errors.log)，默认 builtin 组合的修复后完整生命周期保留在 local-final raw 中。

早先将此问题归为宿主 reload 缺陷的判断已被证据纠正。另一个 reload 失败来自 observer 模块重新执行后丢失局部 session map。P3/P4/P6 observer 改为进程内稳定 map，不改压缩、持久化、dispose 或 request admission。相关失败日志均保留。禁用或 remove 后旧实例仍可保留安全闭包，不能仅凭 registry.has 判断产品是否还在资源列表。验证按实际加载路径和渲染检查，移除后重启再证明原生运行恢复。

## 十 lane 状态

| Lane | 本轮本地状态 | 真实服务状态及边界 |
| --- | --- | --- |
| 1 同任务原生与 head | PASS fixture。先完成无产品 native，再完成普通安装 head。四类评分均通过 | 真实 native/remote 对照 pending，无优势百分比 |
| 2 tarball 配置 | PASS。普通 install/discovery、重复登记一次、80% 保存，磁盘重启后显示 80% | 不需要真实网络 |
| 3 Codex remote | PASS fixture。实际 encoder、opaque append、兼容续接 | 真实 remote/质量 pending |
| 4 原生摘要 | PASS fixture。与 head 完全相同合成任务和文件 | 真实摘要质量 pending |
| 5 transport | 实际 SDK SSE fixture PASS | 真实 SSE reliability pending；opaque WebSocket unsupported，未启用 |
| 6 长会话 | PASS fixture。12 个完整工具 turn，每 turn 7000 filler，三次 remote，磁盘恢复，随后两次 remote 显式失败走 native，再续接 | 真实长会话 pending，fixture 不证明模型记忆质量 |
| 7 DeepSeek 切换 | PASS fixture。source-to-text 后 active checkpoint 为 text，目标 normal 不含 opaque | 真实迁移 pending |
| 8 失败保护 | PASS fixture。zstd 请求上的网络异常、403 quota、取消、双失败、normal 零新增、显式 retry、原始历史保留 | 没有真实断网/额度探测 |
| 9 生命周期 | PASS。普通重复 install、同版本替换、默认 builtins reload、disable/re-enable、remove、可读会话重启后 native compaction 与续接 | 未来不同版本升级未测，不能等同 schema migration |
| 10 当前插件组合 | 已只读发现路径和包名，settings packages/extensions 为空。默认 host builtins 与包共同加载通过 | pi-openai-fast-mode 只有 config.json，无 executable entry；subagents.zip 不自动加载。未读其内容、未复制配置或凭据。没有已配置的第三方可执行组合可复现，任意第三方组合未测 |

[插件发现记录](plugin-inventory.json) 保存准确范围。只读取 settings 中 packages/extensions 字段和自动发现目录成员名称。没有读取 auth/history 或 secret env。无可执行插件入口不能被写作任意插件兼容 PASS。

local-final 的 network-error/quota 结果中旧 dispatch 字段为 2，未包含更外层的注入请求。raw auditor 加上 p6-injected-error 后均为 3。复跑源码已修正该字段，旧失败/成功原记录未改写。

本地任务包含 sqlite、retry=3、timezone、未完成 idempotency test、ledger.csv 的 A1 pending、12 个事实和 12 个工具结果。raw auditor 从实际 transport recall 重算 30 个字段，每场景四类评分 4/4，文件 SHA 均为 `92e85cfa04eb0188cddc41b1864191c20b0139efaf1bd9da8c89284a2d5bcda9`。fixture 根据输入和持久化的合成 opaque map 返回事实，这只证明控制和数据路径。它不是模型质量评估。

## 测试和性能范围

[lint](lint-final.log)、[typecheck](typecheck-final.log)、[tests](test-final.log) 通过。TS unit/package contract 62/62，dry-run/budget tests 4/4。额外在拒绝 sockets 的 preload 下合跑 66/66 通过，见 [guarded unit](guarded-unit.log)。22 次被拒的 connect 均为 tsx 本地 IPC，调用栈已逐条分类保留，没有放宽网络。最终工具补充后 lint 再通过 [delivery log](lint-delivery.log)。包 contract 真正执行 pnpm pack，验证实际入口、精确 host peer、无 runtime dependency、必备用户文档和禁止内容。

[风险回归](regressions-final.log) 的 10 个 runner 均退出 0，包含 P1 scope/fixes、P2 fixes、P3 recovery/faults、P4 fixes 和 lanes 3/6/10、P5 disposal。[P5 lifecycle](p5-lifecycle-final.log) 和 [direct/symlink](symlink-final.log) 均通过。没有重做已验收核心设计。

`pnpm verify:perf --pr P6` 本轮实际运行成功。[性能总入口](perf-final.log) 指向 raw samples、machine、method、profile 和各阶段输出。没有复用旧数字冒充新测。整包以普通安装运行五对相同任务，native/head 交替，无并行性能任务。每侧每次两次 fixture dispatch，得分 4/4，errors 0。计量输入为实际 encoded body bytes，不冒称 server tokenizer。

整包 native 输入 80,928 bytes，continuation 8,703 bytes。head 对应 81,044 和 8,677 bytes。事件压缩区间减 fixture transport 的 native median 为 9.170 ms，范围 9.053 至 9.294 ms。head median 为 39.049 ms，范围 38.049 至 40.960 ms。命令发出到续接 agent_settled 的 native median 为 86.822 ms，范围 86.317 至 88.197 ms；head median 为 119.031 ms，范围 117.465 至 120.864 ms。该完成时间包括 tmux 和 30 ms 轮询，不是网络或纯插件 CPU 时间，不支持远端速度优势。

阶段预算均重新检查。五对 startup 增量 p95 为 63.448 ms，门槛 150 ms。1000/10000 消息 hotpath 五对增量 p95 为 2.344/6.469 ms，门槛 10 ms。配置每种 30 次，Enter 到 terminal output 的 p95 为 set 40.147 ms、view 39.893 ms，门槛 100 ms。1 MiB protocol 五对 head 本地 p95 为 12.144 ms，门槛 50 ms；fixture 成功到 normal p95 为 51.191 ms，门槛 500 ms。1/10 MiB restore 五对增量 p95 为 8.844/73.069 ms，门槛 200 ms；每种另有十个转换样本，续接 p95 为 33.210/56.374 ms，门槛 500 ms。Renderer 为 20/90/120 cells、5 组、每侧每组1000次交替，预热200对，最大 paired p95 为 0.006959 ms，门槛 2 ms，errors 0，checksum 23,367,500。

测量开始机器为 10 核，load 1.92/1.51/1.29，未停止其他任务。独立非计分 [protocol profile](profile-summary.json) 实际采到 fsync、checkpoint digest 和 provider encoder。head 的主要剩余成本是同步持久化，profile 的 inspector 开销不能算进正式样本。Renderer 独立 profile 采到 updateDisplay、ANSI cell 度量和截断。极小差值按噪声处理。五对是本轮定向预算检查，不替代所有阶段原先的 30 对历史验收。不将任何本地预算变成插件网络 timeout，不从 token 或 cost=0 推订阅费用。

## 真实验收准备

[独立机器计划](live-plan.json)、[无效授权模板](authorization-template.json) 和 [说明](../../docs/live-acceptance.md) 已交付。脚本默认 dry-run，只输出计划，auth/history 读取为零，网络为零。`--execute` 明确 disarmed，在任何凭据读取前拒绝。本轮没有创建有效授权。真实 adapter 的接入和解除锁定仍须独立复核，不能把当前文件称作已经完成真实验收的执行器。

建议新预算最多 12 次实际 dispatch。九次覆盖 native summary+continuation、remote summary+continuation、repeat remote+restore continuation、source-to-text、target native summary、DeepSeek continuation。三次为共享 contingency。总计还受 120,000 estimated input tokens 和 12,000 reserved output tokens 限制。每次 retry、fallback、source conversion 和 continuation 都共享计数。合成账本验证并发预约顺序、发出前持久化、超额拒绝、abort、落盘失败和结构化 redaction。真实 adapter 必须将同一 guard 放在实际 send 前，并禁用 implicit SDK retries。不能以调用高层方法一次来冒称实际只发一次。

凭据将仅在获得新授权后由现有 Pi ModelRuntime 在 dispatch 时解析。dry-run 只描述位置和方式，不打开 auth 文件。不验证真实账号是否有效。缺少凭据由根使用 secret tool。双方使用完全相同任务，先完成 native。任意一侧失败只能报告单侧，不计算 remote 优势。真实结果全部 pending。旧五次授权不能复用。SSE only 和 unsupported WS 保持明确。

## 视觉和可追溯性

[安装](review/installation.png)、[配置](review/configuration.png)、[远端 fixture](review/remote-fixture.png)、[迁移摘要](review/migration-details.png)、[分隔线](review/divider.png) 和 [33.5 秒视频](review/demo.mp4) 来自最终同一 tarball。另有 [自动压缩](review/automatic.png)、[磁盘恢复](review/disk-restore.png)、[取消](review/cancelled.png)、[双失败](review/double-failure.png)、[卸载](review/uninstalled.png)。全部是实际 tmux ANSI cells 经 Menlo16 渲染，不是 OS 截图，不是生成 UI。安装画面实际执行普通 `pi install ... --approve`，授权仅针对本轮隔离项目。

[录制 provenance](review/recording.json) 记录包 SHA、操作、67 帧和 raw 目录。[视觉索引](visuals.json) 绑定最终矩阵的来源 JSON 和 PNG SHA。owner 已使用 view_image 查看安装、配置、恢复、卸载、remote、migration details 和 divider。没有声称用户已认可；P5/P6 用户视觉 gate 均 pending。

[raw 归档](evidence.tar.gz) SHA-256 为 `de0543889d2a62d542629397499709a5ef36e6fa18d099d57f8558d8ebc95bb1`。20,267,562 bytes，3284 个普通成员，逐成员长度和 SHA 复核通过。[成员清单](archive-manifest.json) 和 [receipt](archive-receipt.json) 可独立校验。不包含 auth.json、编译 tmp、node_modules、symlink 或自身 stdout/hash 文件。源码工具在 git，raw 档内绝对路径都属于本 worktree，不引用 root 旧证据作为本轮结果。

## 失败、边界和清理

失败全部保留。local-probe 记录远端容量不足实际走 native，以及捕获已停止 tmux 时的二次错误。local-second 记录 zstd 注入失效和 lifecycle 失败。lifecycle-retry 记录 observer map 丢失。lifecycle-observer-fix 记录不适用的 registry.has 断言。lifecycle-core-fix 记录未重启旧实例就期待完全卸载的错误。各次修正后再验证，不把失败覆盖成 PASS。demo-final 记录 trust prompt 和 recorder timer 退出，demo-retry/最终 clean 记录成功。所有日志和对应 raw 都在归档。

已知 P1 loader 前 --name/SDK metadata、独立 manager/file、cache warming 禁用、opaque local estimate、Pi serializer 截断 >2000 char 工具结果和省略 thinking、未知 schema 拒发等边界保留。P5 review 已确认的坏 active budget/provider 在 footer 读取 usage 时可 startup exit1、normal零请求，仍是已知限制，不冒称友好降级。恢复文档要求保留原文件和 pending/opaque，不支持手工删 metadata 强行启动。普通 UI 能力丢失与坏数据不是同一件事。

[清理记录](cleanup.json) 直接检查本轮 636 个已登记 PID 和 105 个 socket。alive 为空，socket 全部不存在，lsof 无 TCP listener，runtime process scan 为空。包括失败 recorder 的进程和 socket。短命 pnpm、conda、ffmpeg、tar 与 shell helper 已等待结束，没有冒称每个辅助进程都逐 PID 记录。未杀无关进程，未 push/PR/merge/publish/watch、未全局安装、未修改 root/其他 worktree/installedPi。

## 复跑和后续

在本 worktree 根执行。runtime 全部用 synthetic fixture，真实服务不在这些命令里。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:p6
pnpm verify:perf --pr P6
node scripts/p5/run-regressions.mjs
node --import=./scripts/fixture/relative-socket.mjs scripts/verify-p5-lifecycle.mjs lifecycle final-dispose
node scripts/verify-p5-symlink.mjs
node scripts/record-p6-demo.mjs
pnpm acceptance:plan
conda run --no-capture-output -n codex-py312 python scripts/p6/archive.py --verify
node scripts/p6/cleanup.mjs
```

仅从 git checkout 查 raw 时，先 `tar -xzf artifacts/P6/evidence.tar.gz`。旧 receipt 是冻结样本，不会因新跑生成时间戳目录就自动代表新证据。新验收应另存日志并重新选择输入。不要在已有证据上直接运行无参数 archive build。verify 仅核对现有归档，不执行会话或网络。

吞吐检查点有调查、实现、验证、交付四类。调查优先实际安装解析和配置发现。实现用 PackageReceipt、AcceptancePlan、DispatchLedger、LaneResult 划分工具，保持单 worker。验证先普通安装反例，最小修复后全矩阵与风险回归，再独立性能测量。交付先冻结包后录像，再 raw 审计、逐成员归档、清理和本地提交。[工作流](../../scripts/p6/WORKFLOW.md) 和 [append-only 决策记录](../../docs/decisions.tsv) 可复核。

Model the Domain 使预算预约和 lane 结果有明确结构。Prove It Works 使安装以实际发现路径、encoder body 和落盘字节验收。Sequence Work into Verifiable Units 使普通安装反例和最终包分步验证。Explain the Number 使本轮数字带样本、范围和 profile limiter。对应 leaf 本会话已完整读取。how、architect、control-cli、technical-writing、unslop、deslop、no-comments 直接应用，按用户禁止子代理的指令跳过委派部分。

Attention。实现者为 gpt-6.1-sol xhigh。以上均为 local owner 自检，不替代根随后 fresh 独立审查，也没有跨模型 trail review。真实服务与用户 gate 未通过。没有请求用户在本轮批准或等待用户。根应先独立复验本地变更和证据，再决定 PR6 和新真实预算授权。
