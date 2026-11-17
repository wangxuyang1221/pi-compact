# 失败与修复记录

本文件记录此次 P4 上的 P5 实现运行。原候选的 P1 证据保留在既有 P5-development、P5-symlink-fix 以及 history 目录，不算组合版本验收。

1. 首次 `pnpm typecheck` 报 Pi 根包没有导出 Text。输出见本次工具会话。改为精确版本 pi-tui 的 Text。宿主完成组件身份仍来自根包实际类。
2. `integrated.log` 的 remote 详情等待超时。真实 error.txt 显示原 placeholder。安装源码表明 compaction_end 使用当前时间创建显示消息，无法匹配落盘 timestamp。改为 messageId 优先，否则最近的摘要与 token 边界。
3. 同一轮 fallback 等待了错误的 fixture 文案。P4 preload 返回 `Readable continuation.`，原探针期望另一个字符串。只修探针。
4. 同一轮 persist-fail 用了没有实现的 append 故障名，所以实际压缩成功。只改为已经存在的 partial 故障，最终确实触发 disk-fault-fired 且零成功。
5. `integrated-final.log`、`integrated-final2.log` 先后在恢复探针第 21 行与第 33 行读取了新运行目录下不存在的 session.jsonl。恢复实际使用旧 sessionFile。参数贯通后 `integrated-green.log` 通过。冻结后的 ten-lanes-final.log 及 package-integrated.log 又各完整通过。
6. `lifecycle-final.log` 的新增断言误以为重新启用时原型应直接等于 peer。重新启用后本扩展应包在 peer 外，禁用才恢复 peer 身份。改为四次状态分别 false/true/false/true，并验证 peer 调用增加以及旧实例闭包失活。lifecycle-green.log 与冻结后 lifecycle-freeze.log 通过。
7. `audit-run.log` 因 git ls-files 超过默认 1 MiB 输出缓冲而 ENOBUFS。改为 64 MiB 输出缓冲。audit-final.log、audit-final2.log 通过。没有修改产品，也没有把失败运行改写为通过。

第一次失败工具输出没有伪造为独立原始日志。上述文字是实现者根据本次命令记录的说明。所有已存在的红日志和原始目录保持原样。

8. 首次 archive-verify.log 发现 macOS tar 自动插入未在 manifest 的 AppleDouble `._auth.json`。初始 archive-initial.tar.gz 和 archive-initial.json 留在本地，红日志入交付。最终归档设置 COPYFILE_DISABLE=1，并排除当前输入列表、输出和所有 tar.gz。逐成员复核通过后才接受。
