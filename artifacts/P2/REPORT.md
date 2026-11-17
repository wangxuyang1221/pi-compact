# P2 百分比原生压缩实现交付

目标是为普通 Pi 1.5.2 扩展提供项目级百分比压缩，同时保留当前 provider、原生切点、P1 单 owner 和失败后显式重试。P2 开发和本地验证完成。根协调者的独立验收、用户截图/录屏审阅和合并 gate 仍未执行。

## 精确版本和范围

- 本地分支为 `t3/implement-pi-compact-p1-p6-1`。
- 父基线为 `82c33d45ba7b351c9cefbfa2390d651953c80f31`，直接父提交为已独立验收的 `aff503792cb9359ab7787cc267c7c080e8557ac3`。没有改 main。
- 产品、测试和 runner 提交为 `046f56d4654959474335490e1e0635c89d481ebc`。后续提交仅保存本报告、证据和清理记录。最终回复给出交付分支精确 HEAD。
- 运行在提交前的工作树完成，所以逐 lane verdict 的 `head` 字段仍是当时父 HEAD `82c33d4`。被执行的是当时未提交的 P2 源码，以 provenance.source、`evidence-audit.json` 和包逐文件审计识别；这些产品字节与 `046f56d4` 一致，不能把父 HEAD 字段当成原 P1 产品运行。
- 工作树为 `/Users/wangxuyang/.t3/worktrees/compact/t3-3d0d9af3-e77d23d073bf7047`。报告内相对路径均基于此工作树。
- 实现 `src/policy.ts`、`src/settings.ts` 和 `tests/policy.test.ts`，在既有 adapter 安装入口注册命令和会话集成。`src/index.ts` 继续通过 `install()` 加载，无需新增入口。
- adapter 增加 session-local settings facade、threshold 判断作用域、单次 prepare 的投影快照。compatibility 增加 `_checkCompaction` 能力检查。保留安装包根导入，未引用另一份 dist 类。
- 增加 P2 live/perf/demo/package/evidence runner，补充 README、P1 adapter 和 P2 文档。只为原 install 测试 mock 增加 `registerCommand`，没有弱化 P1 断言。
- 没有实现 Codex remote、checkpoint schema、migration 或 UI divider，没有改 P5 文件。没有修改 root checkout、安装的 Pi 或用户全局设置。没有 push、PR、merge、publish 或 watch。

## 行为与数据形状

编码前记录见 `DATA-SHAPES.md`。百分比是经边界解析的有限数，默认 90；项目读取结果用 `valid/invalid` 判别联合表示。没有跨 session 的配置缓存或异步写回。

触发 token 为 `ceil(contextWindow * percent / 100)`。原生严格 `>` 判断仅在 threshold 判断作用域内使用 `contextWindow - trigger + 1` 的 reserve 映射。原生压缩 preparation 使用原来的 reserve 和 keepRecentTokens。普通请求另外保留 model.maxTokens 的输出容量，成功后不再把策略阈值当成容量上限。

`/compact-config` 显示百分比、default/project 来源、文件路径、模型窗口和触发 token。`/compact-config threshold 80` 原子替换当前 session cwd 下 `.pi/pi-compact.json`。非法输入保留旧文件；损坏配置显示英文错误并停止正常请求，合法命令可显式修复。不同项目使用不同文件，同一项目的 session 有意共享最新设置。模型变化和恢复后重新读取并计算。

同一次 prepare 中，原生已构建的投影被记录下来。只有 leaf ID 仍一致时才复用，否则重新构建。公开 `buildSessionProjection()` 每次仍调用原生实现，不返回缓存，也不阻止读取。P1 scope 复验覆盖这条边界。

原生物理模型的 prepareRequest 不执行所需首请求阈值检查，因此保留 P1 的补充预检。首条输入纳入判断，工具批次仍由宿主完整完成后进入下一边界。manual `/compact` 保留 custom instructions，和 auto 共用既有 operation、commit confirmation、失败/retry lease。没有添加 extension timeout。

## 本地验收结果

所有 lane 使用实际安装 shim、普通 loader、隔离 agentDir、合成历史、fixture-only 授权和禁止真实网络的 preload。P2 observer 仅作读取、事件订阅、threshold 观测和 ModelRuntime transport 注入，不替换 dispose、append、continuation 或压缩实现。性能 observer 另包裹计时入口，其结果不作为生命周期验证依据。

| Lane | 结果 | 可复查证据 |
| --- | --- | --- |
| 1 | PASS。固定 reserve=2000 的 native 在 8000 不触发、8001 触发；head 在 8999 不触发、9000 触发。 | `lane-1/thresholds.json`，各 baseline/head 子目录 events、session 和 threshold.png |
| 2 | PASS。实际 8999 tokens，零摘要、一次正常请求。 | `lane-2/events.jsonl` 中 budget、threshold-check、transport-context |
| 3 | PASS。实际 9000 tokens，正常请求前恰一次摘要、一个 checkpoint、一次续跑。 | `lane-3/events.jsonl`，`session.jsonl`，`exact.png` |
| 4 | PASS。命令设置 80%，退出后同项目/同 session 重启，显示 8000 并在该处触发。 | `lane-4/configure`、`lane-4/restart`，`config.png` |
| 5 | PASS。端点、负数、NaN、Infinity、非法文本/参数拒绝且旧文件不变；损坏 JSON 给出错误并发零请求，可显式修复。 | `lane-5/raw.ansi`、`invalid-values.png`、`invalid.png`、events |
| 6 | PASS。真实 `/model` 从 10000 切换 20000，百分比不变、token 阈值 9000 变 18000，9000 输入不压缩。 | `lane-6/window.png`、model-select、budget、transport-context |
| 7 | PASS。低占用 1000 tokens 立即 manual，额外指令进入实际摘要 body，零普通请求。 | `lane-7/manual.png`、before-compact、native-request.body |
| 8 | PASS。DeepSeek + 合成 Codex 授权，唯一摘要 model=deepseek-chat，使用 `/chat/completions`。 | `lane-8/deepseek.png`、native-request.body/url |
| 9 | PASS。实际摘要等待超过 62 秒，期间无 completion、无普通请求；释放 fixture 后一次成功、一次续跑。 | `lane-9/events.jsonl`、pending.png、wait.png |
| 10 | PASS。真实 Escape 取消，零正常请求、无成功 checkpoint；旧 JSONL 是结束文件完整字节前缀，80% 配置不变。 | `lane-10/before.jsonl`、after.jsonl、cancel.png、events |

Lane 1 使用相同合成历史前缀的五个逐步增长点，各点在独立 session 中复现。baseline 依靠 fixture 返回的对应 usage 在 response 后原生检查，head 增加请求前检查；二者时点不同。这个表用于核实触发策略，不能推导摘要质量或速度改善。boundary seed 最初预测系统提示，最终 threshold-check 直接记录宿主实际结构化投影，各正常 transport 也记录实际 token/roles。

`live-results.json` 和逐 lane verdict 全部为 PASS。`evidence-audit.json` 独立读取事件、精确 token、62 秒时长、历史字节及 cleanup，再作断言，没有只信任 verdict 字段。

必要回归均通过。

- `pnpm lint`、`pnpm typecheck`、`pnpm test`，21/21。日志为 `lint.log`、`typecheck.log`、`test.log`。
- `pnpm verify:p1-fixes` 五组，`p1-fixes-cache.log`，运行目录 `artifacts/P1-fixes/runs/1794811613415`。使用只注入 ModelRuntime transport 的 regression observer，含 dispose、disabled capacity、retry cleanup、双进程锁和 shared manager。
- `pnpm verify:p1-scope` 四侧，`p1-scope-cache.log`，运行目录 `artifacts/P1-scope/runs/1794811614696`。无关 session、public reads、dispose/reopen 保持原行为。
- 原 P1 live 的 2/3/4/5 lane 追加复验，全部 PASS。见 `p1-input.log`、`p1-resume.log`、`p1-tools.log`、`p1-failure.log` 与 `p1-regressions/`。实际三工具逆序完成，全部结束后才摘要。原测试的持久失败合同保持通过。

## 性能与测量边界

最终入口为 `pnpm verify:perf --pr P2`。固定 1000/10000 条消息、baseline/head 各 30 个样本交替运行，另有 30 次真实 fixture 成功到续跑样本。所有样本零网络违规、零失败，并断言消息数和实际请求数。没有把摘要策略变化或网络等待算成性能改善。

| 度量 | 样本数 | median | p95 | 范围 |
| --- | --- | --- | --- | --- |
| 1000 消息 baseline 本地判断 | 30 | 0.915ms | 1.314ms | 0.793–1.333ms |
| 1000 消息 head 本地判断 | 30 | 2.193ms | 3.718ms | 1.759–4.458ms |
| 1000 消息配对增量 | 30 | 1.266ms | 2.787ms | 0.571–3.309ms |
| 10000 消息 baseline 本地判断 | 30 | 4.066ms | 5.212ms | 2.677–6.506ms |
| 10000 消息 head 本地判断 | 30 | 8.603ms | 12.788ms | 6.914–21.025ms |
| 10000 消息配对增量 | 30 | 4.653ms | 8.547ms | 2.699–16.087ms |
| 配置命令 handler 到 notify 完成 | 60 | 0.605ms | 0.881ms | 0.509–1.410ms |
| fixture 成功到真实续跑请求 | 30 | 20.227ms | 22.327ms | 18.661–27.641ms |

本地预算 PASS，配对增量 p95 ≤10ms、命令处理 p95 ≤100ms、恢复 p95 ≤500ms。最大单样本增量 16.087ms，不能把 p95 判定写成每次都小于 10ms。

另外保存用户键入到实际屏幕更新的 `configTui`。其 median 为 86.457ms，p95 为 672.727ms，范围 48.014–816.700ms，包含宿主渲染、tmux IPC 和轮询。**它没有达到 100ms。** 本报告的配置本地预算只覆盖 command handler 到 notify；如果根协调者把 100ms 定义为完整可见响应，本项仍是未通过的门槛。没有用 handler 数字冒充可见响应。

`perf-results.json` 链接最终 `perf/1794811663908/` 的 method、120 个运行目录、样本和非计分 CPU profile；恢复样本为 `resume-perf/1794811779046/`。profile 显示整个启动/seed 主要受文件写入、模块编译和 GC 影响，计分区域排除了这些阶段。计分区域包括实际 awaited prepareRequest 与同步 stream 调用，包含投影、估算和配置读取，不包含 provider 输出时间。整轮 profile 不能精确归因每个毫秒，本报告只主张该工作负载的预算结果，不主张一般尾延迟改善。

先前一轮 10000 消息配对 p95 增量 19.912ms 失败，保存在 `perf-current.log` 和 `perf/1794811399582/`。由此实现了同一次 prepare 的投影复用，五对探针通过后再完成最终 30 对，不删除失败数据。机器负载和核心数保存在 method.json；同机其他任务不能停止，交替运行使两侧共享噪声。没有外推真实 provider 或全部历史尺寸。

## 开发包与审阅材料

开发包为 `package/pi-compact-0.1.0.tgz`，SHA-256 为 `0f1a71a07e088f14623eb056ef3c9459570cd2c755dce25f4216cc7e343c3561`。

`package/audit.json` 校验 14 个文件。源码/文档与工作树逐字节相同，pnpm 打包 manifest 只省略 packageManager，其他字段语义相同。包不含测试、fixture、凭据或 node_modules。以 installed Pi 普通 `-e` loader 加载解包入口，关闭源码扩展自动加入，真实 TUI 验证配置命令和 9000 边界，一次摘要、一次普通请求、退出 0。见 `package/smoke-current.log` 与 `package/smoke/`。这是 P2 开发包 smoke，不是 P6 最终安装验收。

`review/lane4.png`、`review/lane7.png` 来自实际 TUI 捕获；`review/demo.mp4` 为 40 秒实际交互录屏，包含配置查看、80% 修改和低占用 manual custom instructions。这些图像与视频渲染的是 tmux capture-pane 文本，不是 OS 截图。Menlo 和暗色背景由 renderer 提供。40 帧原始文字、时间戳、原始 ANSI 和 provider 事件保留在 review 下，未伪造 UI。用户尚未审阅。

`raw-runtime-evidence.tar.gz` 保存最终 lane、最终 perf/resume、P1 针对性回归、fixes/scope、包 smoke 和 demo 原始材料，排除编译缓存和 agentDir。解压到独立目录复查；报告中的原始目录仍在本工作树。`archive-contents.txt` 列出所有成员。P1 fixes/scope 在归档中保留其 `artifacts/` 前缀，其他成员相对于 P2。lane 8 另保存了明确标注 fixture-only 的授权副本，证明测试输入包含 Codex 测试授权。

## 决策、偏差与自审

沿用既定 architecture synthesis 和 P2 verifiable unit，未启动架构流程或子代理。Model the Domain 使配置错误成为显式联合分支，Prove It Works 使判断落在真实 loader、JSONL 和 transport 事件；Sequence Work into Verifiable Units 使策略单元、真实边界、完整 lane 和性能分别通过后才交付。benchmark-checklist 和 Explain the Number 促使保留失败样本、区分本地处理和可见响应，并拒绝从整轮 profile 推导速度优势。

首轮探针少算/误算了首次系统提示，低占用 seed 又不足以给原生切点留下可摘要的旧历史；DeepSeek ready 条件也曾写死 fixture-model。修复的是 runner 和 seed，失败记录在 attempts 和对应日志中。一次尝试移除 P1 首请求补充检查被真实边界反证，已恢复；最终只复用已构建且 leaf 不变的投影。

一次 heredoc 经 conda 默认 stdin 没有执行，script 路由未落盘，误运行 P1 入口。本树旧 tracked P1 证据被覆盖后，先完整保留到 `accidental-P1/`，再恢复 Git 基线；最终 `git diff 82c33d4 -- artifacts/P1` 为空。误开的两个性能 runner 被停止，其 TUI 正常退出后移除已无 server 的 socket。没有清理无关进程。另一次早期简单文本替换误用了系统 python3，后续统一使用 apply_patch 或 codex-py312；没有用系统 Python 操作库或运行验证。

`self-review.json` 记录 deslop/no-comments 直接自检。新增注释和 suppressions 为 0，没有删除或恢复既有 loader 约束注释。去除了一个为避开 lint 而引入的 this alias 写法，改用命名 instrumentation 函数。没有运行 Comment Sicko 子代理，符合本任务不再分派的要求。这份自审不替代根协调者的独立审查。

## 限制与清理

只使用合成 OpenAI Responses SSE 和 DeepSeek OpenAI-compatible Chat Completions SSE。没有调用真实服务，没有读取真实用户凭据或历史，没有进行额外远端授权。fixture 不能证明真实服务可靠性、摘要质量、所有 provider 或第三方扩展组合。Pi 仍固定 1.5.2。P1 已接受的 --name 与 SDK runtime attachment 前元数据写入边界不变，调用者仍须使用独立 manager/file。

`cleanup.json` 汇总本阶段原始事件与 cleanup 中 993 个唯一 Pi/pane PID，直接检查全部退出、监听为空、任务 socket 不存在，ps 没有本工作树 Pi/tmux/runner 残留。`manual-stop-cleanup.json` 另记中止的两个 runner 和手工清理的 socket。短命 pnpm、conda、tar、renderer 辅助进程由已完成主命令覆盖，不声称每个辅助 PID 都单独登记。`host-fingerprints.json` 对十 lane 和包 smoke 的安装 CLI、package、source map、bundle 指纹核对一致。

最终可复跑命令。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:live --pr P2
pnpm verify:perf --pr P2
pnpm verify:p1-fixes
pnpm verify:p1-scope
node scripts/p2/demo.mjs
pnpm pack --pack-destination artifacts/P2/package
node scripts/p2/package-smoke.mjs
node scripts/p2/audit-evidence.mjs
```

live runner 会将原 lane 保存到 attempts，再产生新证据。perf runner 使用时间戳目录。demo 和 package smoke 原始 ANSI 采用 append，复跑前保留/移动整个目录可得到单次原始流。原始失败证据和本轮最终证据都保留。合并、发布和真实 provider 验证没有授权，不执行。
