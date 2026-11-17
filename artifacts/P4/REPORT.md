# P4 迁移、兼容性与恢复候选

结论：**owner PASS 候选，等待根代理 fresh 独立验收**。普通 Pi 1.5.2 启动器、loader、SessionManager、provider encoder、工具与 TUI 上的 fixture 验证通过。真实服务请求为零；本报告不代表 P6 的真实 SSE/WebSocket 或摘要质量验收。

## 版本与边界

- Product SHA：`29817079a53a8fc92535b069a4b90c3fcb84bb64`；stable patch-id：`c9b0e055bfb1a17435838672d45987f8c7357c9a`。
- 分支：`t3/p4-migration-compatibility`。
- Worktree：`/Users/wangxuyang/.t3/worktrees/compact/t3-9e593481-75cd610a8c552e84`。
- 父分支：`feat/p3-remote-checkpoints`；基线及 merge-base：`b3a4d6e7ba2f5569730fbc199b361d785d19e9e1`。
- 继承的 P3 独立接受点：`714114416a48b9789fd3b674aca8df073ad14352`。其后基线提交只有接受文档。
- Product commit 包含产品、文档、tests 和 runners。后续提交仅保存本报告和证据；最终交付 SHA 在交付回复中提供，也可用 `git rev-parse HEAD` 获取。每个正式场景和性能样本记录产品文件 SHA-256，审计与 product commit 内容一致。
- 没有创建子代理，没有合入 P5，没有 push、PR、merge、publish 或 watch。root、其他 worktree、Pi 安装、真实配置与凭据历史均未修改。

## 实现结果

`src/migration.ts` 定义迁移意图、源 checkpoint、目标 selection epoch、同账户 source reader 和失效结果。会话继续复用单一 controller、native compaction owner 及 P3 durable append。请求准备、context transform、最终 payload 和提交共同检查活动分支、模型选择和操作 lease。

兼容性包含 schema、provider、规范化 endpoint、protocol、account hash 和 encoder capability。模型 ID 保留为来源记录；同能力 Codex 可直接续接。实际 Pi 的跨模型 transformer 会去除不同 model tag 的 signature，因此只在能力检查通过后修改暂态 replay tag；最终实际 body 仍必须完整、有序地包含原 checkpoint wire。

不兼容目标先用原 Codex 模型、原账户读取 opaque，再通过原生路径合并新历史；源不可用则恢复有效原历史。context_edit 和删除会影响重建，不复活被删事实。缺原始来源不能伪造摘要。分段带 previous-summary、覆盖 ID 和哈希，只提交最后一个 text checkpoint。取消、失败、过期选择或源账户变化保留旧 checkpoint，并阻断目标 normal request。

模型在 public `before_provider_request` 中迟到变化时，本实现拒绝旧请求，不把已经编码的旧请求重定向到新模型。迁移中连续切换后先阻断，显式 `/compact` 只为最终选择重试。旧 generation 的 stream 不能借新 operation 获得提交权限。payload 是最后的本地验证边界；发出后的请求无法被随后发生的选择变化撤回。

P3 pending append 的会话级写入冻结、精确 suffix、recover+reload-before-begin、内存 recovery record、rollback/reload 失败阻断全部保留。4096 window 的普通原生压缩仍可用。没有新增 compaction timeout 或 P5 UI；演示中的压缩展示为 Pi 原生界面。

## 冻结后的验证

正式矩阵：`runs/1794828744945/result.json`；边界矩阵：`edges/1794828768942/result.json`。`evidence-audit.json` 对原始请求、source coverage、checkpoint 和事件执行额外断言。

| Lane | 观察到的行为 | 结果 |
|---|---|---|
| 1 | 原生文本对照与 head 迁移后均保留四个任务事实 | 2 侧通过 |
| 2 | Codex→DeepSeek：同账户 source 读取一次；目标仅 text+recent | 通过 |
| 3 | gpt-6-astra→gpt-6.1-sol：remote 后直接 normal，native/source 均为 0 | 通过 |
| 4 | 新 Codex 账户不接收旧 opaque；有效历史重建为文本 | 通过 |
| 5 | 原授权缺失时 source 请求为 0；完整 raw history 恢复 | 通过 |
| 6 | 93,619 UTF-16 单元的有效历史分四段覆盖；41 个来源 entry、12 对工具消息；所有分布事实进入目标 | 通过 |
| 7 | 真实 tmux 键盘 Escape；旧 checkpoint 保留，目标 normal 为 0 | 通过 |
| 8 | 源转换等待期间两次换模型；旧结果无提交；显式重试仅最终 deepseek-reasoner 提交 | 通过 |
| 9 | A/B 独立 remote checkpoint，A→B→A 各自使用原 wire | 通过 |
| 10 | 退出、磁盘恢复；首请求完成兼容性检查与文本转换 | 通过 |

13 个额外场景：late model、late auth、late source、context edit、delete、source failure、两条摘要路径都失败、迁移中 source 变化、迁移中 auth 变化、活动未知 schema、非活动未知 schema、缺失祖先、真实工具执行。全部通过。未知活动 schema 在 normal 之前拒绝；非活动坏 schema 不阻断正常分支。缺失祖先案例的 Pi print 进程退出码为 0，但明确错误且 normal/source 均为 0，因此判据是实际阻断证据，不能把退出码当成功继续。

冻结风险回归：`regressions/1794828744945/result.json` 六个 runner 全部 code 0，覆盖 P3 recovery 7、旧 fault 5、P1 fixes 5、P1 scope/read 4、P2 fixes 11、P2 reconstruction 18。包括 pending 冻结、外部重写冲突、pending 删除失败、reload 失败、dispose、锁与无关 session、noWork/started failure、context transform、完整 tool groups 与容量阻断。未改 config 的 490 条旧矩阵不重复执行。

`pnpm lint`、`pnpm typecheck`、`pnpm test` 通过，unit 40/40。正式测试后产品源码未变化。包包含 22 个白名单文件，逐文件 SHA-256 对比源码；解包后通过普通 loader 的 DeepSeek native、Codex remote、兼容继续及 DeepSeek 迁移冒烟。

## 性能

固定原始负载 1 MiB、10 MiB；每个 size 原生文本与 head opaque 交替 30 对，各另测 10 次新增转换。无并行性能测试。OS cache warm。恢复本地指标为真实 `setSessionFile`+`refreshContext`，加首次 `prepareRequest` 到实际 fixture fetch 的区间，包含异步 auth、编码与最后 payload guard；预先 seed 和 launcher startup 不混入该指标。完整进程 wall time、awaited setModel、fixture 模型等待、输入量另列。

| 负载 | native 本地 p95 | head 本地 p95 | 配对增量 p95 | fixture 全返回→target p95 |
|---|---:|---:|---:|---:|
| 1 MiB | 5.95 ms | 14.41 ms | 8.58 ms | 36.01 ms |
| 10 MiB | 18.29 ms | 91.34 ms | 73.23 ms | 44.93 ms |

10 MiB 增量低于 200 ms，转换后续接低于 500 ms。120 个兼容恢复样本均为 normal 1、额外摘要 0。10 MiB 的 awaited setModel p95：native 0.665 ms、head 0.616 ms；完整进程 wall p95：328.09/480.62 ms。这些为分别测得的区间，不代表全冷启动承诺。

新增转换单独报告，不与原生无转换工作计算速度比：每样本 source 1、native 1，两个请求实际 JSON 总量 3,560 bytes。10 MiB 样本 source fixture 等待 p95 0.247 ms、native fixture 等待 p95 0.352 ms，完整请求准备到目标发送 p95 144.40 ms。等待只是本地合成响应，不是远端延迟或模型质量数据。

普通热路径每 size 20 对，1,000/10,000 条消息。原验收口径为 awaited prepare+awaited transform+同步 stream 调用：配对增量 p95 为 1.53/7.24 ms，低于 10 ms。补充的 prepare→实际 fetch 全异步区间增量 p95 为 2.83/9.63 ms，单独记录，不偷换旧指标。原始样本包含 min/max、median、p95、wall、失败判据和 source hash。

性能事实文件：`perf/1794828605706/{method,samples,summary}.json`、`hotpath/1794828688546/{method,samples,summary}.json`、`performance-audit.json`。初次带 profiler 的单对诊断看到 10 MiB 增量 247.78 ms，主要是重复完整来源 JSON hash；按 leaf+manager mutation revision 缓存后跑上述正式样本。诊断不是正式样本，原结果保留。

## 能力范围与未测项

本轮全部运行使用 fixture.invalid、合成授权和拒绝其他网络的 preload，不读取真实 auth。支持条件为 Pi 1.5.2 的 openai-codex/openai-codex-responses、有效 OAuth account、ChatGPT backend endpoint、schema 1、受验证 wire。opaque 强制 SSE。未知 endpoint/protocol/representation 不盲目 replay。模型名不等于服务端支持承诺；既有真实协议证据仅为一次 gpt-6-astra，gpt-6.1-sol 与 DeepSeek 在 P4 是安装版 encoder 上的合成 fixture，fixture reasoning 关闭；不冒称 plan 中真实模型 xhigh 质量路径已经验收。

真实 SSE 服务、WebSocket、任意代理端点、全型号支持、摘要语义质量、真实取消延迟、真实 provider 计费均未验；WebSocket 与其他 endpoint 的 opaque traffic 未启用。opaque 容量仍用 P3 full JSON bytes+32/item 与 2×outputTokens 的本地估算，不是 server token bound。合成价格为零不表示真实费用为零。

沿用已接受的 Pi --name/SDK metadata 在 extension 前执行限制、独立 manager/session-file 范围以及 managed cache warmer 禁用边界。此候选不扩大这些保证。source cache 的失效依赖真实 SessionManager append/rewrite/reload/branch 边界，不承诺任意第三方直接修改内部对象的行为。

## 证据与复跑

- 开发包：`package/pi-compact-0.1.0.tgz`，SHA-256 `f09f7e40e8390227614a3f48558f3abc9fdd8feb90263ac832fd5ac65bae6d48`。
- 截图：`review/lane2.png`、`review/lane5.png`、`review/lane7.png`。
- 演示：`review/demo.mp4`，40.000 秒、1100×832。它们是真实 Pi tmux capture-pane 的文本渲染，不是 OS 截图。raw ANSI、每秒文本帧、时间、provider 请求和清理记录均保留。已目视检查成功、等待、取消和最终继续画面。
- 归档：`evidence.tar.gz`，逐文件和整个归档 SHA-256 见 `manifest.json`；流式解包校验见 `archive-verification.json`。排除合成 auth.json、缓存、重复解包文件及正在写入的归档 stdout/self。
- 早期失败保留：跨模型 signature 被 transformer 去除、source auth 在等待中变化却落入 fallback、错误的 observer auth API、将非输入字段误判 opaque 泄漏、旧 fault 在 finally rollback 完成前读取文件，以及性能诊断。对应修复后最终矩阵全绿，没有用新成功覆盖失败原始目录。
- `cleanup.json`：核查 1,427 个记录 PID、216 个 socket、229 份会话清理记录；aliveOwned、残留 socket、监听端口均为空，未杀无关进程。短命 pnpm、渲染、ffmpeg 等子命令由调用者等待结束。

在同版本安装宿主上：

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
pnpm verify:p4
node scripts/p4/edges.mjs
node scripts/p4/regressions.mjs
pnpm verify:perf --pr P4
node scripts/verify-p4-hotpath.mjs
node scripts/p4/package-smoke.mjs
node scripts/p4/demo.mjs
node --import tsx scripts/p4/audit.mjs
node scripts/p4/cleanup.mjs
```

复核交付原始数据可先在仓库根执行 `tar -xzf artifacts/P4/evidence.tar.gz`；归档路径全为相对路径。图像渲染使用 conda `codex-py312`，脚本从普通 PATH Pi shim 解析实际安装。正式性能日志需要按报告所列重定向给 performance auditor；它是交付审计，不是产品运行依赖。

Attention 审查为本 owner 自审：未创建重复协调器、递归手动压缩或 timeout；新状态有明确失效条件，失败信息为英文，运行工具只注入合成网络、外部选择与故障。根代理仍需审 diff 并 fresh 独立验收，之后才能决定 P4 接受；P5/P6 未由本 owner 代为通过。
