# 安装与更新

已发布的 `0.2.3` 提供状态、方法与**可选的默认更新提示 UI**。业务应用决定是否挂载它，以及如何保护未保存的内容；也可以完全自行实现提示。安装按钮仍由业务实现。npm `latest` 指向正式版本；生产接入仍需验证业务宿主。

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

| 变化 | 是否触发新版本 |
| --- | --- |
| 预缓存的 JS、CSS、HTML、离线页、图标 | 会：指纹文件名或 revision 改变，worker 字节随之改变 |
| 平台 worker 的运行时代码或配置 | 会：即使业务资源未变，worker 字节也已改变 |
| 业务 API 返回的数据 | 不会 |
| 未被预缓存规则覆盖的静态文件 | 不会；哪些文件预缓存由 <code>PwaPolicy</code> 的预缓存规则决定 |
| 同一份构建原样重新部署 | 不会：worker 字节相同 |

浏览器在作用域内导航或刷新、调用 <code>register()</code>、定时检查 <code>updateCheck</code> 或手动 <code>checkForUpdate()</code> 时检查 worker；不开定时检查时，长时间停留在同一页面、不刷新的用户看不到新版本。

新 worker 安装完后默认等待。调用 <code>applyUpdate()</code> 只完成 worker 接管与离线版本切换，**不会自动刷新当前页面**。已经运行的旧 JS 仍在内存中，因此发布前就打开的页面通常还需要用户确认刷新；发布后在线刷新过的页面可能已经运行新 JS，只需更新离线版本——完整判断逻辑需要业务自己实现（取一次最新应用壳，比较其入口脚本地址与当前文档是否一致），完整参考写法见 React 示例 [`app.tsx`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/examples-browser-e2e/apps/react/src/app.tsx) 与 Vue 示例 [`app.ts`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/examples-browser-e2e/apps/vue/src/app.ts)。若应用壳导航策略不是 <code>network-first</code>（例如缓存优先），这个判断没有意义，应统一按"页面仍是旧代码"处理。

不点确认时的兜底：该应用所有标签页关闭后，下次打开时新 worker 自动生效，不需要业务处理。

推荐的界面流程：

1. <code>updateWaiting</code> 为真时显示非模态提示，提供“更新”和“稍后”。
2. 用户确认后调用 <code>applyUpdate()</code>，期间禁用重复点击，失败时允许重试。
3. 如果当前页面仍运行旧代码，提示用户在保存工作后刷新；如果已运行新代码，提示可直接消失。
4. 多标签页都应感知 worker 接管，不能只处理点击按钮的标签页。

长期不刷新的页面可显式开启 <code>updateCheck: { intervalMs: 1_800_000 }</code>；默认不开定时检查，最小间隔为 60 秒。框架中的最小写法见[Vue 接入](/start/vue)和[React 接入](/start/react)；上线前应按本页的交互流程处理失败、稍后提醒、未保存内容及多标签页。完整可复制的自绘 React／Vue 实现（含新旧代码判断、状态机与无障碍标注）见[自绘更新提示](/guide/update-prompt-custom)。

## 多标签页

无需任何配置。平台不使用 <code>BroadcastChannel</code> 或其他跨标签消息通道，每个同 scope 标签页都各自监听浏览器原生的 <code>controllerchange</code> 事件。一个标签页确认更新、完成 worker 接管后，其余标签页会各自观察到同一次 <code>controllerchange</code>，从而各自清除自己的更新提示；**没有任何标签页会因此被自动刷新**。这意味着其他标签页里仍在运行的是旧版本前端代码，只是已经交给新 worker 控制——业务要自行决定是否、以及何时提示这些标签页刷新。

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

显示卡片前，组件会重新请求一次当前页面（`no-store`），比较入口脚本地址，判断这个页面是否已经在运行新代码（在线导航走网络优先，页面可能已拿到新代码，而新 worker 仍在等待）。已是新代码时，卡片改为“新版已可离线使用”，点击“更新”后直接消失，不再要求刷新。请求失败、超时（5 秒）或当前地址在服务器上不存在时，按旧页面处理，行为与此前相同。对应文案键 `currentTitle`、`currentBody` 可选；只覆盖了 `readyTitle`/`readyBody` 时沿用你的覆盖。判定依赖入口脚本地址随内容变化，见下方“新旧代码判断依赖入口脚本地址”。决定见 ADR-0046。

`colors` 可直接设置 `primaryButtonBackground`、`primaryButtonText`、`surface`、`text`、`mutedText`、`border`；仅影响当前提示，并优先于祖先元素继承的色值。内置文案覆盖中文（`zh-CN`，默认）与英文（`en`）两种语言，通过 `locale` 选择；不传 `locale` 时行为与此前完全相同。`messages` 仍是逐项覆盖，叠加在所选 `locale` 的内置文案之上；不做浏览器语言自动探测，需要其他语言时用 `messages` 传入完整翻译。宿主也可通过 `--pwa-update-surface`、`--pwa-update-text`、`--pwa-update-muted`、`--pwa-update-border`、`--pwa-update-accent`、`--pwa-update-accent-text`、`--pwa-update-font`、`--pwa-update-radius`、`--pwa-update-shadow` 或 `--pwa-update-z-index` CSS 变量换肤。自定义按钮背景与文字色时，应保持文字清晰可读。业务有未保存的表单时，传入 `reloadPage` 回调，在回调里先确认是否可以离开页面；缺省才直接调用浏览器刷新。提示只消费既有更新状态，不替业务调用 `register()`；长期停留页面仍需自行启用 `updateCheck`。

若业务构建使用 PurgeCSS 且只扫描业务源码，须把 `/^pwa-update-notice/` 加入 safelist，避免从依赖包导入的组件类名被删。首个 Vite 5 项目的真实构建仍需对此做产物和浏览器检查。

## 自绘更新提示的已知边界

- **已打开的旧页面仍运行旧代码**：若按需加载的懒加载 chunk 在部署时已被删除，刷新前触发懒加载会 404；发布时应保留上一版指纹资源，见[部署与发布](/operations/release)。
- **新旧代码判断依赖入口脚本地址**：适用于入口脚本带内容指纹的构建（Vite 默认如此）；入口地址不随内容变化的应用需要改用自己的版本标识。
- 默认组件与自绘参考实现都不会替业务判断表单是否已保存；需要拦截刷新时，由宿主提供 `reloadPage` 或等价逻辑。

## 安装提示的限制

收到 <code>installEligible</code> 后，可以在用户点击安装按钮时调用 <code>promptInstall()</code>。保存的提示只能使用一次；调用后即使用户选择 <code>dismissed</code>，该状态也可能仍为 <code>true</code>。在浏览器再次提供新提示前，下一次调用返回 <code>unavailable</code>。

Vue／React 绑定不会因同页再次收到安装事件而把已为 <code>true</code> 的状态变成新的信号；入门示例首次点击后隐藏按钮，本页不会自动重新显示。需要后续重试的业务，应自行提供可见的再次尝试入口，并处理 <code>unavailable</code> 结果。不能把状态当成仍有可用提示的保证。不同浏览器提供的安装提示能力不同；基础网页体验不能依赖安装事件才能工作。当前的发布验收目标与证据边界见[兼容性](/reference/compatibility)。
