# PR4 兼容修复本地检查

目标是补齐默认工具声明在迁移入口的请求校验。候选产品提交 `d1d17dc9a362546781c458ba58334b589761ea0d`，基线 `47f1ca081ceaf9b267a1254e8eef398dc4b86074`。它包含 PR3 两项协议修复及 PR4 migration 调用点更新。

移植时 session.ts 的 P3/P4 上下文冲突通过保留完整 P4 文件、仅替换请求 validator 的 import 与调用解决。migration.ts 与已实测703c757版本逐字节一致。未修改provider传输或增加依赖。

lint、typecheck、97 项单测通过；P4 主矩阵与来源变化/split-turn 修复共 21 个真实Pi隔离场景通过。日志及逐项目录在本目录，verification.json核对 105 个登记PID全部退出、监听为空。未使用真实provider/auth/history，未恢复benchmark，未操作Redis/MySQL。

本次只证明本地移植检查，尚不支持shipping。最终候选将继承已修复父层，再进行fresh独立验收默认工具迁移路径。PR4曾有FAIL的报告在 `/Users/wangxuyang/.t3/worktrees/compact/t3-0e29fa88-9d620fd7c05f6892/artifacts/shipping/pr4/REPORT.md`。

Prove It Works要求实际Pi产物；Sequence Work into Verifiable Units保留各层边界。新增产品注释及抑制为零。
