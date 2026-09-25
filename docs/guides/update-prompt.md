# 更新提示接入指南

平台负责发现新版本、让新 worker 等待、在用户确认后完成接管；**提示界面由应用自己实现**（[ADR-0005](../adr/0005-update-prompt-and-recovery-worker.md)、[ADR-0013](../adr/0013-client-facade-and-page-side-lifecycle-events.md)）。本指南给出推荐交互与可照抄的写法，完整参考实现见 React 示例 [`app.tsx`](../../packages/examples-browser-e2e/apps/react/src/app.tsx) 与 Vue 示例 [`app.ts`](../../packages/examples-browser-e2e/apps/vue/src/app.ts)，两者行为一致并由端到端测试覆盖。

## 什么会触发更新

浏览器只比较 worker 脚本（`serviceWorkerUrl`）的字节。Vite 插件把预缓存清单写进 worker：带指纹的文件名随内容变化，其余预缓存文件带内容 revision。因此**预缓存资源有任何变化，worker 就会变化，浏览器就能发现新版本**；业务 API 或未预缓存的资源变化不会触发。

| 变化 | 是否触发新版本 |
|---|---|
| 预缓存的 JS、CSS、HTML、离线页、图标 | 会：指纹文件名或 revision 改变，worker 字节随之改变 |
| 平台 worker 的运行时代码或配置 | 会：即使业务资源未变，worker 字节也已改变 |
| 业务 API 返回的数据 | 不会 |
| 未被预缓存规则覆盖的静态文件 | 不会；哪些文件预缓存由 `PwaPolicy` 的预缓存规则决定 |
| 同一份构建原样重新部署 | 不会：worker 字节相同 |

浏览器在以下时机检查 worker：

| 时机 | 说明 |
|---|---|
| 作用域内导航或刷新 | 浏览器自动检查；worker 应以 `no-cache` 提供 |
| 调用 `register()` | 应用启动时 |
| 定时检查 `updateCheck: { intervalMs }` | **默认关闭，建议开启**；最小 60000 ms，页面隐藏时暂停、重新可见时补查 |
| 手动 `checkForUpdate()` | 例如用户点击“检查更新” |

不开定时检查时，长时间停留在同一页面、不刷新的用户看不到新版本。推荐 30 分钟（`1_800_000`）；更短会让 worker 脚本成为高频请求目标，更长则让用户迟迟得不到提示。

## 升级分两部分：页面代码与离线版本

一次升级要替换两样东西，二者生效时机不同：

| 部分 | 由谁提供 | 何时变为新版 |
|---|---|---|
| 页面代码（HTML、JS） | 应用壳导航 `network-first`：在线时每次打开或刷新都从网络获取 | 下一次在线打开或刷新 |
| Service Worker 与离线缓存 | 浏览器在后台安装的新 worker | 用户点击 Update 后接管，或该应用所有标签页关闭后 |

发布后的内部顺序：

1. 部署新版本，worker 脚本字节改变。
2. 浏览器在导航、`register()`、定时检查或 `checkForUpdate()` 时发现变化，在后台安装新 worker，把新版资源预缓存到新的缓存中。
3. 新 worker 进入等待（waiting）。页面与离线缓存仍由旧 worker 负责，用户无感知；页面收到 `updateWaiting`。
4. 用户点击 Update：`applyUpdate()` 发出确认消息，新 worker 激活并接管（`controllerchange`），随后清理本应用的旧缓存。离线版本自此为新版。
5. 已在运行的旧 JS 仍在内存中，无法原地替换；只有重新加载，页面才运行新代码。

平台不在发布后自动接管，原因有二：已执行的 JS 无法热替换；新 worker 若在旧页面仍打开时自行接管，会形成“旧页面 + 新 worker”的混合状态，旧页面按需加载的旧资源可能不在新缓存中，强制刷新还会丢失未保存的输入。因此新 worker 先等待，由用户决定时机（[ADR-0005](../adr/0005-update-prompt-and-recovery-worker.md)、V1 验收矩阵）。

用户实际会走的三条路径：

| 情况 | 需要的操作 |
|---|---|
| 页面在发布前打开（旧代码） | Update，再 Reload |
| 页面在发布后在线刷新过（已是新代码） | 只需 Update，把离线版本切到新版；不需要再 Reload |
| 什么都不点 | 该应用所有标签页关闭后，下次打开时新 worker 自动生效 |

因此在线用户刷新即可得到新页面代码，不会立即生效的是离线版本与 Service Worker。

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

## React

```tsx
// main.tsx：开启定时检查。updateCheck 按字段比较，每次渲染传新对象也不会重建 facade。
<PwaProvider config={{ ...config }} updateCheck={{ intervalMs: 1_800_000 }}>
  <App />
</PwaProvider>
```

```tsx
import { usePwa } from "@pwa-platform/react";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "updating" | "reload" | "error";

// 当前文档的入口脚本是否与服务器此刻给出的应用壳一致；任何不确定都按 "stale"。
async function detectPageCurrency(signal: AbortSignal): Promise<"current" | "stale"> {
  const own = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (own === null) return "stale";
  const request = new AbortController(); // 调用方放弃或 5 秒超时，二者任一即中止
  const stop = () => request.abort();
  const timer = setTimeout(stop, 5_000);
  signal.addEventListener("abort", stop, { once: true });
  try {
    const response = await fetch("/app/", { cache: "no-store", signal: request.signal });
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
app.use(createPwa({ config, updateCheck: { intervalMs: 1_800_000 } }));
```

```ts
import { usePwa } from "@pwa-platform/vue";
import { ref, watch } from "vue";

// 在组件 setup() 中：
const pwa = usePwa();
const phase = ref<"idle" | "updating" | "reload" | "error">("idle");
const dismissed = ref(false);
const currency = ref<"current" | "stale" | null>(null); // 用上文同一个 detectPageCurrency 填充

watch(
  () => pwa.state.value.updateWaiting,
  (isWaiting, wasWaiting) => {
    if (!wasWaiting && isWaiting) {
      phase.value = "idle";
      dismissed.value = false;
      currency.value = null; // 随后延迟 100 ms 调用 detectPageCurrency，周期结束则中止
    } else if (wasWaiting && !isWaiting) {
      phase.value = currency.value === "current" ? "idle" : "reload"; // 新代码页面无需刷新
      dismissed.value = false;
    }
  },
);

function confirm(): void {
  phase.value = "updating";
  void pwa.applyUpdate().then(
    (applied) => { if (!applied) phase.value = "idle"; },
    () => { phase.value = "error"; },
  );
}
// 模板按 phase、currency 与 pwa.state.value.updateWaiting && !dismissed 渲染，与上面的 React 分支相同；完整实现见 Vue 示例。
```

## 已知边界

- **已打开的旧页面仍运行旧代码。** 旧页面在刷新前若按需加载旧的懒加载 chunk，而部署已删除这些文件，会出现 404；发布时应保留上一版指纹资源（见[发布与事故手册](../operations/release-and-incident-runbook.md)）。
- **接管超时路径没有浏览器证据。** `Update failed`／Retry 只经代码审阅，真实浏览器中难以稳定制造新 worker 不接管的情况；页面新旧判断的请求失败与无法解析分支同样只经代码审阅；请求挂起后的 5 秒超时已有 E2E。
- **新旧判断依赖入口脚本地址。** 它适用于入口脚本带内容指纹的构建（Vite 默认如此）；入口地址不随内容变化的应用需要改用自己的版本标识。
- 平台不提供默认提示组件；若多个接入方需要同一套界面，再另立规格评估可选的独立界面包。
