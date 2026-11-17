# P5 UI 提前开发候选报告

结论为 **PASS，P1 上的开发候选**。本报告不表示整个 P5 完成。远端 checkpoint、远端回退、P4 集成后的全部十 lane、协调者独立验收和用户视觉审阅仍为 pending。

基线为 `82c33d45ba7b351c9cefbfa2390d651953c80f31`，包含已通过独立验收的 P1 产品代码。工作树为 `/Users/wangxuyang/.t3/worktrees/compact/t3-41b26b20-96a970aec24e1a21`，本地分支为 `t3/implement-pi-compact-p1-p6`。候选提交包含本报告；精确提交 SHA 由最终交付给出。所有最终 TUI、视频、包、性能证据的七个产品源码 SHA 均经 [审计摘要](evidence-summary.json) 对照当前源码。

## 实现与边界

`src/ui/compaction-divider.ts` 按终端 cell 宽度输出固定英文文案。使用宿主同版本 pi-tui 的宽度和截断工具。20 列完整显示文案，窄于 20 列时安全裁剪，宽窗口补细线与留白。每个颜色段重置 ANSI。没有背景块、token 数或耗时。

`src/pi-adapter/renderer.ts` 从普通 loader 提供的 Pi 根入口取得实际类，并在原生 `addMessageToChat` 创建组件后检查 `instanceof`。只包装加载本扩展的会话中的原生 compactionSummary 组件。折叠时替换显示，展开时调用原组件的 render，保留真实摘要、原生格式与 Ctrl+O。没有第二条通知，没有模型调用，没有写会话数据。

registry 按 manager 和组件实例持有恢复函数。reload、shutdown 和直接 dispose 会停用实例包装；最后一个绑定释放本适配的原型包装。按函数身份恢复，第三方后来安装的包装保留。旧包装被其他函数继续持有时也会失活。UI 能力、可写性或组件类身份不匹配时保留原生显示，stderr 与 TUI 状态给出 visual downgrade。

`src/index.ts` 仅新增 import 和安装调用。package 增加精确版本 pi-tui peer 与开发依赖、P5 runner 和范围文档。`session.ts`、state、journal、兼容性安全检查、原测试、旧 runner、design、roadmap 和 P1 adapter 文档均与基线相同。没有修改 root checkout、安装的 Pi、用户设置或 main。

[数据形状](DATA-SHAPES.md) 在实现前记录。生命周期探针之后改为保存 manager 和 UI 快照，避免关闭时读取已失效的扩展 ctx。没有提前定义或伪装 P3/P4 远端功能。

## 实际 TUI 证据

最终 run 为 [1794811889111](runs/1794811889111/result.json)。实际 launcher 是 installed Pi 1.5.2 bundled CLI，指纹保存在 provenance 中。执行路径 observer 只注入 ModelRuntime transport，不替换 prepare、compact、append、dispose 或请求屏障。UI 探针观察 terminal.write、切换隔离主题和调整 resource loader 的 fixture 输入。

| 开发场景 | 结果与证据 |
| --- | --- |
| 原卡片对照 | PASS。[baseline/native.png](runs/1794811889111/baseline/native.png) 与 [dark-90.png](runs/1794811889111/manual/dark-90.png) 均走真实手动成功路径，各一次摘要请求。 |
| 90 列深色 | PASS。居中细线、固定文案，无背景卡片与统计。相较已认可原型，颜色随 Pi 当前主题，保留原生 chat 留白。 |
| 90 列浅色 | PASS。[light-90.png](runs/1794811889111/manual/light-90.png) 无深色背景块。 |
| 120→40→20 | PASS。[120](runs/1794811889111/manual/resize-120.png)、[40](runs/1794811889111/manual/resize-40.png)、[20](runs/1794811889111/manual/resize-20.png)。20 列完整文案，无越界。更窄宽度由 unit 验证安全裁剪。 |
| Ctrl+O | PASS。[expanded-90.png](runs/1794811889111/manual/expanded-90.png) 显示实际 `Synthetic native summary.`，折叠恢复。展开前后 JSONL 字节相同，摘要请求仍为 1，普通请求为 0。 |
| 自动成功续跑 | PASS。[automatic.png](runs/1794811889111/automatic/automatic.png)。一次摘要、一次普通续跑、一个 compaction entry、一条 divider。 |
| 手动成功 | PASS。自定义 instructions marker 到达真实摘要 transport。一次 entry、一条 divider。 |
| 失败与 Escape | PASS。[failure](runs/1794811889111/failure/failure.png)、[cancel](runs/1794811889111/delay/delay.png)。零成功事件、零 checkpoint、零普通请求、无 divider。 |
| reload 两次和 disable | PASS。[reload](runs/1794811889111/manual/reload-twice.png)、[disabled](runs/1794811889111/manual/disabled.png)。真实 `/reload` 后仍只有一条 divider。从 fixture loader 输入移除产品后重载，扩展列表确无产品，原卡片恢复，UI registry 与 addMessageToChat 恢复。P1 安全 owner 到 dispose 才释放。 |
| 其他消息 renderer | PASS。[coexist.png](runs/1794811889111/manual/coexist.png)。通过公开 registerMessageRenderer 渲染的 PEER 消息在启用与禁用后均存在。unit 另验证后装的实例 renderer 包装不会被删除。 |
| UI 能力降级 | PASS。[降级提示](package/1794811891503/downgrade-run/downgrade-notice.txt)、[结果](package/1794811891503/downgrade-run/result.json)。独立解包副本只对 UI 安装传入缺少组件的 host facade，原安全 host 未变。原卡片成功后仍能正常请求。这是显式故障注入，不能称为发现实际 installed Pi 不兼容。 |

所有 PNG 都是实际 tmux ANSI cell 捕获经 pyte 与 Menlo 16 渲染，保留宿主文字、位置和前景背景颜色。它们不是 macOS 窗口截图。终端画布背景由 renderer 设为深色或浅色。图中 tmux extended-keys 提示来自隔离 server 的默认设置，没有修改用户 tmux 配置。

[36 秒 demo.mp4](demo/1794811892804/demo.mp4) 来自同一产品源码。72 帧真实 TUI 捕获，以 2 fps 编码，展示手动成功、展开与折叠、120→40→20 缩放及浅色主题。来源、时间轴与动作见 [recording.json](demo/1794811892804/recording.json)。不是屏幕摄像或生成 UI。

## 性能

结论为通过本地开销预算，不宣称一般加速。真实 native 与已接管的宿主组件使用同一摘要、token 数、主题及输出 padding。每种宽度、每个操作预热 200 对，交替测量每侧 1000 次，重复 5 组。resize 计入 invalidate 和相邻宽度 render。断言、结果消费、PNG、视频和 CPU profile 均在计时区间外。

下表为每组 paired delta 的 p95，再报告五组中位数和范围，单位 ms。原生与新组件各组 p95 及全部原始样本可复查 [summary.json](perf/1794811890413/summary.json) 和 [samples.json](perf/1794811890413/measured/samples.json)。

| 列数 | 操作 | 新增 p95 中位数 | 五组范围 |
| --- | --- | ---: | ---: |
| 20 | render | 0.007626 | 0.006833 至 0.015583 |
| 90 | render | 0.000417 | 0.000250 至 0.000792 |
| 120 | render | 0.000292 | 0.000209 至 0.000375 |
| 20 | resize | -0.005917 | -0.006541 至 -0.005583 |
| 90 | resize | -0.006749 | -0.006834 至 -0.006583 |
| 120 | resize | -0.007084 | -0.007416 至 -0.007000 |

30 组的 paired p95 和两侧独立 p95 差值均小于 2 ms。累计消费 checksum 为 23,367,500，输出宽度、内容、请求计数均断言通过，错误为 0。负值只表示该微测量中差值为负，不据此推导整体加速。

成功事件到第一个包含文案的 terminal.write 完成分别为手动 5.451166 ms、自动 32.659083 ms、性能场景 3.375959 ms，均小于 100 ms。这是三次 fixture 本地观测，不是尾延迟保证或屏幕物理可见时间。最大组件新增 p95 不到最短首帧观测的 0.5%，无法解释成用户整体速度改善。

[method.json](perf/1794811890413/method.json) 记录 10 核与当时 load 7.77/7.31/5.24。机器有其他负载，同时运行隔离验证，故使用交替与分组，未停止无关进程。未使用 profile 数据作计时结果。[profile-summary.json](perf/1794811890413/profile-summary.json) 显示同步 ANSI truncateToWidth、ansiCodeLength、visibleWidth、原生 updateDisplay 和 divider render。断言也消耗 CPU，但在计时区间外。主要工作是单线程字符串度量与组件布局，无模型网络瓶颈。20 列会执行 Unicode 裁剪，宽窗口不需要。微小组间差异按噪声处理，仅按 2 ms 的预算判定。

## 回归、包与直接清理

- `pnpm lint`、`pnpm typecheck`、`pnpm test` 退出 0，38/38 tests。日志位于本目录。
- `pnpm verify:p1-fixes` 五组通过，见 [结果](../P1-fixes/runs/1794811894052/result.json)。
- `pnpm verify:p1-scope` baseline/head 与 managed public reads 四组通过，见 [结果](../P1-scope/runs/1794811909376/result.json)。原 runner 未改。
- 直接真实 SDK dispose 两次后，UI registry、安全 registry、addMessageToChat 与 dispose 原型、文件锁全部释放，stderr 为空，见 [事件](disposal/1794811805601/events.jsonl)。探针未替换 dispose。
- 开发包 [pi-compact-0.1.0.tgz](package/1794811891503/pi-compact-0.1.0.tgz) 含 14 个预期文件，SHA-256 为 `4c38ad6a6030f8112ac90cd353671b209b4032bad1343ed604854ee06f1b6d7d`。七个产品源码与六个文档逐字节匹配；manifest 除 pnpm 删除 packageManager 外语义一致。没有 fixture、测试、node_modules 或凭据，见 [逐文件审计](package/1794811891503/audit.json)。
- 普通 `-e` loader 从真实解包入口加载，未加载工作树源码产品入口。实际 managed=true、一次原生摘要、divider 首帧和正常退出均通过，见 [包 smoke](package/1794811891503/package-run/result.json)。此为开发包 smoke，不是 P6 最终安装验收。
- [cleanup.json](cleanup.json) 直接检查累计 96 个唯一已登记 PID，全部不存在；39 份 tmux cleanup 无存活进程、监听和 socket。工作树无 .sock，ps 无该工作树残留 Pi、tmux 或 runner。首轮 crash 的 Pi PID 也包含在检查中。短命 conda、pnpm、renderer、ffmpeg 未逐 PID 登记，主命令均已完成。没有停止无关进程。

所有模型输出和历史都是合成 fixture，agentDir 与授权独立。preload 禁止真实 socket、HTTP、HTTPS、WebSocket，只允许 fixture.invalid 合成 fetch；累计 network-blocked 为 0。没有调用真实 provider，没有读取真实用户凭据或历史。

## 自检与复跑

代码审查、deslop、no-comments 由本实现者按任务约束自行完成，没有子代理。产品代码新增注释与 lint/TypeScript suppressions 均为 0；没有删除或恢复原注释，没有 `any` 绕过类型。新增组件只处理显示，P1 执行 owner、策略和持久化未变。自检不替代协调者独立验收。

`pnpm verify:p5-development`、`pnpm verify:p5-perf`、`pnpm verify:p5-package` 和 `pnpm record:p5-demo` 各生成时间戳目录。`node scripts/verify-p5-disposal.mjs` 运行直接生命周期探针。复跑时将 stdout 重定向到本目录相应 live/perf/package/demo/disposal.log，再运行 `node scripts/p5/audit-evidence.mjs`。审计从这些日志的最后一行定位证据；旧 run 保留。

提交保留 runner、范围文档、紧凑摘要、报告及代表截图。原始 ANSI、事件、JSONL、样本、CPU profile、视频和 tgz 在本工作树本地供独立审查。第一轮 peer fixture crash、自动触发输入不当、提示被重绘覆盖、disposal 探针失效 ctx 和审计误读自己的清理汇总的原失败证据也保留，最终结果另有时间戳，不覆盖成通过。

协调者下一步可移植该 UI 候选，在 P4 被验 head 上处理 index 的最小安装冲突，再执行完整十 lane、远端与 fallback 详情、性能和用户视觉审阅。未 push、创建 PR、合并、发布或 watch。

## Attention

未运行跨模型或独立审查，遵守本任务不启动子代理的限制。最终验收须由根协调者另行完成。使用的 Pstack 原则与技术写作技能只指导本阶段实现和证据，不重启总体架构流程。
