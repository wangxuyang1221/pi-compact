# P5 开发候选的数据形状

本文件在实现前记录。基于 P1，最终 P5 验收依赖 P4 集成。

- DividerPalette 为 rule 与 caption 两个纯文本着色函数。renderCompactionDivider 接收终端 cell 宽度，返回三行终端文本。固定文案由 pi-tui 的 visibleWidth 与 truncateToWidth 度量和裁剪。颜色仅来自当前主题的前景色，每段结尾重置 ANSI。
- RendererRegistry 保存 entrypoints、按 SessionManager 分组的 RenderBinding、原型撤销函数。RenderBinding 保存当前 UI context、InteractiveMode 和已包装组件的恢复函数。没有压缩状态或执行器。
- 只有 native addMessageToChat 实际创建的 compactionSummary 且 instanceof 根入口导出的 CompactionSummaryMessageComponent 才可包装。折叠时渲染分隔线，展开时调用原 render，摘要仍由宿主保存。
- 每个包装按函数身份恢复。reload、shutdown、dispose 恢复本实例的 render。最后一个绑定退出时释放本适配的原型包装。其他会话走原调用；能力不兼容时报告 visual downgrade 并保留原生结果。
- 不声明远端检查点类型。当前仅显示宿主真实原生文本摘要。未来 P3/P4 需从已提交 checkpoint 提供独立的可读详情合同。

吞吐检查点。

- 阻塞步骤。已读取 architecture synthesis、P5 合同和实际 Pi 1.5.2 源码；先验证 root class identity 与正常 loader。
- 独立工作流。本任务单 owner 顺序实现 divider、adapter、真实 TUI runner 与性能，不启动子代理。
- 共享可变状态。仅本进程 UI registry；不读写压缩编排与策略，不修改 session.ts。index.ts 只加最小安装调用。
- 最小安全分解。一个 worker 统一持有 UI 生命周期，避免多个 owner 同写渲染包装。每个单元通过检查后继续。

性能预先决策。

实测真实宿主组件的 render 与 invalidate 后 resize。每种宽度 20、90、120，预热后每侧 1000 次交替测量，重复五组。使用相同摘要、主题和宿主版本。新增 p95 不超过 2ms，成功事件到首个包含 divider 的终端 write 不超过 100ms，否则候选不通过。计时区间消费结果并检查宽度和内容；PNG 与视频转换不计。另做 CPU profile，记录负载、核心数、错误数、原始样本、组间范围。此结果只代表 fixture 本地 UI 开销。
