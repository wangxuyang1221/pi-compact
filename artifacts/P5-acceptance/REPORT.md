PASS。目标是独立判断普通 pi-compact 扩展的 P5 完成分隔线能否在已验收 P4 上技术放行。对交付 HEAD `b93064294169106347d0419c50393de84325c675`，未发现本次 P5 范围内可确认的阻塞。支持 P5 技术放行和后续 P6 工作，但本结论不替代用户视觉 PASS，不包含真实 provider、真实摘要质量或 P6 授权。本轮没有推进 P6。

产品为 `0f23577463a48f0b5b160f52691a8f9cf3e9155e`，P4 acceptance base 为 `47f1ca081ceaf9b267a1254e8eef398dc4b86074`。初始 HEAD 匹配且工作区干净。产品到交付仅增加 50 个 `artifacts/P5` 证据文件。P4 原有 12 个非 index 产品文件逐字节不变，index 只增加 renderer import 与安装调用。冻结副本的 123 个源码、测试、脚本、配置和文档与交付一致。见 [完整性](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/integrity.json)、[产品 diff](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/product.diff) 和 [交付范围](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/delivery-scope.txt)。

审查由我独立完成，没有创建子代理。所有新证据、依赖副本和探针均位于当前 worktree 的 `artifacts/P5-independent`。没有修改产品、正式测试、正式 runner、installed Pi 或其他 worktree，没有提交、push、PR、merge、publish 或 watch。执行使用 pnpm、`codex-py312` 和深路径 relative-socket preload。全部 provider、auth 和 history 都是合成 fixture，真实服务请求为零。

**宿主、数据形状与显示路径。**

已读取 installed Pi 1.5.2 的根 loader、virtual modules、InteractiveMode、SessionManager、AgentSession、原生 summary component 和 Responses encoder。普通 bundled loader 把包根映射到同一运行时导出，产品用该根的 `CompactionSummaryMessageComponent` 校验实际组件。独立 TUI 探针逐组件记录 constructor 身份，全部相等。没有用单独导入的 dist 类替代运行中的 TUI 类。安装源码冻结副本见 [loader](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/installed/loader.ts)、[virtual modules](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/installed/virtual-modules.ts)、[InteractiveMode](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/installed/interactive-mode.ts) 和 [provider encoder](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/installed/openai-responses-shared.ts)。当前 CLI、package、三个核心 source maps 和 bundle hashes 与交付 provenance 一致，见 [证据审计](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/evidence-audit.json)。

Renderer registry 只保存 manager 对应的显示 binding、组件 render 包装与撤销函数。它没有压缩状态机，也不执行请求或持久化。P4 的 append confirmation、事务收尾和最终 completionEvent 路径保持原样。原生 addMessageToChat 先创建组件，P5 再装饰该实例。text 展开调用保存的 native render，opaque 只从 parser 接受的 Checkpoint 生成白名单 Text。provider、protocol 和 schema 是 parser 校验后的固定值，account、endpoint、model、wire 内容不进入详情。

即时 compaction_end 的显示 timestamp 是 Pi 新建的时间，不等于 entry 落盘时间。历史重建的 renderSessionEntries 为每条消息传递 entry ID。无 ID 的即时完成事件在真实宿主中指向刚提交的活动 compaction，renderer 使用当前 branch 最近的相同 summary、tokensBefore。entry_appended 的 compaction 路径还检查它是否为活动 context 首项。没有发现普通成功路径中缺失 entry 却取到其他 checkpoint 的可达反例。

**独立 entry 探针。**

额外探针的数据形状是一个拥有共同祖先的 checkpoint 树。三条合法 checkpoint 使用相同 summary 和 `tokensBefore=216`，wire items 分别为 3、4、2，stored bytes 为 688、1266、2136。通过真实 command context 的 navigateTree 往返四次，并按真实 Ctrl+O 展开。最新及保留的历史 summary 同屏时，每条 component.messageId 都对应自己的落盘 entry，metadata 逐项相等。不是只比较最后一条摘要。

另从实际 remote fixture 的磁盘记录恢复，再经真实 `/p3-seed` 和 `/compact` 完成下一次压缩。新旧 summary 和 tokensBefore 完全相同。新即时组件没有 messageId，但显示最新的 5 个 wire items、906 bytes、8 个 covered entries。没有回退到旧的 3 items、688 bytes。该请求经过真实 provider encoder 后才被 fixture transport 接收。

缺少 piCompact metadata 的历史 entry 展开时显示真实 native summary，没有借用其他 checkpoint 的详情。保留的旧 checkpoint 被注入坏 budget 或带 ESC 的错误 provider 时，有可见的 `checkpoint details unavailable` 降级提示，旧组件保留 native 内容，合法活动 entry 仍展示其自己的 2 items、2136 bytes。有效 checkpoint 的 account、endpoint、model、wire 中含 PRIVATE 标记、换行及 ESC，实际终端详情均未泄漏这些内容。没有把固定 provider/protocol 标题测试误写为任意字符串直出问题。

近上限的 opaque 使用 8,387,668 stored wire bytes。真实恢复与 Ctrl+O 成功，详情仍为固定八行。展开前后 JSONL bytes 与请求计数不变。这里验证可用性和投影边界，没有测量最大尺寸的 callback 首帧，也不宣称它满足任意尺寸的延迟上限。源码显示 wire clone/预算校验发生在组件绑定时，重复 render 只处理固定详情文本。现有证据未指出需要重跑整套 collapsed 微基准的新 render 规模问题。

以上六项最终均通过，见 [独立 runner](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/identity-runner.mjs)、[观察扩展](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/identity-observer.ts)、[结果与逐组件内容](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/identity/1794833730088/result.json)、[真实重复完成图](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/identity/1794833730088/repeated/expanded.png)、[坏历史 metadata 图](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/identity/1794833730088/old-bad-provider/expanded.png) 和 [大 opaque 图](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/identity/1794833730088/large/expanded.png)。

**已有边界，不计作 P5 回归。**

故意破坏 active checkpoint 的 budget 或 provider 后，CLI 在 footer 读取 context usage 时退出，堆栈为 checkpoint、markProjection、session.ts:137、FooterComponent。此时没有正常请求或新成功。用 accepted P4 的原始源码加载完全相同的坏 budget 文件，同样 exit 1 和相同异常链，零 actual-request。它不是 renderer 新增的 UI-only 故障。正常文件的 UI capability 缺失另有真实压缩和正常续接通过的验证。

因此不能把坏 active metadata 启动称为“友好降级通过”。本报告保留该已有边界，不重开已接受 P4 的无关架构。若后续单独改善此行为，最小方向是在 UI context usage 边界处理已拒绝的 checkpoint，并保留请求屏障。证据见 [P5 坏 active 原始输出](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/identity/1794833630753/bad-budget/raw.ansi)、[P4 对照结果](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/corrupt-baseline/1794833778770/result.json)、[P4 对照原始输出](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/corrupt-baseline/1794833778770/raw.ansi) 和 [对照程序](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/corrupt-baseline.mjs)。这不构成本次 P5 的修正要求。

**本次实际复跑。**

| 检查 | 本次结果和证据 |
| --- | --- |
| lint、typecheck、60 unit | 全部通过。unit 在拒绝外网 preload 下运行。[lint](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/lint.log)、[typecheck](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/typecheck.log)、[unit](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/unit-retry.log)。 |
| P5 native development | baseline、manual、automatic、native failure、Escape 通过。包括 dark、light、120/40/20 列、Ctrl+O、第三方消息 renderer、两次真实 reload 和 disable。[日志](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/development.log)。 |
| P5 integrated | remote、磁盘恢复、fallback、双失败、remote cancel、partial append、迁移失败和显式 retry 通过。[日志](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/integrated.log)。 |
| 生命周期和隔离 | managed A/B/unmanaged、真实 SDK dispose 两次、真实 agent.continue 拒绝、disable/re-enable、后来第三方包装与旧闭包通过。[日志](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/lifecycle.log)。 |
| symlink | direct 与 symlink 普通 loader 均 managed，一次摘要、一个 checkpoint、一条 divider，没有静默 native 卡片。[日志](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/symlink.log)。 |
| 包 smoke 与 UI 降级 | 重新 pnpm pack，25 文件白名单通过。解包包入口压缩成功。仅 UI facade 缺能力的副本明确降级，随后一个正常请求成功。[日志](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/package.log)。 |
| 已交付 tarball | 对原始 f21202a9 包的解包入口再次运行全部 integrated 场景，全部通过。[日志](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/delivered-package-integrated.log)。 |
| P4 定向回归 | fixes 10 项和 lanes 3、6、10 通过，覆盖 reload、split、迁移、兼容零额外摘要、大 raw 和恢复首请求。 |
| P1–P3 风险回归 | P3 recovery 7、faults 5、P1 scope 4、fixes 5、SDK disposal 和 P2 fixes 11 通过。十个 runner 均退出 0。[回归索引](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/regressions.log)。 |

这些运行覆盖 P5 完整十 lane。没有仅核对 owner 的 PASS 字段。[独立 raw auditor](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/scratch/raw-audit.mjs) 又解析了本次 19 个 native/integrated/package 会话和三个 P4 lane，保存 checkpoint IDs、JSONL SHA、请求 phase、body 字节数和 body SHA。结果为 [raw-audit.json](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/raw-audit.json)。P4 lane 3 的正常 body 逐项含落盘 opaque，source/native 请求为零。lane 6 和 lane 10 的目标 normal body 不含 opaque，并有已提交 text checkpoint。失败、取消、partial persistence 的新 checkpoint 和成功事件均为零。

迁移失败场景保留原 opaque，normal 请求为零，成功计数仍为旧的一次。显式 retry 后才增加一次 text 成功，Ctrl+O 显示落盘的 `Readable continuation. database=sqlite retry=3 file=ledger.csv timezone=Asia/Shanghai.`。没有把旧 divider 当作新成功。

生命周期脚本没有替换 dispose 或 continue。A 释放后 A 的组件失活而 B 仍显示 divider，unmanaged 始终 native。B dispose 两次后 queue 前后相等，真实 continue 拒绝。disable/re-enable 的 current divider 数为 0、0、1、0，第三方原型函数身份符合包装顺序。旧 render 闭包始终失活，第三方 marker 保留。最后直接 dispose 释放 UI/safety registry 与锁，恢复原 dispose 和第三方 add 包装。子会话使用真实 SDK 加最小容器调用真实 addMessageToChat，不把它写作三个完整 TUI。具体函数身份记录在上述 raw audit 的 lifecycle 和 finalDispose 项。

**视觉检查。**

已实际查看 [已认可原型](/Users/wangxuyang/Code/codex/pstack/compact/scratch/tui-divider/compaction-divider.png)，以及当前交付的 [dark](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane2-dark.png)、[light](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane3-light.png)、[20 列](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane4-narrow.png)、[40 列](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane4-40.png)、[120 列](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane4-120.png)、[text](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane5-expanded.png)、[opaque](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane6-remote.png)、[fallback](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane8-fallback.png)、[双失败](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/lane8-doublefail.png) 和 [迁移 text](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5/review/migration-expanded.png)。没有将旧 P1 图当作本 HEAD 结果。

固定英文文案、居中细线、低对比前景与无背景块符合原型方向。20 列文字完整，更窄 cell 截断及 ANSI reset 由实际 unit 检查。原生 text 展开保留原卡片样式，属于认可行为。double failure 没有成功提示。终端保留历史、footer 与画布高度不同，不据此扩大 UI 范围。

图像来自 tmux 的真实 ANSI cells，经 pyte 与 Menlo 16 渲染，不是 OS 截图。20 列转换器 footer 被画布裁剪，不代表产品文案越界。36 秒视频由 72 个实际捕获帧以 2 fps 编码。独立核对 recording provenance、产品 hashes、当前 review 文件与归档来源哈希、ffprobe 时长均一致。视频未重录。用户视觉 PASS 仍然待定。

**性能口径。**

先读取 benchmark-checklist 和 Explain the Number，再审计 source、raw samples、profile、machine 和 hashes。本次没有重跑完整性能矩阵，也没有把功能复跑墙钟称为性能结果。交付 raw SHA-256 为 `f7b1b7551a9c8d40df65f6aaac4ee9504206dd90b32f64a5d8a664a3a255e88d`。

20、90、120 列分别测 collapsed render 与 invalidate+resize。每种操作五组，每组预热 200 对，再交替每侧 1,000 次，初始顺序轮换。独立重算 30 组全部统计值和逐对 delta，paired p95 与独立 p95 差均不超过 2 ms。最大 paired p95 为 0.007749 ms，出现在 20 列 render。checksum 为 23,367,500，errors 为零。源码在计时结束后消费全部返回行并检查宽度和内容，未计入断言、日志、PNG、视频或 profile。

profile 独立于计时运行，实际采样包含 renderCompactionDivider、truncateToWidth、visibleWidth、ansiCodeLength 和 native updateDisplay。限制来自同步字符串度量、Unicode 截断与布局。profile 同时包含区间外消费和断言，不能把整份占比当作纯 renderer 时间。机器记录为 10 核，load 2.04/1.56/1.45。宽窗口的微小差异按噪声处理，负 delta 不证明整体提速。

12 次非 profile 的 callback 进入至第一个含 divider 的真实 terminal.write 返回为 2.31225 至 22.330334 ms。起点确在 subscriber 第一条取时，包含其后同步 observer 日志。逐文件核对只有一个 Pi preload，p5 成功记录与首帧一一对应，没有拿 lifecycle 多会话的全局状态测量性能。integrated 中 p3 与 p5 对同一事件各写一条日志，审计按 p5 的 reason 字段区分，没有把双 observer 误计为两次成功。另一次 profile 首帧没有混入 12 次样本。这是本地观测，不是物理屏幕时间、尾延迟承诺或真实服务速度结论。全部复算结果见 [性能与来源审计](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/evidence-audit.json)。

**包、归档与失败保留。**

原始安装包 SHA-256 为 `f21202a9566c01ab3ad02814797f7caf0acaa1635a21f78c6366838c5ce751b6`。25 个文件严格等于 package 白名单，源码和文档与 HEAD 逐字节相等。package.json 仅按 pnpm 删除 packageManager 的已说明规则比较。没有夹带 tests、fixture、node_modules 或真实凭据。已交付包的真实 ready extension 列表与 run.sh 均定位本次 unpacked/package/src/index.ts，未借用开发 src 补缺。

归档 SHA-256 为 `7b4121efadde72f4bc3740e04d37281a8e1ea4106828bbe129b6e9711e242264`，10,498,934 bytes。逐成员验证 2,414 个普通文件的路径、唯一性、size 和 SHA 后，仅解压到本目录 owner-archive。没有覆盖旧 tracked 证据，没有把本轮 auditor 输出放回其自身输入。见 [归档和包审计](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/archive-audit.json) 与 [可复跑程序](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/archive-audit.py)。

交付的原失败记录、旧 symlink 红复现和 archive AppleDouble 失败证据保持原样。本轮的冻结清单拼写、临时目录、ESM resolver、坏 active fixture、堆栈字符串、双 observer 事件和未规范化路径等失败全部保留，详见 [失败记录](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/failures.md)。没有把失败运行改写为通过。

**清理与方法。**

直接核对 414 个已登记 PID，全部退出。76 个登记 socket 已不存在，72 份正常 cleanup 无存活进程或监听。四次故意坏 active 启动结束后留下的 stale socket，在确认没有对应进程和 lsof 使用者后移除。最终 TCP listener 输出为空，进程扫描没有本任务 runtime。短命 shell、pnpm、conda、Python、tar、ffprobe 和 audit 工具均已等待结束，没有冒称每个辅助进程都逐 PID 登记。没有终止无关进程。见 [清理明细](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/cleanup.json)。

89 份 events 日志中，CLI/TUI 没有真实网络拦截事件。两次 guarded unit 各有 9 次本地 tsx connectToServer IPC 被同一个 preload 拒绝，共 18 次，调用栈在清理明细中逐项保存。它们不是 provider 请求，也没有通过放宽网络屏障来消除。真实 auth/history 没有读取。

Model the Domain 使探针按 checkpoint 树、messageId 和 text/opaque 联合验证。Prove It Works 使结论依赖真实 CLI、entry、JSONL、transport body、函数身份和解包 loader。Explain the Number 使性能结论限于已审计的本地预算。所读原则分别为 [Model the Domain](/Users/wangxuyang/plugins/pstack/pstack/skills/principle-model-the-domain/SKILL.md)、[Prove It Works](/Users/wangxuyang/plugins/pstack/pstack/skills/principle-prove-it-works/SKILL.md) 和 [Explain the Number](/Users/wangxuyang/plugins/pstack/pstack/skills/principle-explain-the-number/SKILL.md)。how、no-comments、control-cli、technical-writing、unslop 与 show-me-your-work 按用户要求直接应用。没有删除产品注释、添加 suppression 或执行修复。吞吐检查点为 `n/a, read-only investigation`。

复跑正式 runner 时进入本目录 checks，继续使用 `node --import=./scripts/fixture/relative-socket.mjs ...`。它们会生成新的时间戳目录。额外 entry 探针以本次冻结的 remote fixture 为种子，从 worktree 根运行 `node --import=./artifacts/P5-independent/checks/node_modules/tsx/dist/loader.mjs artifacts/P5-independent/scratch/identity-runner.mjs`。审计现有 raw 可运行 scratch/raw-audit.mjs、scratch/evidence-audit.mjs 和 archive-audit.py。所有输出仍限于本目录。

Attention。审查者为 gpt-6-astra high。[决策记录](/Users/wangxuyang/.t3/worktrees/compact/t3-6b169eac-575e28d02aa72a28/artifacts/P5-independent/decisions.tsv) 已按本会话工具结果和原始文件自审。遵守禁止子代理，没有另做跨模型 trail review。后续负责人应保留用户视觉和 P6 真实服务门槛，并知晓坏 active metadata 在 P4 已存在的启动退出边界。本报告不替任何人勾选这些门槛。
