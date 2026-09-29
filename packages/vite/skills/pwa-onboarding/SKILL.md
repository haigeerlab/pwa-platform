---
name: pwa-onboarding
description: "把现有 Vite + Vue / React 项目接入 PWA Platform 的分步引导：可行性与冲突检测、采访、配置并检查、服务端与浏览器验证、上线后排障。适用于接入 PWA、Service Worker、离线页、安装、更新提示。Guides a Vite + Vue/React project through onboarding to PWA Platform step by step. (Skeleton: gate content is delivered by later tasks.)"
metadata:
  version: "0.2.3"
---

# PWA 接入引导（骨架）

> **这是骨架，关卡内容尚未提供。** 在后续任务交付各关卡的引用文件之前，不要据此执行接入。

## 调用

- Claude Code：`/pwa-onboarding`
- Codex：`$pwa-onboarding`

## 关卡索引

| 关卡 | 内容 | 引用文件 |
| --- | --- | --- |
| A | 可行性与冲突检测 | 待交付 |
| 0 | 采访 | 待交付 |
| 1 | 配置并检查 | 待交付 |
| 2 | 公共/私有接口分类 | 待交付 |
| 3 | 服务端核对 | 待交付 |
| 4 | 浏览器验证 | 待交付 |
| 5 | 发布门禁（可选） | 待交付 |
| 6 | 上线后排障 | 待交付 |

## 通用规则

- 不要把本 skill 放进 `public/`、`src/`、`dist/`。
- 不自动删除依赖或文件；不推送、不部署、不切换 worker。
