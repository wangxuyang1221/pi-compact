# P2 data shapes and execution checkpoint

目标是在普通 Pi 扩展中提供按 active model 窗口计算的百分比原生压缩，保留 P1 生命周期和安全屏障。

- `ThresholdPolicy` 使用一个有限百分比，默认 90。触发 token 为 `ceil(contextWindow * percent / 100)`，包含等号。
- `ProjectSettings` 是读取结果的判别联合。合法结果包含 percent 和 default/project 来源，错误包含文件路径与英文说明。损坏文件使请求停止；合法命令可显式修复。
- 文件固定为 session cwd 下 `.pi/pi-compact.json`。同步原子 rename 写入，无异步写回或进程全局配置缓存。多个会话在判断和命令时读取当前项目文件。
- 宿主 adapter 为每个 managed session 提供 settings facade，只有原生 threshold 判断期间临时映射 reserve。原生摘要 preparation 的输出预留和 keepRecentTokens 保持原值。原生估算与投影仍是 token 权威。
- 容量屏障独立使用 model.maxTokens。策略阈值只启动压缩，不作为成功后安全容量的上限。

吞吐检查点。

1. Blocking first steps. 读既定 synthesis、P2 合同和实际安装源码；以单元边界验证配置和阈值后才运行 live。
2. Independent workstreams. 本任务是唯一 P2 owner，不分派。P5 UI owner 独立，不改其文件。
3. Shared mutable state. session 继续独占 controller/manager/file；项目配置用同步读取与原子替换，不改共享 SettingsManager。
4. Smallest safe decomposition. 单 owner 顺序完成 policy/settings、adapter、runner、证据。根协调者随后独立验收。

性能决策。固定 1000/10000 条消息，baseline/head 各 30 次交替；新增判断 p95 >10ms、配置响应 p95 >100ms 或成功到恢复 p95 >500ms 均失败。只判断本地开销，不从不同策略推导压缩速度或质量改善。
