# P3 owner candidate — PASS

目标是让用户继续使用普通 Pi 1.5.2 启动器与现有 provider/auth 配置：兼容的 active Codex 优先远端压缩，成功后持久化完整 opaque 表示并有序续接；明确失败进入完整原生压缩；取消不回退，双失败阻断并保留历史。本候选完成有界 P3，未推进 P4、P5 或真实服务验收。

**结论：owner candidate PASS，等待协调者检查 diff 和 fresh reviewer。** 这不是独立审查放行或最终发布许可。P4 尚未验证，远端能力严格限定于隔离 fixture；普通安装默认继续原生路径。

- 基线：`903bad5cb55d8d30ce25b93af7c588153aa8717d`。
- 产品提交：`68a8d7d4ea66031950665929e07f12e92ea13fc8`；性能修复后的最终产品：`e91932e337aece6f11ec0963ceafc31d108e1ad1`。
- 实际 T3 分支：`t3/p3-remote-compaction-checkpoint`。起始 HEAD 与指定基线一致；没有改动根工作树或其他 worktree。
- 本次使用 Astra high，直接执行已读的 poteto/how 工作流；遵照任务要求未创建子代理、未重新竞争既定架构。

## 产品与边界

`Checkpoint` 是 schemaVersion 1 的 text/opaque 互斥联合，记录活动来源叶、保留边界、覆盖条目及可读投影哈希。opaque 保存全部有序 wire 项，以及 provider、endpoint、protocol、模型、能力与账户的非凭据 SHA-256 标识。OAuth token、refresh token、headers 不写入 checkpoint 或错误日志。

远端路径使用运行中 ModelRuntime 的有效授权和 Pi 自身 Codex 编码器，发送已验证的 `compaction_trigger`。它要求完整 terminal、连续输出索引、流与 terminal 一致、合法项、完整工具配对和可用 usage。成功只经过一次原生 append，没有额外文本摘要。下一 actual provider 请求通过投影中的 checkpoint 来源标记转换，保留全部 wire 项顺序；P2 的 occurrence reconstruction 与最终容量屏障继续生效。

Pi 仍拥有 prepare、hooks、summary、append 与完成通知。单 SessionController 管理 operation/generation/lease，不递归调用 manual compact，不引入另一套调度器。先前接受的 loader 前 metadata、独立 manager/sessionfile 和公开读取边界保持不变；managed warming 仍禁用。

已有 opaque 的原生回退在同一执行操作内重建可读活动分支，应用 context_edit、删除和分支边界。大历史分段调用原生摘要，串接前一段摘要，仅提交最终结果，保存每段 UTF-16 范围、哈希与覆盖条目。缺少来源、无法转换或容量不足时阻断。取消检查原生与 controller signal，不触发 fallback；没有插件 timeout。

opaque 成本采用 `codex-ciphertext-bytes-v1`：完整序列化 UTF-8 字节数加每项 32，与两倍正整数 output_tokens 取较大值，读回时重算，最多 8 MiB。依据是本地 Codex 参考源码的 ciphertext/12 估算及其旧格式可能低估的说明；本策略使用更保守的全字节计费。它仍是估算，**不是服务端 token 上界证明**。未验证表示不会按零计费。P3 只允许 `PI_COMPACT_P3_DEV=fixture-only`、指定 active Codex 能力和精确 `https://fixture.invalid/backend-api` endpoint；P4/P6 必须完成迁移与真实服务证据后才可扩大兼容范围。

## 持久化与真实故障

原生对照实验发现：SessionManager append 抛错会撤销内存条目，却留下半截 JSONL。证据在归档的 `artifacts/P3/partial-baseline/fault.json`。因此只在现有 append 周围加入 pending sidecar，未重写全部 Pi 文件系统。

pending 在 append 前以 fsync/rename/目录 fsync 保存旧字节长度、前缀哈希及预期追加内容。实际读回并 fsync、保存 idle、删除 pending 并同步目录全部成功后，才放行最终 success。失败只回滚与 pending 匹配的后缀，重载 managed projection；如果连恢复也不能写盘，则保持 blocked 与恢复证据。

真实故障覆盖半写、session fsync、idle journal rename、pending 已删除后抛错，以及 append 中 SIGKILL。每种都先建立有效 opaque，再制造失败，检查旧 checkpoint 与原字节前缀，确认失败期间无正常请求；显式重试后才恢复。SIGKILL 重启还实证发现 Pi loader 会给半行补一个换行，恢复仅额外接受这一种精确前缀，不截断无关写入。

这证明了所测本地进程与文件系统故障路径，不宣称任意硬件故障或绕过扩展的并发写入都可恢复。

## 实际验收

最终产品统一运行在 `acceptance-final.log`：25 个场景通过。普通已安装 launcher、loader、AgentSession、SessionManager、工具与 TUI 均真实；只替换网络/模型输出，observer 不修复产品。每个场景保留 events、实际请求、session JSONL、journal、原始终端文本和 cleanup。

| Plan lane | 证据与结果 |
|---|---|
| 1 原生对照 | 同一 8,000 字节历史；native-baseline 与 head 都完成续接。另补 `recall.log` 两侧事实回忆：原生 text summary 与 synthetic opaque token map 都从实际 payload 恢复 database/retry/file/timezone。该 fixture 不证明真实模型摘要质量。 |
| 2 远端成功 | remote 1 / native 0 / normal 1；完整 before-message、compaction、after-message 精确有序续接。 |
| 3 明确失败 | remote 1 / native 1 / normal 1；真实 native prepare、summary、append 完成。 |
| 4 双失败 | remote 1 / native 1 / normal 0；零 checkpoint，历史前缀不变，blocked。 |
| 5 无有效 OAuth | remote 0 / native 1 / normal 1。 |
| 6 半流/坏结构 | 半流与独立 bad-output 均无半 checkpoint，进入原生回退。 |
| 7 连续两次 | remote 2 / native 0；第二次 actual input 使用第一 checkpoint，最终 normal 使用第二 checkpoint。 |
| 8 opaque 后失败 | remote 2 / native 1；原生输入包含可读来源，不含加密内容或显示标签。 |
| 9 键盘取消 | 真实 tmux Escape；remote 1 / native 0 / normal 0；零提交、零成功通知。 |
| 10 写入中 kill | 保存 partial/pending 后重启；恢复旧 checkpoint，blocked 后显式重试才续跑。 |

额外边界通过：默认关闭、returned tool pair、来源编辑/删除、回到 checkpoint 前的分支、90,000 字符历史四段原生摘要、自动 remote、自动 remote 失败后三段原生摘要、三个工具逆序完成后的完整工具批次覆盖，以及上述四种非 kill 磁盘故障。

`audit.json` 从实际文件重新核对：checkpoint 原生 parent/boundary、活动祖先、来源投影哈希、text/opaque 互斥、opaque 预算、返回 wire 与实际请求顺序、success 对应落盘条目、idle journal、原字节前缀、四段实际 native payload 的连续覆盖与哈希。它比较全部已记录运行源码哈希；唯一排除的是从不进入 Pi 的事后 auditor 自身。失败记录也在归档中，不以绿色 runner 代替 payload/bytes 审计。

35 个 unit tests、lint、typecheck 通过。定向回归保留 P1 fixes 5 项、scope/managed public reads 4 项、P2 fixes 11 项、persistence，以及最终产品的 P2 reconstruction 18 项。早期 P1/P2 回归的源码哈希保留原样；最终统一 P3 与 P2 reconstruction/性能绑定修复后产品。未修改配置命令，未重复 490 条 ready-config 验收。

## 性能证据

判定是**满足 P3 本地门槛**，不声称原生摘要与远端压缩速度或质量等价。`perf-final.log` 对应 `perf/1794823347679`，固定 1 MiB 合成来源、零延迟 transport fixture、原生/head 交替各 30 样本，60/60 都实际完成一次提交和下一请求，失败 0；30 次 head 成功额外 native 请求数为 0。

| 指标 | 原生 median / p95 | Head median / p95 | Head 范围 |
|---|---:|---:|---:|
| 本地 summary/协议处理 ms | 9.983 / 14.350 | 13.327 / 21.416 | 11.617–24.357 |
| prepare ms | 0.464 / 0.574 | 0.588 / 0.863 | 0.475–0.890 |
| commit ms | 0.354 / 0.536 | 31.421 / 33.426 | 28.794–34.702 |
| fixture 成功至 actual normal 请求 ms | 5.285 / 7.611 | 57.170 / 70.407 | 52.694–90.150 |
| 整次本地 compaction ms | 21.978 / 29.898 | 48.895 / 62.342 | 44.891–62.449 |
| 进程 peak RSS KiB | 186144 / 186912 | 196992 / 197424 | 196272–197712 |

本地处理计时为 `_runDefaultCompaction` 进入至 awaited result，扣除 fixture fetch 本身；包含产品序列化、来源验证和 stream parsing。prepare、commit 和后续 actual 请求分别计时。启动、fixture 磁盘 seed 和端到端进程墙钟不冒充协议开销。Head 的整个本地区间 p95 已低于新增协议的 50 ms 门槛；恢复 p95 低于 500 ms。

测试机器 10 核，运行开始 load average 4.10/3.39/3.29；两侧交替以减小漂移。单独诊断 profile 不计入 30 样本：commit 热点是 fsync，本地热点含来源 digest 与 Pi provider 编码；inspector 自身约 64 ms 不用于性能结论。Head median 本地处理约占整次 compaction 27%，持久化同步是主要剩余开销。fixture 无真实网络吞吐，不能据此推导服务性能。

额外 P2 无压缩边界检查曾失败：10,000 消息五对样本新增 p95/max 10.386625 ms。根因修复保留原生历史的批量转换，避免新增逐消息转换分配；同负载复测 9.869542 ms，通过。1,000 消息对应 2.412293 ms。这只是五对定向回归，不替代已独立通过的 P2 大矩阵；原失败样本、复测样本均保留。

## 可复跑交付

- `pnpm verify:p3`：十 lane、edge cases 与 faults。`--lane` 可通过 `node scripts/verify-p3.mjs --lane N` 定向。
- `node scripts/p3/recall.mjs`：额外同源事实回忆对照。
- `pnpm verify:perf --pr P3`：固定 30 对；`P3_PAIRS=1 P3_PROFILE=1` 仅诊断。
- `node --import=./scripts/fixture/relative-socket.mjs scripts/p3/package-smoke.mjs`：打包与普通 loader 默认 native/隔离 remote 两条 smoke。
- `node --import=./scripts/fixture/relative-socket.mjs scripts/p3/demo.mjs`：真实终端文本截图与 40 秒演示。
- `node --import=tsx scripts/p3/audit.mjs`：审计本次冻结的 acceptance/perf/recall 文件。`node scripts/p3/archive.mjs` 重建本次证据归档；它使用本次固定回归目录。

最小 dev 包为 `package/pi-compact-0.1.0.tgz`，20 个发布文件，SHA-256：`8f7281b6b7752054d60c3865c61d5acfa209d2836ec386fe9cf8f28bce24a8e4`。`package/audit.json` 逐文件验证与产品一致；pnpm 会移除 packageManager 字段，已按结构核对。没有安装到全局 Pi。

截图是 `review/lane2.png`、`lane3.png`、`lane4.png`，视频是 `review/demo.mp4`（ffprobe 40.000 秒）。它们来自实际 Pi tmux capture-pane 文本渲染，不是操作系统截图；`review/SOURCE.md` 说明来源，归档含逐秒文本、ANSI 与时间戳。UI 保持 Pi 原生，尚未实现 P5。

`evidence.tar.gz` 与 `manifest.json` 保留原始请求、JSONL、journal、source hash、运行记录、失败实验和相关 P1/P2 定向回归。解压到仓库根后可按原路径检查。编译缓存、重复解包目录、可重建的 synthetic auth 文件及重复 PNG 视频帧不归档。当前写入的 archive stdout 和 manifest 本身不进入自身哈希。

归档 SHA-256 为 `eb03941de842fe18636bd60ef16117d26da8c717efc8bbe2d96d5a9fee0da5ea`，14,610,392 字节；`archive-verification.json` 逐一读取 tar 内 5,117 个文件并验证大小及哈希，同时核对 5 个单独交付文件。

## 决策、清理与后续

已应用且本次读取 leaf 的原则：Model the Domain 使 checkpoint 成为互斥类型并保留单 controller；Prove It Works 使验收落到真实 loader/request/bytes；Fix Root Causes 导向部分追加事务、精确 loader 换行恢复与批量转换修复；Sequence Work into Verifiable Units 形成产品、性能修复、证据交付的顺序。no-comments/deslop 为 owner 自审，未新增解释性代码注释或 lint/类型压制，不冒充独立评审。

吞吐检查点：

- [x] 阻塞首步：核对基线/AGENTS、已接受架构与真实安装源码，再实证 partial append。
- [x] 独立工作流：n/a；本任务明确要求有界单 owner，不创建子代理。独立只读检查可批量执行。
- [x] 共享可变状态：真实 fixture 各自隔离 session/agentDir/socket；产品仍由原有 lease 序列化同一 session。
- [x] 最小安全拆分：协议/checkpoint → native owner 接入及恢复 → 实际验收与性能 → 证据；性能样本不与其他本任务重负载验收并跑。

本轮真实 provider 请求为零，未读取真实 auth，未修改已安装 Pi、真实配置或历史。安装 shim/bundle/source map 哈希在首末运行与最终审计一致。早期协议调试有被 preload 拒绝的连接尝试；最终所有验收与性能样本 network-blocked 均为零。没有 push、PR、merge、publish、watch 或浏览器操作。

`cleanup.json` 保存全部已记录任务 PID/socket 的复核与 lsof 输出；无本任务存活进程、无残留 socket、无监听端口。早期 PID 被无关 Chrome 复用的观察单独记录于 `pid-reuse-observation.json`，没有终止该进程。

后续由协调者审 diff 并启动 fresh reviewer。P4 复用 `readableBranch`/`coverage` 完成 provider 切换及移除中间隔离限制；P6 才处理真实服务质量、容量与兼容性。不自行跨阶段。
