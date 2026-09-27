---
pageClass: platform-test-matrix
---

# 跨平台测试证据

本页解释首页 PC／Android／iPhone 清单的证据等级、设备范围和剩余限制。核查日期为 **2026-09-27**，平台代码基线为 `7f5d0f8a4eb93c7bd907a364d1f09f853bf01a99`，npm 基线为十个公开包 `0.1.0`。

## 怎样理解状态

| 等级 | 含义 | 能否写成生产保证 |
| --- | --- | --- |
| E1 实现 | 源码中存在相应能力 | 不能；尚未证明行为正确 |
| E2 自动化 | 单元、构建或真实浏览器自动化通过 | 只能声明对应环境和场景通过 |
| E3 真机观察 | 在记录的实体设备上完成操作并观察结果 | 只能声明该设备、版本和场景的结果 |
| E4 发布门禁 | 满足预先定义的版本、设备、场景和留痕要求 | 可以在门禁声明的通道内作为发布依据 |

首页的 **●** 对应 E4，**◐** 对应 E3 或不完整的 E4，**○** 表示没有足以形成该平台结论的记录。它们不是完成度百分比。

## 测试环境

| 平台 | 已记录环境 | 当前证据定位 |
| --- | --- | --- |
| PC | macOS；Chrome 154.0.8037.57 与 153.0.8010.53 | `desktop` 发布通道；N/N-1 最终各 228/228，0 失败、0 跳过 |
| Android | 实体 23127PN0CC；Android 16；Chrome 153.0.8010.53 | 单设备 E3；不满足 Android N/N-1 两机门禁 |
| iPhone | 实体 iPhone 16 Pro；iOS 27；Safari 与主屏幕网页 App | E3；未定义独立 iPhone 发布通道，保留注册状态差异 |

## 逐功能证据

| 功能 | PC | Android | iPhone | 证据与限制 |
| --- | --- | --- | --- | --- |
| Vue／React 包消费、构建、注册 | E4 | E3 | E3 | PC 含 Vite 5／Vue 3.4／React 19.3 独立消费；手机验证公开 drill，不代表任意宿主 |
| 原生安装与 standalone | E4 | E3 | E3 | Chrome 原生安装、Android WebAPK、iOS 添加到主屏幕均有记录 |
| 用户确认更新 | E4 | E3 | E3 | waiting → 用户接管 → 旧 DOM 保持 → 显式刷新语义已验证；移动矩阵未闭合 |
| 离线冷启动 | E4 | E3 | E3 | Vue／React 安装窗口均有结果；PC 还包含 N/N-1 自动化 |
| 离线页 | E4 | E3 | E3 | Android、iPhone 均有中英文安装窗口实证；移动端仍是单设备观察 |
| 联网自动恢复 | E4 | E3 | E3 | 最终脚本先做同源 `HEAD` 探针，避免早到 `online` 事件触发错误刷新 |
| 公共读取缓存 | E2／E4 | 未验证 | 未验证 | PwaPolicy v3 准入、容量、TTL 与浏览器场景通过；没有手机专项行为记录 |
| 缓存安全拒绝 | E2／E4 | 未验证 | 未验证 | 私有、带授权、写入、流媒体和未分类请求的拒绝路径通过自动化 |
| 恢复 worker | E4 | 未验证 | 未验证 | PC 有 worker 清理和单 Origin 故障路径；手机没有对应完整故障演练 |
| 入口恢复 | E4 | E3 | E3 | 移动端迁移清单、恢复页、用户确认跳转有实证；真实 DNS／证书故障未执行 |
| 中英文 | E2／部分视觉 | 中英文 E3 | 中英文 E3 | 文案覆盖 API 与中英文页面通过；完整视觉和设备矩阵待补 |
| 亮／暗主题 | E2／部分视觉 | E3 | E3 | 深色窄屏页面可读；没有完整设计系统视觉回归 |
| 可访问性 | 部分 | 部分 | 部分 | 语义和无水平溢出有检查；没有完整 WCAG 2.1 AA、axe 和辅助技术门禁 |

## 已知移动端限制

### Android

- 当前只有一台 Android 实体设备和 Chrome 153，不能满足现有 Android N/N-1 两机规则。
- Vue／React 安装、独立窗口、离线冷启动、离线页自动恢复和入口恢复均有实证，但不是完整手机通道门禁。
- 公共读取缓存、缓存安全拒绝和恢复 worker 没有手机专项记录。

### iPhone

- Vue／React 的主屏幕安装、离线冷启动、两步更新、离线页最终自动恢复和入口恢复已有实证。
- 中文安装窗口对照中，不设置 `networkTimeoutSeconds` 时物理断网冷启动约 60 秒才回退；设置为 5 秒后约 5 秒显示缓存或离线页。具体数值只适用于本次设备与场景，但生产接入不能依赖 Safari 自行超时。
- 断网恢复后，页面曾短暂显示 `not registered`，但 active worker 与 controller 仍存在；结束网页 App 后重新打开恢复。当前不能把它描述为稳定通过，也不能在没有进一步定位时断言是 WebKit 缺陷。
- Safari 的 `navigator.onLine` 在真实断网时可能仍为 `true`，因此离线页使用真实网络探针而不是只依赖在线事件。

## 对接入项目的意义

平台证据回答的是“这套库在记录的环境里做过什么测试”，不是“你的业务站点已经通过”。接入方仍须验证自己的生产 identity、Origin、mount path、scope、响应头、公共响应分类、旧资源保留、v1→v2 更新、回滚、离线和事故恢复。执行顺序见[上线前检查](/start/checklist)，完整平台判定见[生产就绪审核](https://github.com/haigeerlab/pwa-platform/blob/main/docs/product/production-readiness-audit.md)。

## 原始记录

- [0.1.0 发布记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/stable-release-qualification/release-0.1.0.md)
- [正式版验收记录](https://github.com/haigeerlab/pwa-platform/blob/main/tasks/stable-release-qualification/verification.md)
- [浏览器矩阵规则](https://github.com/haigeerlab/pwa-platform/blob/main/docs/architecture/browser-matrix.md)
- [桌面发布通道 ADR](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0030-desktop-release-channel.md)
