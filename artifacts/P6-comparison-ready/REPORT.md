# Comparison 可审查执行候选

结论：协调者离线检查 PASS，等待 fresh 独立审查。没有真实 provider 请求、真实 auth/history 读取或有效 real grant；没有压缩效果优势证据。产品 src 与已验 P6 包未改。

实现提交：06a270c60c3b00ed348690a358c6fcdf9376c9e3。上游 comparison 候选 f8b947db6777891bb2c17e7d3ad00df07626ab03 已合入，同时保留 e4c6bb4 的 P6 本地隔离验收记录。原候选报告、248 次 fixture 与全部旧冻结文件仍在 artifacts/P6-comparison，未被覆盖。本目录保存当前可执行版本的冻结产物和协调者复跑。

## 完成情况

在原候选的同模型成对调度、实际安装、文件工具、macOS 沙箱评分和持久预算基础上，协调者修正真实路径准备：移除无条件阻止执行的代码常量，改为明确 grant 校验；缺少授权、旧 schema、过期、错误目标/预算和真实模式中的 fixture fault 均拒绝。真实入口先校验授权结构，再核对全部冻结绑定，之后才安装、启动 worker 和读取指定凭据。默认 plan/help 及所有 invalid template 仍无活动授权。

原候选 real runtime 也会加载拒绝所有 socket 的 fixture preload，现仅 offline-fixture 加载。real 使用已独立复审的 networkBoundary 私有 HTTPS sender、restrictedCredentials、同一 reserve-before-send 账本；本轮没有激活或实际验证真实网络分支。今后无需为一次有效授权修改源代码或扩大 profile：只需在独立审查后，由根依据用户明确授权填写匹配的 grant。没有给出或保存可生效的 real grant。

共同约束仍为同模型 Terra/Luna、Pi 默认压缩切分策略、off/none、每请求1000输出上限、SSE、顶层 function 工具。不能将这种受约束比较外推为不受限默认生产配置。8/56/248 是提案硬上限，活动预算为零。

## Prove It Works

- 完整 quality-observation 复跑：4 pilot lane + 8 正式 lane，56 fixture dispatch；双方真实 installed Pi/插件、切分与编码、文件修改、7/8业务用例和保护文件检查通过。首条续做实际 system/developer/tools hash 成对一致。见 preflight-run.json、preflight-ledger.json、preflight.json。
- 12 组预算/评分/OS沙箱安全验证通过，增加5种无效real grant的无副作用CLI检查；缺少授权、unauthorized、expired、越额、错误target和fixture注入不启动宿主/worker、不读取auth、不联网。证据 security-evidence.json、security.log。
- 7类实际安装链路故障复跑通过：cap、缺usage、HTTP、缺opaque、隐藏轮次、正式回退和checkpoint补交。保留失败分母/assigned arm，不补抽、不退款。见 fault-evidence.json、faults.log。
- lint/typecheck通过。上游74项测试、14项旧隔离回归与20项旧执行器故障仍为历史证据；src和shared helpers没有变化，不将它们冒称协调者此次重跑。
- 原候选254个公开文件SHA全部重算通过。当前三个profile的verifyFrozen通过；包SHA仍209888cd3f050ffe6d3a8932c15d25636d52d83919de0021cf9ce2c611d22c8d，旧证据完整。
- 105个登记PID全部退出，没有监听端口；本次流程cleanup均记录trackedSockets=0。见coordinator-cleanup.json。OS沙箱及评分服务进程包含在内，无残留后台服务。

## Data与限制

所有结果为fixture预置摘要、opaque、tool call与参考实现，只证明测量路径和业务评分确实执行。statisticalComparison=null；没有任何真实模型质量、token压缩率或耗时优势结论。更小的wire bytes不等于更少的服务端token；没有无压缩服务输入对照，因此不计算相对原始历史的服务token压缩百分比。

当前freeze runner绑定：ce2c617fff862bf971766de479689f334635df290ae5db1f3d70a03387fbe2ef。完整绑定见freeze-manifest.json，包括数据、工具、评分、host/source、包、调度及真实编码preflight。原候选报告的模型静态资格、cap未知、固定工具兼容限制和macOS沙箱限制继续成立。真实授权/服务、用户视觉和完整P6均pending。

离线复跑使用新的私有目录：

```sh
node scripts/comparison.mjs plan
node scripts/comparison/verify.mjs scratch/comparison/new-review-security
node scripts/comparison.mjs offline --profile quality-observation --out scratch/comparison/new-review-quality
node scripts/comparison/verify-runs.mjs scratch/comparison/new-review-faults
```

真实入口为 `node scripts/comparison.mjs real --grant /absolute/path/to/grant.json`，可加 `--resume`，但只能在根记录新的明确授权且绑定当前冻结产物后使用。此命令示例、plan与invalid template都不是授权。独立审查不得发真实请求或创建有效realgrant。
