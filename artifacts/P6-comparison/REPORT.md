# P6 comparison 离线实现候选

目前没有真实测量证明 Codex 远端压缩优于 Pi native。本交付完成可 review 的独立、默认 disarmed comparison runner；所有运行数据都是明确标注的 fixture 流程证据。模型账号资格、服务是否接受输出 cap、opaque 能力、真实质量、token 开销和等待时间均未知。完整 P6 仍未放行。

## 完成情况

起点为 `0e26b8552d3e0c20fd0da84851e4e2f60447aba3`。实现提交为 **`a75e51502e2c3016039b54930b2f29fd0c5dcf08`**。只有新 comparison 模块及本目录产物；`src` 仍对应 `713acbf87bfa87b3d6eb208fb55bdb3b6651fd49`，`scripts/live/*`、原功能入口及原 grant 校验没有 diff。没有创建 worktree、子代理、真实请求、真实 auth/history 读取、有效 real grant、push、PR 或 merge。

入口是 `scripts/comparison.mjs`，实现位于 `scripts/comparison/`。默认 `plan` 和 `help` 不导入 SDK、不读取认证、不启动 worker、不联网。`real --grant …` 在读取 grant 路径之前拒绝；worker 和 runtime 也各自校验 disarmed 状态。真实 adapter 的冻结校验、只读凭据、SSE transport、持久预算、pilot gate、成对执行、评分及输出路径已备齐，但当前代码不能执行真实服务。后续仍需根协调者完成独立审查和最终明确授权。

复用原 `privateTree`、`restrictedCredentials`、`DurableLedger`、`guardedFetch`、`networkBoundary` 及安装 fixture 预加载器；没有修改或复制一套放宽边界的共享 helper。comparison 的 grant 使用独立字符串 schema，原 Sol/DeepSeek 数字 schema/12 次授权不能复用。`ComparisonLedger` 只增加模型、阶段、lane、compact/continuation 上限和同 grant 死进程锁恢复；预约落盘后才能调用 send，崩溃、失败与 fallback 不退款。

静态模型只允许 `gpt-6.1-terra`、`gpt-6-luna`，provider `openai-codex`，endpoint `https://chatgpt.com/backend-api/codex/responses`。每个配对都在同一模型内比较，不做 Terra remote 对 Luna native，也不自动替换模型。

| Profile | pilot dispatch 上限 | 正式 lane | 总 dispatch 上限 | 预约输出上限 |
| --- | ---: | ---: | ---: | ---: |
| compatibility-only | 8 | 0 | 8 | 8,000 |
| quality-observation | 8 | 8 | 56 | 56,000 |
| paired-five | 8 | 40 | 248 | 248,000 |

这些数值全部是 **PROPOSAL**。公共计划及三个 invalid auth template 的 `activeBudget=0`，`authorized=false`。每条正式 lane 总上限 6，compact（含 fallback/切片）最多 2，续做最多 5，三者同时限制。任何隐藏轮次都经过同一 durable ledger；续做期间触发的隐藏 summary 仍按 compact 计费和限额。HTTP 拒绝、cap 超限和 usage 不可审计会停止整个实验。pilot 不计入质量；任一模型 pilot 不兼容则其正式 lane 标记 ineligible，仍保留在预定分母中，不补抽。

## 真实离线边界与必要修正

本机实际 installed Pi 1.5.2 经普通 `pi install` 安装既有 release 包，由 `DefaultResourceLoader` 正常发现插件；native arm 的 packages 为空，remote arm 绑定安装目录的 `src/index.ts`。压缩与续做实际调用 `AgentSession.compact()` / `prompt()`，运行 installed provider encoder，只有最终 HTTP 使用 fixture。worker 复用原执行器的开发源码同步读取拒绝检查，并通过安装成员 hash 与 loader 路径确认实际使用安装包。

- 保持 native `reserveTokens=16384`、`keepRecentTokens=20000`、enabled=true，无 custom summary instructions、无旧 checkpoint。native 摘要原本由模型生成可读文本，并非纯本地压缩算法。
- [原候选真实切分读数](candidate-boundaries.json)显示：将 v1 assistant 字符串规范化为合法 Pi text block 后，两任务都切在 `e226`，`isSplitTurn=true`。保留原 `P6-comparison-design`；v2 仅给最后一条保留的用户消息追加已完成维护批次 0..16 的事实性索引说明，切分变为 `e227`、`isSplitTurn=false`。业务契约、初始 workspace 和 7/8 个 oracle 用例未改。无真实模型结果参与此修正。[版本记录](dataset-revisions.json)
- 主实验前缀 227 条、保留尾部 185 条；关键任务契约及元数据状态在早段 e0..e10。工具结果均低于 2000 字符，没有利用 native 工具结果截断制造优势。同模型两臂的 raw history、prefix、tail、firstKeptEntryId、system prompt、模型参数及首次续做工具 schema 均有实际 hash 对比 gate。[完整 preflight](preflight.json)
- 共同 reasoning=off；最终编码实际验证为 `reasoning.effort=none`、SSE、无 temperature/service tier、零 retry、`max_output_tokens=1000`。installed Codex encoder 不从 `maxTokens` 生成该 cap，所以实验 adapter 显式注入，并在最终 fetch 边界再次验证；这不证明服务端接受或普遍执行 cap。
- 初次实际工具续做发现 SDK 的 `additional_tools` 不被当前产品 opaque wire validator 接受，不能用无工具 pilot 掩盖。[原始兼容观察](default-tool-encoding-observation.json)保留失败。两臂共同使用 `supportsAdditionalTools=false`、`supportsToolSearch=false`，由真实 SDK 编码相同顶层 function 工具；没有修改产品 validator。
- 两臂都使用真实持久 session 文件，session store 在业务 workspace 外。Pi 实际会把 cwd 编入 developer 消息，因此所有 lane 使用同一个模型可见 workspace 路径；每条 lane 从干净副本开始，完成后将快照移到模型不可访问的独立目录。最终编码的完整 system/developer 消息另有 hash 配对 gate，不能只比较顶层 instructions。随机 session UUID 只用于隔离/路由，不携带 arm；历史 ID 与时间戳相同。

因此可研究的基线是 **Pi 默认压缩策略，在共同 off / 1000-token / SSE / 顶层 function 工具兼容约束下的行为**。不能称为不受限、完全原封不动的 Pi 默认生产配置。其余实现修正见 [记录](implementation-adjustments.json)。

## Prove It Works

| 最终离线验证 | 实际观察 | 证据 |
| --- | --- | --- |
| quality-observation | 4 pilot + 8 正式 lane，56 fixture dispatch；8 条严格任务评分通过 | [run](preflight-run.json)、[ledger](preflight-ledger.json) |
| paired-five | 4 pilot + 40 正式 lane，248 fixture dispatch；40 条严格评分通过 | [run](paired-five-run.json)、[ledger](paired-five-ledger.json) |
| 进程恢复 | 完成后以同 grant 重开，账本仍为 248；没有重跑/退款 | [恢复日志](resume.log) |
| comparison 故障 | cap、缺 usage、HTTP 拒绝、缺 opaque、隐藏续做、正式 remote→native fallback、无效 checkpoint 后补交共 7 类验证通过，均拒绝扩额；保留 assigned/effective arm 与失败分母 | [公共原始读数](fault-evidence.json) |
| 预算与安全 | 12 组验证：8/56/248 完整调度预约、并发、锁、崩溃未发送预约、凭据命令、预存路径、typed scorer、沙箱实际越界 | [原始读数](security-evidence.json)、[日志](security.log) |
| 旧功能回归 | R1/R2 14 项通过，原真实安装宿主 20 故障场景通过；正常功能流程仍为 9 次预约 | [隔离读数](legacy-isolation-evidence.json)、[执行器读数](legacy-executor-evidence.json) |
| 常规检查 | lint、typecheck、62 TS + 12 MJS tests 通过；依赖通过 pnpm offline 安装，下载 0 | [lint](lint.log)、[typecheck](typecheck.log)、[tests](tests.log) |

工具只提供 `record_checkpoint`、`workspace_read/edit/write` 和固定 `run_regression`，没有 bash 或任意命令入口。[schema](tool-schema.json)及 v2 continuation 已同步。首次 checkpoint 的 tool-call 参数在 SDK schema 校验前观察并锁定，拒绝多次提交和同 ID 改写；记录先于 workspace 访问，返回值不包含答案。事实/状态是 typed exact comparison，pending 是集合精确匹配并处罚重复/多余项，错误值同时计 FP/FN，未知 null 不当作命中，旧规则单列。

两任务实际写入 settlement/redirect 模块。评分执行真实 JS 导出函数，以宿主 deep equality 判断 7/8 行为用例，同时校验 102 个保护文件 hash、业务源码改变、无额外文件和越权修改。正样本、stub、错误/旧规则实现和错误类型记录均单独验证；fixture 评分通过不能代替这些 oracle 自洽与反例检查。

模型生成的代码只在评分服务启动的受限子进程中执行：可信 bootstrap 预读源码与测试输入，**不传期望答案**，然后通过 native addon 应用 macOS OS sandbox，最后才以 data module 加载被测代码。禁止文件读取/写入、网络、fork/exec、mach lookup、signal 和相关 IPC；不是 Node vm 沙箱。宿主保存 oracle 和期望值，只给模型 aggregate passed/total。实际探针读取 oracle、合成凭据哨兵、宿主文件、写外部文件、spawn、network 都得到 EPERM，外部模块 import 被拒绝，死循环由固定 2.5 秒上限 SIGKILL。正常纯函数实际执行通过。

边界范围：此候选只支持已冻结的本机 macOS/Node/clang，其他平台 fail closed；`sandbox_init` 是 macOS 已弃用但本机仍可工作的系统接口，未来 OS 需重验。工具路径沿用 privateTree 的范围，不声称防御同一 OS 用户恶意并发替换目录。7/8 用例是本次有限业务契约，不等于生产实现的穷尽证明。评分服务之外，SDK 网络边界激活后无额外进程入口。

## Data

**结论：证据不足，不能证明远端有优势，也不能据此证明远端无效。**

这里的摘要、opaque 数据、tool call 及参考实现均由 HTTP fixture 预先提供。实际 SDK 编码、插件重放、文件变更和沙箱评分是真实执行的；它们不是真实模型的记忆、推理或编程结果。`run.status=passed` 表示测量流程收集完毕，业务是否成功只看 `strictSuccess`；无效 checkpoint 后补交的故障用例即使流程完成，严格成功仍为零。所有 fixture run 的 `statisticalComparison=null`，不会输出优势结论。

真实运行的数据路径已准备：每次请求记录最终编码摘要/hash、预约、send 已调用/响应确认、终态/失败、单调时间，以及服务端原始 usage 的 input/cacheRead/cacheWrite/output/reasoning/total。缺失字段保留 null，output 已含 reasoning，不重复相加；pilot、compact、continuation 分阶段独立汇总。ledger 的 `inputTokens` 仅为 raw 字节/4 的本地预约估计，不是服务端 token，也不能代表 opaque 内部有效上下文。

没有原始未压缩 server input 对照，禁止生成“压缩百分比”。首条续做的服务端 input 仅作可见代理。质量按 model×task 分层、固定 AB/BA 五次配对；raw 失败留在分母、不补抽、fallback 不算 remote opaque 成功；分母直接来自冻结 schedule，即使启动早期中断，未开始的 lane 也保留。预注册质量规则要求至少 4/5 严格成功改进、零反向损失、旧规则率不恶化。可见 input 代理要求完整可比五对、无缓存混淆、≥10% 中位改进、每对同方向且效果超过臂内变化范围；不满足则 inconclusive。没有实测瓶颈及 cache/order 证据时，不给延迟优势结论。quality-observation 只有一次重复，只能观察，不能给五次重复要求的优势判定。

## 冻结、SHA 与复跑

包复用 `P6-isolation-fixes/release/pi-compact-0.1.0.tgz`，26 个安装成员逐 hash 验证。产品和被打包文档均未修改，因此没有覆盖旧包或旧证据。

| 内容 | SHA-256 |
| --- | --- |
| 产品包 | `209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d` |
| comparison runner + 共享 helper 绑定 | `213c29f112647a3b142735850ba852cf7beecef580e03b7996f497ef402df6a7` |
| dataset 绑定 | `85bb0cac0bb00c4f2d8af1aca5665b7993273b5452c7945ed7ae72d1764f0c6a` |
| installed host/source 绑定 | `43fb6fe411aa082dd471bd7ae668583009b5e80e5f98da6cd2d834fc76f625d8` |
| preflight 文件 | `2b88c47666ded9918cf5976caac58c57f0ec2e9456cf2189d36617d24e9fa17d` |
| freeze manifest 文件 | `c217072ca9318427963da8ba9dd1ae4c3b1801fda4607ae0d5796de559fdabd2` |

[freeze manifest](freeze-manifest.json)分别绑定 plan、dataset、scorer、工具 schema、包、installed host（含 agent-core/AI/TUI/MCP/codemode/JITI、Node 与 OS/编译器）、schedule、runner 和边界 preflight。[公共文件清单](public-manifest.json)提供逐文件 hash；真实 auth、私有 session、合成 auth 原文不进入公共归档。

以下全部是离线命令；`--out` 必须选择新的私有目录（恢复才用 `--resume`）：

```sh
node scripts/comparison.mjs
node scripts/comparison.mjs help
node scripts/comparison/candidate-preflight.mjs
node scripts/comparison/verify.mjs scratch/comparison/review-security
node scripts/comparison.mjs offline --profile quality-observation --out scratch/comparison/review-quality
node scripts/comparison.mjs offline --profile paired-five --out scratch/comparison/review-paired
node scripts/comparison.mjs offline --profile paired-five --out scratch/comparison/review-paired --resume
node scripts/comparison/verify-runs.mjs scratch/comparison/review-faults
node scripts/verify-p6-isolation.mjs artifacts/P6-isolation-fixes/release/pi-compact-0.1.0.tgz
node scripts/verify-live-executor.mjs artifacts/P6-isolation-fixes/release/pi-compact-0.1.0.tgz
pnpm lint
pnpm typecheck
pnpm test
```

验证脚本把新读数写到指定 scratch 目录，candidate-preflight 默认只打印；显式 collect/freeze 是归档维护操作。复跑数据不应覆盖本次归档；需要新 freeze 时先保留版本并重新 review。所有登记 worker、评分服务和受限模块进程均已退出，监听端口及跟踪 socket 为零，见 [清理清单](cleanup.json)。尚待 fresh 独立 review、根协调者最终明确授权、真实服务验证和用户视觉验收；本候选不代表完整 P6 或整个开发任务完成。
