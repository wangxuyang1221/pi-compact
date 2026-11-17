# P5 数据与边界

目标是在已验收 P4 上交付普通 Pi 扩展的完成分隔线。

Model the Domain 的选择是复用 Checkpoint 的 text/opaque 联合，不增加压缩 owner 或状态机。RendererRegistry 与 Binding 仍只持有显示包装。宿主创建 compactionSummary 后，用 messageId 或最近摘要与 token 边界定位当前 branch 已提交 entry。只有 opaque 从该 entry 提取白名单计数与固定协议名。界面不投影 account、endpoint、model、wire 内容或任意扩展详情。text 仍调用真实原组件 render。展开只读内存，不写 JSONL，不调用模型。

吞吐检查点。

- 调查。阻塞步骤为核对 P4 HEAD、候选和原型。独立工作流由一个 worker 顺序处理。共享状态为同一 registry 与 package manifest。最小分解为先移植再补详情。
- 实现。阻塞步骤为验证真实 message 到 entry 身份。UI 与 owner 分离，但代码与 runner 由同一人串行修改。共享状态只在 UI registry。最小分解为 renderer、详情断言、十 lane。
- 验证。先通过静态检查和真实详情，再运行完整 TUI、风险回归和性能。无并行代理。进程各用隔离 agentDir 与 socket。每个 runner 保留失败与成功输出。
- 交付。先冻结产品提交，再制作包、视觉与证据归档。共享证据索引最后生成，避免自哈希。最小分解为产品提交和证据提交。根独立 review 与用户视觉 gate 保留。

性能预先决策。实际 native 与 head 20/90/120 列 render 与 invalidate+resize 交替各 1000 次，五组且每组预热。paired p95 与两侧 p95 差均须小于等于 2 ms。成功 callback 进入到首个真实 terminal.write 完成为本地观测，须小于等于 100 ms。不包含 PNG、profile、物理屏幕或真实服务延迟。
