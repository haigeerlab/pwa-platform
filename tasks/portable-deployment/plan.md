# 实现计划：portable-deployment

依据 [模块规格](../../spec/portable-deployment.md) 与 [ADR-0050](../../docs/adr/0050-portable-deployment.md)。独立分支 `codex/portable-deployment`，不修改原 checkout 的 `cloudflare-test-deployment` 状态。

1. 契约与编译：固定身份不变，新增可移植身份、登记表 v2、计划 v4 与判别模式；验证旧计划语义及无 origin 的新计划。验证：contracts/core 类型与单元测试。
2. Vite 产物：模式校验、路径链接、base 拒绝和域名无关的 worker/manifest/离线页。验证：单次构建文件哈希、负向构建测试。
3. 发布验证：逐源响应、基线、保留、共享发布顺序和覆盖。验证：跨源冒用、缺响应、根子顺序测试。
4. 文档与浏览器：接入、运维、诊断、随包 skill；在两个本地 origin 运行安装、控制、离线、更新测试。
5. 运行类型检查、定向/全仓单元、构建及浏览器测试，记录命令、结果、剩余风险。

## 发布边界

仅交付本地代码与验证，不推送、不发布 npm、不部署生产。
