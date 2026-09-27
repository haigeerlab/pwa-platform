# Todo：stable-release-qualification

- [x] T1 冻结十包候选与浏览器/设备/测试槽现状，建立验收矩阵
- [ ] T2 完成 Chrome 桌面 N/N-1、Mac Safari、Android Chrome、iPhone Safari 的 Vue/React 安装与运行验证
  - [x] Chrome 154／153 全仓浏览器回归和 Vue／React 原生安装窗口
  - [x] Mac Safari 18.6 Vue／React 添加到程序坞和基础运行
  - [x] Android 16 + Chrome 153 单机 Vue／React 安装、独立窗口和基础运行
  - [x] iPhone 16 Pro + iOS 27 Vue／React 主屏幕安装、独立窗口和基础运行
  - [ ] 取得第二台 Android，并按 Google Play 两机轮换完成 N/N-1
  - [ ] 完成 Apple 发布通道裁决；在此之前 iPhone 继续标为渐进兼容
- [ ] T3 完成浏览器页和安装窗口的真实 v1→v2、稍后再提醒、双标签与离线更新验证
  - [x] 桌面 Chrome React 真实 30 分钟重提醒、双标签、确认接管和显式刷新
  - [x] Android Vue 安装窗口分步更新与离线刷新；Android React 更新接管和显式刷新
  - [x] iPhone Vue／React 更新提示、确认接管和显式刷新已有真机记录
  - [ ] Android React 以旧 v1 DOM 保持到显式刷新重新取证
  - [ ] iPhone 安装窗口补齐旧 DOM、双窗口／多标签与离线时已下载更新的矩阵
- [ ] T4 完成中英文默认离线页的真机、桌面、视觉和恢复联网验证
  - [x] Android、iPhone 的 Vue／React 英文离线页、断网冷启动与最终自动联网探针
  - [x] Chrome 154 Vue／React 安装窗口离线与自动恢复
  - [x] Chrome 153 本地真实浏览器验证中文默认离线页、亮／暗主题、键盘焦点、窄屏与 WCAG AA 文本对比度
  - [x] 中文构建在 Chrome 154 桌面安装窗口完成原生安装、离线页与手动恢复实测
  - [x] 中文构建在 Android 安装窗口完成 WebAPK 安装、离线页与自动恢复实测
  - [ ] 中文构建在 iPhone 安装窗口的离线页实测
  - [x] 补齐桌面亮／暗主题、键盘、文本对比度和窄屏记录；完整 WCAG 门禁另立 proposal
  - [x] 接受并记录 iPhone 恢复联网后短暂 `not registered` 的渐进兼容限制；不计作 Apple 通道通过
- [ ] T5 完成入口恢复的双 Origin、清单状态、离线区别、跳转安全和中英文/UI 验证
  - [x] Chrome 154／153 当前 Origin 单独失效、备用 Origin 可达的自动化场景
  - [x] Android／iPhone 迁移清单、点击前不跳转、跨 Origin 返回路径和撤回
  - [x] Android 整机断网与入口故障不混淆
  - [ ] Android／iPhone 当前 Origin 单独失效、备用 Origin 仍可达的真机场景
  - [ ] 真实 DNS／证书故障、非法／过期清单和中文 UI 的移动端矩阵
- [x] T6 核对 `/` 与 `/m/`、缓存拒绝、恢复 worker、CSP 与可选 UI 个性化，修复并复测缺陷
  - [x] 桌面 Chrome N/N-1 自动化覆盖 scope 隔离、缓存拒绝和恢复路径
  - [x] 十包 `0.1.0` 分发、独立 Vite 5 消费和最终质量门禁
  - [x] 逐项对账严格 CSP、恢复 worker 和默认更新 UI 个性化的最新候选证据
  - [x] 未发现运行时或公开契约缺陷；严格 CSP 的浏览器证据缺口已补测试并重跑受影响矩阵
- [x] T7 将入口恢复包纳入正式分发并完成十包干净候选、审计、pack、独立消费和文档门禁
- [x] T8 记录发布通道与未取得证据，满足 `desktop` 门禁后发布 npm 正式版并读回验证

## 2026-09-27 生产缺口闭合

- [x] R1 对账现有证据并把 T2–T6 拆成可验证子项
- [ ] R2 补齐现有设备可执行的更新、离线、语言和界面场景
  - [x] Android 中文安装失败定位为 manifest 图标实际尺寸不符，修正夹具并完成实机安装／离线／自动恢复
  - [x] 将图标存在性、MIME 与实际尺寸校验加入 Vite 构建，避免业务接入重复踩坑
- [ ] R3 补齐 Android／iPhone 入口恢复的单 Origin 故障分支
- [x] R4 复核交叉边界并关闭仓库内可验证缺口
- [ ] R5 形成 Apple 发布通道 Spec／ADR 并经项目所有者评审
- [ ] R6 取得第二台 Android 后完成 N/N-1 两机门禁
