# P5 整合 owner candidate

目标是在已验收 P4 上交付可安装的普通 pi-compact 扩展，让用户看到认可的英文完成分隔线，并能展开真实文本摘要或安全的远端详情。结论为 **owner PASS**。这不是独立验收。根协调者的 fresh review 与用户视觉审阅仍未完成，P6 未开始。

## 提交与产物

- 工作树为 `/Users/wangxuyang/.t3/worktrees/compact/t3-38da13e1-5924d01b0a94b17c`。
- 本地分支为 `feat/p5-integrated-divider`。
- P4 acceptance base 为 `47f1ca081ceaf9b267a1254e8eef398dc4b86074`。其 tested HEAD 为 `42a1663efde146867b1e95d7b7736be7d0d252e8`，产品为 `1ea8cf4f4cf492872f9c8bb5594daa6a5aa531db`。
- 本次精确产品 SHA 为 `0f23577463a48f0b5b160f52691a8f9cf3e9155e`。
- 产品与证据交付 SHA 为 `e58d3dc7f37239779ff08399412a9f0f4c85e74d`。本报告是其后的纯文档补充。最终报告 HEAD 在提交后写入本地 [DELIVERY.json](DELIVERY.json)，并在代理交付回复中给出，避免让提交内容自引用自身哈希。
- [安装包](pi-compact-0.1.0.tgz) 的 SHA-256 为 `f21202a9566c01ab3ad02814797f7caf0acaa1635a21f78c6366838c5ce751b6`。
- [36 秒视频](review/demo.mp4)、[视觉目录](review) 和 [完整证据归档](evidence.tar.gz) 已随本地证据提交保存。
- 归档为 10,498,934 bytes，SHA-256 为 `7b4121efadde72f4bc3740e04d37281a8e1ea4106828bbe129b6e9711e242264`。[逐成员复核](archive-audit.json) 对 2,414 个文件核对 size 与 SHA-256 后通过。

## 决定与新增边界

先依序移植 `0cbcdc8895171e8eaef1193d2107e26ce35ae869` 与 `ea1bb524fb8b25e8ec9eb4e97766aa5227425d6a`。package 冲突保留 P4 脚本和文件白名单，再加入 P5 文件及精确 `pi-tui@1.5.2` 依赖。`src/index.ts` 只增加 renderer 安装。[审计](audit.json) 证明 P4 其余产品文件逐字节未变，包含 session owner、checkpoint、migration、Codex wire、journal 和 transaction。

数据形状复用已有 `Checkpoint` 的 text/opaque 联合。UI registry 只按 manager 维护组件包装与撤销函数，不拥有压缩状态。[数据与吞吐记录](DATA-SHAPES.md) 和 [决策日志](decisions.tsv) 描述新增接入。

`addMessageToChat` 先让宿主创建组件，再校验其是否属于普通 loader 根包导出的实际 `CompactionSummaryMessageComponent`。只有加载本扩展的会话会替换折叠 render。手动、自动、remote 和 native fallback 的成功提示都来自 P3/P4 已确认提交后的原生显示事件，UI 不发起压缩，也不绕过请求屏障。

折叠组件按 terminal cell 度量，采用当前主题的 dim 和 muted 前景，保持细线、固定文案与 ANSI reset。20 列完整保留 `↗↙ Context compacted`，更窄安全裁剪。无背景块、token 数或耗时。文本展开调用宿主原 render，因而保留原生详情卡片样式。

新增 opaque 详情从已提交 branch entry 读取。messageId 可用时精确匹配，否则使用当前 branch 最近的摘要与 tokensBefore 边界。Pi 完成事件会生成新的显示时间戳，不能拿它匹配落盘时间。详情仅显示固定 provider、protocol、schema、覆盖 entry 数、wire item 数和 stored wire bytes。account、endpoint、model 和任意 wire 文本均不投影。详情明确表示没有存储可读摘要，不额外请求模型。恶意 synthetic wire/account/endpoint/model 字符串的 unit 检查也证明它们不进入详情。

symlink 入口现在与安全适配器一样先 realpath，再做身份比较。旧独立审查发现的红复现保存在 [history](history/independent-P1-REPORT.md) 和代表 [旧截图](history/symlink-P1-actual.png)。本次新组合 HEAD 通过 direct 与 symlink 普通 loader，各一次真实 native summary、一次 checkpoint、一条 divider。此结果仍需根协调者 fresh review，不能沿用旧独立结论。

## 十 lane 实际结果

最终主运行来自 `ten-lanes-final.log` 中的两条路径。native 为 `artifacts/P5-development/runs/1794832578968`，远端整合为 `artifacts/P5/integrated/1794832590287`。它们记录的所有产品源码 hash 与产品 SHA 一致。目录名称沿用旧 runner，但本次运行基线是完整 P4。所有请求、模型和历史均为合成 fixture，下面没有真实服务验收结论。

| Lane | 实际检查与结果 |
| --- | --- |
| 1 | PASS。相同 native fixture 分别运行无产品基线与组合 HEAD。两侧各一次摘要，基线原卡片与 head divider 均为实际捕获。[左右对照](review/lane1-before-after.png)，左为 native，右为 head。 |
| 2 | PASS。[90 列深色](review/lane2-dark.png) 文案居中、细线低对比，无统计和背景卡片。 |
| 3 | PASS。[90 列浅色](review/lane3-light.png) 前景可读，无深色背景块。 |
| 4 | PASS。[120 列](review/lane4-120.png) 到 [40 列](review/lane4-40.png) 再到 [20 列](review/lane4-narrow.png)，无溢出，20 列完整文案。unit 覆盖更窄宽度、Unicode cell 与 ANSI reset。 |
| 5 | PASS。[Ctrl+O 文本展开](review/lane5-expanded.png) 显示实际 `Synthetic native summary.`，再折叠恢复 divider。完整 JSONL bytes 不变，一次摘要、零普通请求，展开无额外请求。 |
| 6 | PASS。[远端详情](review/lane6-remote.png) 数字逐项匹配已落盘 opaque。无 encrypted_content、原始 opaque、账户材料、placeholder 或伪造人类摘要。展开与折叠前后 JSONL bytes 和 actual-request 数均不变。停止并重新从已存 sessionFile 启动后也可展开，恢复侧零请求。 |
| 7 | PASS。真实自动压缩后继续输出，一次 summary、一次 normal、一次 checkpoint、一条 divider。证据为 native run 的 automatic/automatic.png 与 events.jsonl。 |
| 8 | PASS。明确 remote failure 后 native fallback 一次成功，只显示 [一条 divider](review/lane8-fallback.png)，展开真实 `Readable continuation.`。remote 与 native 双失败没有 entry、成功事件或 [成功提示](review/lane8-doublefail.png)。 |
| 9 | PASS。实际 `/reload` 两次无重复包装。loader 移除产品再 reload 后恢复 native。实际 re-enable 后恢复 divider。lifecycle run 进一步验证 disable、re-enable、直接真实 SDK dispose 两次与旧闭包失活。 |
| 10 | PASS。light 主题与公开 `registerMessageRenderer` 的 PEER 输出共存。第三方后来包住实例 render 与原型 addMessageToChat 后仍保留其身份与输出。显式缺少组件的 UI facade 故障注入保留 native，stderr/TUI 显示 visual downgrade，压缩后仍可正常请求。此为人为兼容故障注入，不是声称 installed Pi 不兼容。 |

额外 PASS。手动 native failure、真实 Escape、remote cancel、真实 partial append 故障均没有成功 divider。P4 迁移双失败维持旧 opaque，不发目标 normal，不增加成功事件。显式 retry 成功后只有新的 text entry 和一条 divider，Ctrl+O 显示 [实际迁移文本](review/migration-expanded.png)。

多会话使用真实 SDK 的 createAgentSession、bindExtensions、dispose。两个 managed 与一个 unmanaged 并存。A 关闭后只释放 A，B 仍有 divider，unmanaged 始终 native。直接 dispose 后真实 agent.continue 拒绝，queue 不变。子会话组件通过最小容器调用宿主真实 addMessageToChat，不把它说成三个完整 TUI。主会话所有 reload、disable、reenable 和 peer 链均在实际 CLI/TUI 中执行。最终路径见 [生命周期日志](lifecycle-freeze.log)。

我实际查看了已认可原型和本次 dark、light、20 列、text expanded、remote expanded、fallback 的 PNG。固定文案、居中细线与无背景风格与原型一致。终端高度、保留输入和 footer 由运行时决定，当前配色随宿主主题。截图与视频是实际 tmux ANSI cell 捕获，再由 pyte 与 Menlo 16 转 PNG，不是 OS 窗口截图。20 列时转换器 footer 也随画布裁剪，产品文案仍完整。用户视觉 gate 保留。

## 验证与性能

`pnpm lint`、`pnpm typecheck`、`pnpm test` 均通过，unit 为 60/60。最终脚本另经 lint-freeze 检查。受影响风险回归的十个 runner 全部退出 0，见 [regressions.log](regressions.log) 和 raw 结果。

| 回归 | 本次结果 |
| --- | --- |
| P4 fixes | 10/10。包括 same-leaf source/native reload 和 single/multi opaque split-turn source/raw/failure。 |
| P4 migration | lanes 3、6、10 通过，覆盖兼容零额外 source summary、大 raw fallback、磁盘恢复首请求。 |
| P3 | recovery 7 与 faults 5 通过，包含失败事务、重启、kill-idle、小窗口与显式 retry。 |
| P1 | scope 4、fixes 5 与真实 SDK disposal 通过。 |
| P2 | representative fixes 11 通过，覆盖阈值、容量、失败/取消重试与配置修复。 |

性能只判断本地 UI 开销预算，不宣称整体加速。实际 CLI 的新组件与同一根包原生组件使用相同摘要、主题和 padding。20、90、120 列分别测 render 与 invalidate+resize。每组先预热 200 对，再交替每侧 1,000 次，共五组，初始顺序轮换。所有输出都消费并核验宽度和内容。raw 为 30 组、checksum `23367500`、错误 0。审计重新计算全部 p95，paired p95 和两侧独立 p95 差均低于 2 ms。

下表单位 ms。两侧 p95 与 paired p95 都报告五组中位数，最后一列是 paired p95 的五组范围。

| 列数与操作 | native p95 | head p95 | 新增 paired p95 | 五组范围 |
| --- | ---: | ---: | ---: | --- |
| 20 render | 0.000584 | 0.006542 | 0.006042 | 0.004792 至 0.007749 |
| 90 render | 0.000209 | 0.000375 | 0.000208 | 0.000168 至 0.000292 |
| 120 render | 0.000209 | 0.000334 | 0.000167 | 0.000167 至 0.000168 |
| 20 resize | 0.007958 | 0.005833 | -0.001625 | -0.001708 至 -0.001417 |
| 90 resize | 0.004833 | 0.001125 | -0.003416 | -0.003459 至 -0.003292 |
| 120 resize | 0.004875 | 0.001042 | -0.003542 | -0.003583 至 -0.003500 |

测量时 10 核，load 为 2.04/1.56/1.45。其他本任务 TUI 与视频转换已完成，未停止无关进程。独立 profile 证明 truncateToWidth、visibleWidth、ansiCodeLength、原生 updateDisplay 和新 renderCompactionDivider 确实执行。限制来自同步字符串度量和组件布局。20 列需要 Unicode 裁剪，native resize 另重建布局。profile 也包含区间外断言与消费，不能把整份 profile 占比当成纯被测函数占比。微小宽窗口差异按噪声处理，负值不支持整体加速。

12 次非 profile 的 callback 进入到首个包含 divider 的真实 terminal.write 完成为 2.31225 至 22.330334 ms，其中 manual 4.26325 ms、auto 22.330334 ms、remote 5.670292 ms、fallback 5.656208 ms。另一次 profile 观测单列，不纳入上述数量。计时起点在 callback 的第一条取时，包含后续 observer 同步日志开销。它不是 physical screen latency，也不是 tail guarantee。最大新增 render p95 不到最短非 profile 首帧的 0.34%，不能据此推导用户整体速度变化。PNG 转换、视频编码、profile、断言和结果消费不计入微基准。

完整 raw、method、profile 与消费结果位于 `artifacts/P5-development/perf/1794832656248`，归档中均保留。[audit.json](audit.json) 记录精确路径和全部首帧值。

## 包、源码与证据

包有 25 个白名单文件。所有源码与文档逐文件 hash 匹配产品，manifest 只按 pnpm 删除 packageManager 的规则比较。未夹带 tests、fixture、node_modules 或凭据。普通 `-e` 从解包 package/src/index.ts 加载，入口不来自开发 src。独立降级副本仅替换 UI 安装 facade，原安全 host 未改。

同一个解包入口额外完整执行六项 integrated 场景，包含 remote、恢复、fallback、双失败、cancel、partial persistence 和 migration，见 [package-integrated.log](package-integrated.log)。该 runner 的 extension 列表和 run.sh 记录包入口。package path 下所有 src hash 与产品相同，不能用开发源码来补缺。没有全局安装。

所有源码、测试与 probe 变化都有明确用途。divider、renderer 与 index 负责产品显示接入；divider tests 负责 cell、真实组件、隔离和 opaque 字段白名单。既有 P5 observer 修正成功事件计时起点，benchmark 改为每组预热。development、symlink、perf、package、demo runners 加入深路径 relative socket 兼容，package 加入精确白名单与每文件 hash。verify-perf 只增加 P5 dispatch。新增 integrated runner 验证真实 P3/P4 entry 与 UI，lifecycle runner 与 observer 从前次独立探针移植并补足实际状态断言，risk runner 只调用原 P1-P4 检查。render-capture.py 沿用实际 ANSI 转图。旧 audit-evidence.mjs 只保留作历史候选工具，本次正式索引由 artifacts/P5/audit.mjs 生成。README 与 p5-renderer 文档反映当前使用与限制。

当前 stdout、manifest、receipt 和 archive 输入清单不参与自身哈希。archive-manifest 列出归档的实际普通文件，逐成员复核不依赖 tar mtime。大 raw 压缩归档，编译缓存和绝对 symlink alias 不入包。初次 macOS tar 额外加入 AppleDouble 的失败与修正记在 [全部失败记录](failures.md)，没有忽略未知成员后声称通过。

## 复跑与清理

在当前 worktree 根执行以下命令。若从只含 git 的新 checkout 复核已有证据，先 `tar -xzf artifacts/P5/evidence.tar.gz`。

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm verify:p5
pnpm verify:p5-symlink
pnpm verify:p5-lifecycle
node scripts/p5/run-regressions.mjs
pnpm verify:p5-package
pnpm verify:perf --pr P5
pnpm record:p5-demo
node artifacts/P5/audit.mjs
conda run --no-capture-output -n codex-py312 python artifacts/P5/verify-archive.py
```

解包入口的复跑使用 `P5_ENTRY=/absolute/path/to/unpacked/package/src/index.ts node scripts/verify-p5-integrated.mjs`。正式 evidence 索引读取冻结日志中的路径。新运行只增加时间戳目录，若要纳入索引，另存新日志后再显式更新选择，避免将旧证据改写成新结论。P1-P4 runner 可用 `node --import=./scripts/fixture/relative-socket.mjs ...`。

[cleanup.json](cleanup.json) 直接核对 531 个唯一已登记 PID、104 个 socket、104 份清理记录。全部进程不存在，socket 不存在，lsof 无监听，network-blocked 为 0。当前 worktree 根也无 socket，进程扫描没有本任务 Pi、tmux 或 runner。短命 pnpm、conda、Python、ffmpeg、tar 和审计命令均已等待返回，未将它们全部冒称逐 PID 登记。没有杀无关进程，没有修改全局 Pi、launcher、provider、真实授权或历史，没有写其他 worktree。

吞吐检查点有四次。调查先核对精确 acceptance、候选与原型，阻塞解决后再移植。实现由单 worker 持有 UI registry 和共享 manifest，最小分解为移植、详情边界与探针。验证按 static、真实 TUI、风险回归、冻结后视觉包与独立性能顺序推进，隔离 agentDir 和 socket。交付先冻结产品，再保存包、视频、逐成员归档和报告，共享索引最后写入。四次均保留无子代理的执行决定，详情见 DATA-SHAPES 与 decisions.tsv。

应用 Model the Domain 的具体选择是复用 text/opaque checkpoint 联合与 UI registry。应用 Prove It Works 的选择是用实际 CLI、磁盘 JSONL、真实 terminal.write 与解包 loader 来证明行为。应用 Sequence Work into Verifiable Units 的选择是先移植、再补详情、再冻结产品和保存证据。Explain the Number 使性能报告包含 limiter、原始样本、消费检查与测量边界。相关 leaf 技能均在本会话读取。how、control-cli、技术写作、unslop、deslop 与 no-comments 按用户约束直接应用，没有再委派。产品新增注释、suppressions 与 any 绕过均为零。[自检记录](no-comments.json) 不代替独立审查。

Attention。实现者为 Sol xhigh。此记录只有 owner 自检，没有独立 reviewer 或跨模型审查。真实 provider 请求预算未使用，没有读取真实 auth/history。全部模型与 transport 都是 synthetic，不能宣称真实 gpt-6.1-sol/xhigh 服务、SSE 服务可靠性或摘要质量通过。根协调者独立审查、用户视觉审阅与之后另授权的 P6 仍为明确 gate。未 push、PR、merge、publish 或 watch。
