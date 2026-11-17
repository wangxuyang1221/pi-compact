# 旧 HEAD 红证据

产品基线为 05d5c9f7e90b2839a4c27a4e9b60ab12603801ac。ordinary Pi 1.5.2 CLI 加载 src/index.ts 及公开 context hook，网络拒绝 preload。

original/probes-* 保存移植的八项探针，original/controls-* 保存无产品扩展原生对照。red.log 记录 duplicate 实际零份、tool-modify 有结果无调用。red-assert.log 是正式回归 runner 修改产品前的失败断言。result.json provenance 固定本次实际来源哈希。

旧 reviewer 目录只读。original 中四个文件来自该目录，hook-probes 和 hook-controls 仅调整 import 与 artifact 路径。audit-probes 原样保留供来源比较，不作为本轮绿断言。
