---
layout: home
hero:
  name: PWA Platform
  text: 为业务应用接入 PWA
  tagline: 声明应用身份与缓存策略，由平台生成安装、离线和更新所需的基础设施。
  actions:
    - theme: brand
      text: 选择接入包
      link: /start/choose
    - theme: alt
      text: 了解平台
      link: /introduction/
features:
  - title: 按技术栈接入
    details: 为 Vite + Vue 或 React 选择公开包，按步骤配置、注册并验证。
    link: /start/choose
    linkText: 查看接入路径
  - title: 明确缓存边界
    details: 用声明式策略管理离线资源；私有数据、写入和未分类请求默认不缓存。
    link: /architecture/security
    linkText: 理解安全模型
  - title: 带着发布证据上线
    details: 核对构建产物、线上响应头、更新行为、旧资源保留和恢复流程。
    link: /start/checklist
    linkText: 查看上线检查
---

PWA Platform 是供多个业务应用复用的 PWA 基础设施。业务团队声明应用身份和缓存意图，平台生成 manifest、Service Worker 与离线页，并在构建时核对产物。安装按钮、更新提示和业务数据仍由应用负责。

::: warning 当前发布状态
Vite、Vue 和 React 接入包已发布为 **0.1.0-beta.1**。这是预发布版本，不代表业务应用已通过生产发布验收。Nuxt 和可选功能包仍是工作区私有包。
:::

## 从这里开始

| 你想完成的事 | 阅读 |
| --- | --- |
| 判断它是否适合你的项目 | [项目介绍](/introduction/)与[能力边界](/introduction/capabilities) |
| 知道该安装哪些包 | [选择接入包](/start/choose) |
| 在现有项目跑通 | [Vue 接入](/start/vue)或[React 接入](/start/react) |
| 理解配置为什么这样写 | [身份与策略](/guide/configuration) |
| 准备发布业务应用 | [上线前检查](/start/checklist)与[部署发布](/operations/release) |

## 一句话理解链路

~~~text
应用身份 + 安装信息 + 业务策略 + 构建产物
  → 可审计的 PwaPlan
  → manifest + Service Worker + 离线页 + 构建校验报告
~~~

平台的核心约束是：**私有数据、写操作、流媒体和未分类请求默认不缓存**。需要公共读取缓存时，业务必须显式声明并对响应的公共属性负责。
