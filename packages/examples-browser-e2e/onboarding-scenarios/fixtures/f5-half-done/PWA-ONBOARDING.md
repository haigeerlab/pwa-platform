---
skillVersion: 0.2.3
packageVersion: 0.2.3
language: zh-CN
profile: shell-offline-update
existingPwa: false
gates:
  A: done
  "0": done
  "1": in-progress
  "2": skipped
  "3": pending
  "4": pending
  "5": skipped
  "6": pending
---

## 决策记录

- 2026-09-30 关卡 0：语言 zh-CN，默认档；线上还不是 PWA；生产 origin https://app.example.com，根路径部署，环境 development / production
- 2026-09-30 G2 身份字段：origin=https://app.example.com，scope=/，serviceWorkerUrl=/sw.js，manifestId=/，environment=production，cacheNamespaceSeed=r1（人确认）

## 证据

- 关卡 A：无冲突，Vite 8、Vue 3.5、Node 22
- 关卡 1：已写 pwa.config.ts；尚未接入插件与页面绑定，尚未构建
