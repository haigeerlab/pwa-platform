# 自绘更新提示

本页给出可复制的 React／Vue 自绘更新提示参考实现（两端共用同一个页面新旧判断函数，各自包含完整的状态机与渲染）：判断当前页面是否已是新代码、状态流程和无障碍标注。更新的触发条件、为什么需要两步以及多标签页行为见[安装与更新](/guide/updates)；只想用平台提供的默认组件时，也看那一页即可。

平台负责发现新版本、让新 worker 等待、在用户确认后完成接管；界面由宿主决定（[ADR-0005](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0005-update-prompt-and-recovery-worker.md)、[ADR-0013](https://github.com/haigeerlab/pwa-platform/blob/main/docs/adr/0013-client-facade-and-page-side-lifecycle-events.md)）。仓库内可运行的完整示例见 React [`app.tsx`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/examples-browser-e2e/apps/react/src/app.tsx) 与 Vue [`app.ts`](https://github.com/haigeerlab/pwa-platform/blob/main/packages/examples-browser-e2e/apps/vue/src/app.ts)。

## 在线刷新与“页面已是新代码”

示例的应用壳导航是 `network-first`。在线时，普通刷新会直接从网络取得新的 HTML 与入口脚本，**页面已经运行新代码**，而新 worker 仍在等待；它未接管前，离线缓存仍是旧版本。因此提示前应先判断当前页面是否已是新代码：取一次最新应用壳，比较其入口模块脚本与当前文档的入口脚本。

- 相同：页面已是新代码，文案为 `An update is ready for offline use`；接管后横幅直接消失，不提示刷新。
- 不同、请求失败、无法解析或 5 秒内未完成：按旧代码处理，走下表的完整流程。判定完成前不显示横幅，超时保证请求挂起时横幅仍会出现。
- 两种情况都**仍需用户点击 Update**，平台和示例都不自动接管。

若应用壳改为缓存优先，刷新会继续得到旧版本，此判断总是得到“不同”，行为退回下表。

## 状态流程

| 阶段 | 平台状态 | 推荐界面 |
|---|---|---|
| 新版本已就绪 | `updateWaiting` 变为 `true` | 先判断页面是否已是新代码，结果出来前不显示；随后顶部非模态横幅：`A new version is available`（旧代码）或 `An update is ready for offline use`（新代码），按钮 **Update**／**Later** |
| 用户点击 Update | 调用 `applyUpdate()` | 按钮显示 `Updating…` 并禁用 |
| 接管完成 | `update-applied` 使 `updateWaiting` 变为 `false` | 旧代码：横幅改为 `Reload to use the new version` 与 **Reload**；新代码：横幅消失 |
| 用户点击 Reload | — | `location.reload()`，此后页面运行新版本 |
| 接管超时 | `applyUpdate()` 抛错（10 秒） | `Update failed` 与 **Retry** |
| 没有等待中的更新 | `applyUpdate()` 返回 `false` | 回到初始状态，不算错误 |

要点：

- **不要自动刷新。** `applyUpdate()` 只完成接管，不刷新页面；何时刷新由应用决定，V1 验收矩阵禁止全局强制刷新。有未保存输入的页面应先提示保存。
- **Later 只隐藏当前页面的横幅。** 等待中的 worker 不受影响。在线刷新即得到新代码（此时横幅以离线文案再次出现）；该应用的所有标签页都关闭后，新 worker 才会自动接管。
- **其他标签页也要处理接管。** 任一同 scope 页面确认后，每个受控页面都会各自收到 `update-applied`。`updateWaiting` 只会被它清为 `false`，所以“从 `true` 变为 `false`”即表示接管已发生；本页若是旧代码应显示 Reload。
- **不要自行调用 `skipWaiting` 或直接操作 `navigator.serviceWorker`。** 只通过绑定提供的状态与方法。

## 共用：判断页面是否已是新代码

与框架无关，保存为 `page-currency.ts`，React 与 Vue 实现都从这里导入。

```ts
// 当前文档的入口脚本是否与服务器此刻给出的应用壳一致；任何不确定都按 "stale"。
export async function detectPageCurrency(signal: AbortSignal): Promise<"current" | "stale"> {
  const own = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (own === null) return "stale";
  const request = new AbortController(); // 调用方放弃或 5 秒超时，二者任一即中止
  const stop = () => request.abort();
  const timer = setTimeout(stop, 5_000);
  signal.addEventListener("abort", stop, { once: true });
  try {
    const response = await fetch("/app/" /* 换成自己应用壳的导航地址 */, { cache: "no-store", signal: request.signal });
    if (!response.ok) return "stale";
    const shell = new DOMParser().parseFromString(await response.text(), "text/html");
    const src = shell.querySelector('script[type="module"][src]')?.getAttribute("src");
    return src != null && new URL(src, response.url).href === own.src ? "current" : "stale";
  } catch {
    return "stale";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}
```

## React

```tsx
// main.tsx：开启定时检查。updateCheck 按字段比较，每次渲染传新对象也不会重建 facade。
import config from "virtual:pwa-config"; // 构建插件提供的配置
import { PwaProvider } from "@pwa-platform/react";
import { App } from "./app"; // 应用根组件，其中渲染 <UpdateBanner />

<PwaProvider config={{ ...config }} updateCheck={{ intervalMs: 1_800_000 }}>
  <App />
</PwaProvider>
```

```tsx
import { usePwa } from "@pwa-platform/react";
import { useEffect, useRef, useState } from "react";
import { detectPageCurrency } from "./page-currency";

type Phase = "idle" | "updating" | "reload" | "error";

export function UpdateBanner() {
  const pwa = usePwa();
  const [phase, setPhase] = useState<Phase>("idle");
  const [dismissed, setDismissed] = useState(false);
  const [currency, setCurrency] = useState<"current" | "stale" | null>(null);
  const wasWaiting = useRef(pwa.state.updateWaiting);

  useEffect(() => {
    const was = wasWaiting.current;
    wasWaiting.current = pwa.state.updateWaiting;
    if (!was && pwa.state.updateWaiting) {
      setPhase("idle");
      setDismissed(false);
      setCurrency(null);
    } else if (was && !pwa.state.updateWaiting) {
      // 本页或其他标签页的确认已生效；页面已是新代码时无需刷新
      setPhase(currency === "current" ? "idle" : "reload");
      setDismissed(false);
    }
  }, [pwa.state.updateWaiting, currency]);

  // 每个等待周期检查一次。短暂延迟并在周期结束时中止，避免自行激活的恢复 worker
  // 让 updateWaiting 瞬时翻转时发出无用请求。
  useEffect(() => {
    if (!pwa.state.updateWaiting || currency !== null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void detectPageCurrency(controller.signal).then((r) => {
        if (!controller.signal.aborted) setCurrency(r);
      });
    }, 100);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pwa.state.updateWaiting, currency]);

  const confirm = () => {
    setPhase("updating");
    void pwa.applyUpdate().then(
      (applied) => { if (!applied) setPhase("idle"); },
      () => setPhase("error"),
    );
  };

  if (phase === "reload") {
    return <div role="status">Reload to use the new version <button onClick={() => location.reload()}>Reload</button></div>;
  }
  if (phase === "error") {
    return <div role="status">Update failed <button onClick={confirm}>Retry</button></div>;
  }
  if (phase === "updating") {
    return <div role="status"><button disabled>Updating…</button></div>;
  }
  if (!pwa.state.updateWaiting || dismissed || currency === null) return null;
  return (
    <div role="status">
      {currency === "current" ? "An update is ready for offline use" : "A new version is available"}
      <button onClick={confirm}>Update</button>
      <button onClick={() => setDismissed(true)}>Later</button>
    </div>
  );
}
```

## Vue

```ts
// main.ts
import config from "virtual:pwa-config"; // 构建插件提供的配置
import { createPwa } from "@pwa-platform/vue";
import { createApp } from "vue";
import App from "./App.vue"; // 根组件中渲染 <UpdateBanner />

createApp(App).use(createPwa({ config, updateCheck: { intervalMs: 1_800_000 } })).mount("#app");
```

```vue
<!-- UpdateBanner.vue -->
<script setup lang="ts">
import { usePwa } from "@pwa-platform/vue";
import { ref, watch } from "vue";
import { detectPageCurrency } from "./page-currency";

const pwa = usePwa();
const state = pwa.state; // 顶层 ref，模板中才会自动解包
const phase = ref<"idle" | "updating" | "reload" | "error">("idle");
const dismissed = ref(false);
const currency = ref<"current" | "stale" | null>(null);

watch(
  () => state.value.updateWaiting,
  (isWaiting, wasWaiting) => {
    if (!wasWaiting && isWaiting) {
      phase.value = "idle";
      dismissed.value = false;
      currency.value = null;
    } else if (wasWaiting && !isWaiting) {
      // 本页或其他标签页的确认已生效；页面已是新代码时无需刷新
      phase.value = currency.value === "current" ? "idle" : "reload";
      dismissed.value = false;
    }
  },
);

// 每个等待周期检查一次；短暂延迟并在周期结束时中止（immediate 覆盖页面加载时已在等待的情况）。
watch(
  () => [state.value.updateWaiting, currency.value] as const,
  ([isWaiting, current], _previous, onCleanup) => {
    if (!isWaiting || current !== null) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      void detectPageCurrency(controller.signal).then((r) => {
        if (!cancelled) currency.value = r;
      });
    }, 100);
    onCleanup(() => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    });
  },
  { immediate: true },
);

function confirm(): void {
  phase.value = "updating";
  void pwa.applyUpdate().then(
    (applied) => { if (!applied) phase.value = "idle"; },
    () => { phase.value = "error"; },
  );
}

function reload(): void {
  location.reload();
}
</script>

<template>
  <div v-if="phase === 'reload'" role="status">
    Reload to use the new version <button @click="reload">Reload</button>
  </div>
  <div v-else-if="phase === 'error'" role="status">
    Update failed <button @click="confirm">Retry</button>
  </div>
  <div v-else-if="phase === 'updating'" role="status">
    <button disabled>Updating…</button>
  </div>
  <div v-else-if="state.updateWaiting && !dismissed && currency !== null" role="status">
    {{ currency === "current" ? "An update is ready for offline use" : "A new version is available" }}
    <button @click="confirm">Update</button>
    <button @click="dismissed = true">Later</button>
  </div>
</template>
```

## 已知边界

除[安装与更新](/guide/updates#自绘更新提示的已知边界)列出的几条外：

- **接管超时路径没有浏览器证据。** `Update failed`／Retry 只经代码审阅，真实浏览器中难以稳定制造新 worker 不接管的情况；页面新旧判断的请求失败与无法解析分支同样只经代码审阅；请求挂起后的 5 秒超时已有 E2E。
- **示例写死了应用壳地址 `/app/`。** 接入时改成自己应用壳的导航地址。
- **自绘的 `dismissed` 不持久，也没有 30 分钟提醒。** 它只是组件内存中的一个布尔值，刷新页面即重置；默认的 `PwaUpdateNotice` 会在“稍后”30 分钟后若仍有等待版本再次提醒，自绘实现需要自己加计时器。
