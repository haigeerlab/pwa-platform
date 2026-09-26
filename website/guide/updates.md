# 安装与更新

已发布的 `0.1.0` 提供状态、方法与**可选的默认更新提示 UI**。业务应用决定是否挂载它，以及如何保护未保存的内容；也可以完全自行实现提示。安装按钮仍由业务实现。npm `latest` 指向正式版本；生产接入仍需验证业务宿主。

## 页面侧可用能力

| 状态 | 含义 |
| --- | --- |
| <code>registered</code> | 本次绑定观察到注册成功；调用 <code>logout()</code> 后不会自动变回 <code>false</code> |
| <code>installEligible</code> | 本页收到过可用的安装提示事件；提示消费后仍可能为 <code>true</code> |
| <code>installed</code> | 本页收到过 <code>appinstalled</code> 事件；不是设备上的持久安装状态 |
| <code>updateWaiting</code> | 新 worker 下载完成，等待确认 |

| 方法 | 用途 |
| --- | --- |
| <code>register()</code> | 应用启动后主动注册 worker；失败时拒绝 Promise，修复后可重试 |
| <code>promptInstall()</code> | 在用户操作中显示一次性提示；返回 <code>accepted</code>、<code>dismissed</code> 或 <code>unavailable</code> |
| <code>applyUpdate()</code> | 用户确认后让等待中的 worker 接管；成功返回 <code>true</code>，没有等待版本返回 <code>false</code>，接管失败时拒绝 Promise |
| <code>checkForUpdate()</code> | 主动检查；返回 <code>update-available</code>、<code>up-to-date</code> 或 <code>unavailable</code>，仍以 <code>updateWaiting</code> 决定是否提示接管 |
| <code>logout()</code> | 执行平台管理的登出清理与注销 |

Vue 的状态装在 <code>Ref</code> 中，React 的状态是快照值；两端行为序列由测试保证一致。

业务登出时，先结束自己的会话，再调用 <code>await pwa.logout()</code>。它只清理平台管理的状态并注销本应用的 worker，不会替应用退出后端会话或删除自建缓存。检查返回的布尔值：<code>true</code> 表示注销成功；<code>false</code> 可能是没有注册、当前页尚未受控，或清理／注销未完成，不能当作平台清理成功。若预期已有注册却返回 <code>false</code>，先按[浏览器核验](/start/checklist#首次接入的浏览器核验)检查控制状态。其他已打开的标签页仍可能受旧 worker 控制，直到关闭。

同一页面下次重新登录后，若需要恢复安装、离线和更新能力，请再次调用 <code>pwa.register()</code>。Vue 示例中的 <code>onMounted</code> 与 React 示例中的 <code>Registrar</code> 只负责组件挂载时注册，不会因登录状态变化而自动重注册。

## 更新为什么需要两步

浏览器根据 worker 脚本的字节判断是否有新版本。平台把预缓存清单注入脚本，已预缓存资源或 worker 代码变化会触发新版本；业务 API 数据变化、未预缓存文件变化和同一构建原样重部署不会触发。

新 worker 安装完后默认等待。调用 <code>applyUpdate()</code> 只完成 worker 接管与离线版本切换，**不会自动刷新当前页面**。已经运行的旧 JS 仍在内存中，因此发布前就打开的页面通常还需要用户确认刷新；发布后在线刷新过的页面可能已经运行新 JS，只需更新离线版本。

推荐的界面流程：

1. <code>updateWaiting</code> 为真时显示非模态提示，提供“更新”和“稍后”。
2. 用户确认后调用 <code>applyUpdate()</code>，期间禁用重复点击，失败时允许重试。
3. 如果当前页面仍运行旧代码，提示用户在保存工作后刷新；如果已运行新代码，提示可直接消失。
4. 多标签页都应感知 worker 接管，不能只处理点击按钮的标签页。

长期不刷新的页面可显式开启 <code>updateCheck: { intervalMs: 1_800_000 }</code>；默认不开定时检查，最小间隔为 60 秒。框架中的最小写法见[Vue 接入](/start/vue)和[React 接入](/start/react)；上线前应按本页的交互流程处理失败、稍后提醒、未保存内容及多标签页。

## 可选的默认更新提示

在使用 `createPwa()` 的 Vue 应用根组件中挂载：

```vue
<script setup lang="ts">
import { PwaUpdateNotice } from "@pwa-platform/vue/ui";
import "@pwa-platform/vue/update-notice.css";
</script>

<template>
  <RouterView />
  <PwaUpdateNotice
    position="bottom-right"
    :colors="{ primaryButtonBackground: '#006e52', primaryButtonText: '#ffffff' }"
  />
</template>
```

React 应用把组件放在 `PwaProvider` 内：

```tsx
import { PwaUpdateNotice } from "@pwa-platform/react/ui";
import "@pwa-platform/react/update-notice.css";

<PwaProvider config={config}>
  <App />
  <PwaUpdateNotice
    position="bottom-right"
    colors={{ primaryButtonBackground: "#006e52", primaryButtonText: "#ffffff" }}
  />
</PwaProvider>
```

挂载组件就是显示开关；不挂载时，原有 `usePwa()` 和自定义界面照常可用。默认是右下角非模态卡片，另可选 `bottom-center`、`top-right`、`top-center`。移动端会留出边距并适配安全区。等待状态持续约 100 ms 后才显示卡片，恢复 worker 的短暂波动不会误报“更新已完成”。点击“稍后”只隐藏本页提示，30 分钟后若仍有等待版本则再次提醒；点击“更新”先完成 worker 接管，随后由用户**再次点击**“刷新页面”。更新失败可重试，多个标签页各自显示接管后的状态。

`colors` 可直接设置 `primaryButtonBackground`、`primaryButtonText`、`surface`、`text`、`mutedText`、`border`；仅影响当前提示，并优先于祖先元素继承的色值。`messages` 可覆盖中文默认文案。宿主也可通过 `--pwa-update-surface`、`--pwa-update-text`、`--pwa-update-muted`、`--pwa-update-border`、`--pwa-update-accent`、`--pwa-update-accent-text`、`--pwa-update-font`、`--pwa-update-radius`、`--pwa-update-shadow` 或 `--pwa-update-z-index` CSS 变量换肤。自定义按钮背景与文字色时，应保持文字清晰可读。业务有未保存的表单时，传入 `reloadPage` 回调，在回调里先确认是否可以离开页面；缺省才直接调用浏览器刷新。提示只消费既有更新状态，不替业务调用 `register()`；长期停留页面仍需自行启用 `updateCheck`。

若业务构建使用 PurgeCSS 且只扫描业务源码，须把 `/^pwa-update-notice/` 加入 safelist，避免从依赖包导入的组件类名被删。首个 Vite 5 项目的真实构建仍需对此做产物和浏览器检查。

## 安装提示的限制

收到 <code>installEligible</code> 后，可以在用户点击安装按钮时调用 <code>promptInstall()</code>。保存的提示只能使用一次；调用后即使用户选择 <code>dismissed</code>，该状态也可能仍为 <code>true</code>。在浏览器再次提供新提示前，下一次调用返回 <code>unavailable</code>。

Vue／React 绑定不会因同页再次收到安装事件而把已为 <code>true</code> 的状态变成新的信号；入门示例首次点击后隐藏按钮，本页不会自动重新显示。需要后续重试的业务，应自行提供可见的再次尝试入口，并处理 <code>unavailable</code> 结果。不能把状态当成仍有可用提示的保证。不同浏览器提供的安装提示能力不同；基础网页体验不能依赖安装事件才能工作。当前的发布验收目标与证据边界见[兼容性](/reference/compatibility)。
