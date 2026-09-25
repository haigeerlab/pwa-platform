# 安装与更新

平台提供状态和方法，不提供按钮、弹窗或自动刷新。业务应用决定何时展示安装操作、何时提示更新，以及如何保护用户尚未保存的内容。

## 页面侧可用能力

| 状态 | 含义 |
| --- | --- |
| <code>registered</code> | worker 已注册 |
| <code>installEligible</code> | 当前浏览器允许弹出安装提示 |
| <code>installed</code> | 应用已安装 |
| <code>updateWaiting</code> | 新 worker 下载完成，等待确认 |

| 方法 | 用途 |
| --- | --- |
| <code>register()</code> | 应用启动后主动注册 worker |
| <code>promptInstall()</code> | 在用户操作中显示浏览器安装提示 |
| <code>applyUpdate()</code> | 用户确认后让等待中的 worker 接管 |
| <code>checkForUpdate()</code> | 主动检查新 worker |
| <code>logout()</code> | 执行平台管理的登出清理与注销 |

Vue 的状态装在 <code>Ref</code> 中，React 的状态是快照值；两端行为序列由测试保证一致。

## 更新为什么需要两步

浏览器根据 worker 脚本的字节判断是否有新版本。平台把预缓存清单注入脚本，已预缓存资源或 worker 代码变化会触发新版本；业务 API 数据变化、未预缓存文件变化和同一构建原样重部署不会触发。

新 worker 安装完后默认等待。调用 <code>applyUpdate()</code> 只完成 worker 接管与离线版本切换，**不会自动刷新当前页面**。已经运行的旧 JS 仍在内存中，因此发布前就打开的页面通常还需要用户确认刷新；发布后在线刷新过的页面可能已经运行新 JS，只需更新离线版本。

推荐的界面流程：

1. <code>updateWaiting</code> 为真时显示非模态提示，提供“更新”和“稍后”。
2. 用户确认后调用 <code>applyUpdate()</code>，期间禁用重复点击，失败时允许重试。
3. 如果当前页面仍运行旧代码，提示用户在保存工作后刷新；如果已运行新代码，提示可直接消失。
4. 多标签页都应感知 worker 接管，不能只处理点击按钮的标签页。

长期不刷新的页面可显式开启 <code>updateCheck: { intervalMs: 1_800_000 }</code>；默认不开定时检查，最小间隔为 60 秒。框架中的最小写法见[Vue 接入](/start/vue)和[React 接入](/start/react)；上线前应按本页的交互流程处理失败、稍后提醒、未保存内容及多标签页。

## 安装提示的限制

仅当 <code>installEligible</code> 为真时显示安装按钮，并在按钮点击中调用 <code>promptInstall()</code>。不同浏览器提供的安装提示能力不同；基础网页体验不能依赖安装事件才能工作。当前发布保证范围见[兼容性](/reference/compatibility)。
