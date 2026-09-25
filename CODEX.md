# Codex 说明

遵循 `AGENTS.md` 和 `CLAUDE.md`。本仓库由 Spec Guard 管理。

- 不要创建第二份任务列表；远端初始化后，以 GitHub Issues 为任务事实源。
- 修改模块前先阅读其 spec 与 plan。
- 不得仅凭静态产物断言来跳过 Service Worker 行为的浏览器 E2E 校验。
- 除非模块规格明确要求 fixture，否则不要将生成的 Service Worker 产物提交到源码仓库。
