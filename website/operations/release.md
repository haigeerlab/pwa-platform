# 部署与发布

平台在构建时能检查产物，但无法仅凭一次构建证明线上响应头、历史版本保留和浏览器安装体验。业务应用需要把这些检查纳入自己的发布流程。

## 独立 origin：默认方案

一个 origin 和 scope 对应一个 PWA 身份，是最直接的部署方式。部署时确保 Vite <code>base</code>、身份中的 <code>origin</code> 与 <code>scope</code>、manifest 和 worker 的实际 URL 相符。worker 应从 HTTPS 同源地址提供；发布时核查 HTML、worker 和指纹资产的缓存头。完整的头部规则、Nginx 与 Cloudflare 示例见[服务器与 CDN 配置](/operations/hosting)。

## 线上响应头

构建报告无法证明 CDN 或源站实际返回的响应头。发布时应逐类请求线上 URL，并按下表核对 `Cache-Control`：

| 资源 | 必须包含 | 不得包含 |
| --- | --- | --- |
| Service Worker 脚本、manifest、公开 HTML | `no-cache` | `immutable` |
| 带指纹的静态资源 | `immutable` 和发布配置指定的长 `max-age`，且 `max-age` 必须为正数（`max-age=0` 不通过） | `no-cache`、`no-store` |
| 私有 HTML 与数据 | `private`、`no-store` | `public`、`immutable` |

除上表列出的指令外，响应可以带其他指令，检查不会因此失败；检查的是跟随重定向之后的最终响应。私有 HTML 按私有响应对待，不因它是 HTML 而套用公开 HTML 规则，但**它不在机器检查范围内**，需要人工核对。记录实际访问 URL、响应头和检查时间；不要把令牌、响应体或用户数据写入发布记录。

### 平台提供的机器检查

<code>@pwa-platform/build-verifier</code> 提供六项检查，名称固定为 `artifacts`（计划引用的文件都已发布）、`response-headers`（worker、manifest 与指纹资源的缓存头）、`html-headers`（公开 HTML 的缓存头）、`identity-baseline`（生产身份与存档基线一致）、`release-retention`（旧指纹资源仍可获取）和 `release-order`（共享 origin 的子应用发布前，根应用已排除其 scope）。它们是纯判断函数，**输入由你的发布系统采集**：

- `release-retention` 需要你提供发布历史记录（每个历史版本的计划与发布时间）和线上当前可获取的路径清单；
- `release-order` 只适用于共享 origin 的子应用，要求根应用的线上计划已经先排除子 scope（根先、子后）；
- 省略某项输入即跳过该项检查，所以门禁要同时核对必需检查是否全部执行。

调用方式与示例见[服务器与 CDN 配置](/operations/hosting#自检)。

## 发布门禁

业务发布方要保存本次提交的 CI 或经批准的本地替代记录、目标浏览器与原生安装证据、线上产物和响应头检查结果、身份基线比较、历史资源可用性及恢复演练记录。机器检查须同时证明**必需检查全部执行**且**检查结果通过**；一次 Vite 构建不能代替线上事实采集。首次发布或生产身份迁移须保留基线缺失或不匹配的诊断，并经你们团队中负责生产身份基线的审批人按发布流程批准，不能省略检查来取得绿色报告。

## 同源多应用

同一 origin 上可以有根应用与固定子路径应用，各自持有独立 manifest 和 worker；这不是跨 origin 隔离，存储仍同源共享。目前仅支持 Vite 接入。

根应用需要一份受版本控制的登记表，并从中生成子 scope 的排除规则：不能预缓存子应用文件、接管子路径请求或替子应用返回根离线页。**先发布根应用的排除规则，再发布子应用**；移除时反向执行。发布子应用前还要核对线上根应用的计划已经包含相应排除。

### 本地根路径与线上移动子路径 {#root-mobile-paths}

本地两个项目可以各自在开发服务器的 `/` 调试；`vite dev` 不注册平台 worker。生产构建须按**浏览器实际访问路径**分别配置，不能把按根路径构建的移动项目只靠代理挂到 `/m/`：

| 配置 | 根应用 | `/m/` 子应用 |
| --- | --- | --- |
| Vite `base`、worker `scope` | `/` | `/m/` |
| `IDENTITY.mountPath` | `/` | `/m/` |
| `IDENTITY.manifestId` | `/` | `/m/` |
| `IDENTITY.serviceWorkerUrl` | `/sw.js` | `/m/sw.js` |
| `IDENTITY.manifestUrl` | `/manifest.webmanifest` | `/m/manifest.webmanifest` |
| `INSTALL.startUrl` | `/` | `/m/` |

`mountPath` 与 Vite `base` 写成同一个字符串（都带结尾斜杠）；启用入口恢复时两者必须逐字相同，否则构建报 `entry.base-mismatch`。两份身份使用相同的生产 `origin`、`environment`，不同的 `appId`，并在各自构建中传入同一版本的 `topology: { kind: "shared-origin", registry }`。根应用的发布计划必须先排除 `/m/`，子应用发布时用线上根计划通过 `release-order` 检查。服务器把 `/m` 重定向到 `/m/`；上线前逐项核对资源、图标、manifest、worker 和离线页的最终 URL。若移动站不注册 PWA，根 worker 仍应排除这个独立站点的路径。

### 登记表格式 {#shared-origin-registry}

`topology: { kind: "shared-origin", registry }` 里的 `registry` 是一个对象，根应用与每个子应用的构建都传入**同一份**：

| 字段 | 含义与约束 |
| --- | --- |
| `schemaVersion` | 固定为 `1` |
| `registryVersion` | 正整数（平台只校验这一点）；约定登记表内容有变化时递增，便于核对根、子应用构建用的是同一版 |
| `origin` | 序列化后的 origin，如 `https://app.example.com`（HTTPS，仅本机调试可用 HTTP 回环地址）；必须与每个应用身份的 `origin` 一致 |
| `environment` | 小写字母开头，仅含小写字母、数字和连字符；必须与每个应用身份的 `environment` 一致 |
| `root` | 根应用的条目，一个 |
| `children` | 子应用条目数组，**至少一个** |

`root` 与 `children` 的每个条目（不允许多余字段）：

| 字段 | 含义与约束 |
| --- | --- |
| `appId` | 应用标识，与该应用 `IDENTITY.appId` 相同 |
| `scope` | 以 `/` 结尾的规范路径，与该应用 `IDENTITY.scope` 相同 |
| `serviceWorkerUrl` | 与 `IDENTITY.serviceWorkerUrl` 相同，且位于自己的 `scope` 内 |
| `manifestId` | 与 `IDENTITY.manifestId` 相同 |
| `manifestUrl` | 与 `IDENTITY.manifestUrl` 相同，且位于自己的 `scope` 内 |

规则：

- 每个子应用的 `scope` 必须**严格位于**根 `scope` 之内（与根相同不算）；子应用之间的 `scope` 不能相互包含或重叠。
- 根和所有子应用的 `appId`、`serviceWorkerUrl`、`manifestId`、`manifestUrl` 各自不能重复。
- 根应用的 `serviceWorkerUrl` 与 `manifestUrl` 不能落在任何子应用的 `scope` 内，即根应用的文件不能放进子应用的路径。
- 应用自己的身份必须与登记表中恰好一个条目的上述五个字段逐字相同，`origin`、`environment` 也要相同；根应用的计划里，排除规则必须恰好等于全部子应用的 `scope`（去掉结尾斜杠），子应用的计划不带排除规则。
- 根应用自己的预缓存文件、离线页、安装起始地址和快捷方式，都不能指向子应用的 `scope`。

根 `/` 加子应用 `/m/` 的完整示例：

~~~ts
// shared/registry.ts —— 根、子应用两个项目都从这里取同一份
export const REGISTRY = {
  schemaVersion: 1,
  registryVersion: 1,
  origin: "https://app.example.com",
  environment: "production",
  root: {
    appId: "businessapp",
    scope: "/",
    serviceWorkerUrl: "/sw.js",
    manifestId: "/",
    manifestUrl: "/manifest.webmanifest",
  },
  children: [
    {
      appId: "businessapp-mobile",
      scope: "/m/",
      serviceWorkerUrl: "/m/sw.js",
      manifestId: "/m/",
      manifestUrl: "/m/manifest.webmanifest",
    },
  ],
} as const;

// 两个项目的 pwa({ ... }) 中都写：
//   topology: { kind: "shared-origin", registry: REGISTRY }
~~~

违反这些规则会以下列诊断码失败（含义与处理见[诊断码索引](/reference/diagnostics)）：

- 登记表本身：`registry.child-outside-root`、`registry.scope-overlap`、`registry.duplicate-identity-field`、`registry.entry-url-outside-scope`、`registry.root-url-in-child-scope`、`registry.cache-prefix-collision`。
- 登记表与应用计划对不上：`plan.registry-identity-mismatch`、`plan.exclude-rules-mismatch`。
- 根应用内容伸进子应用路径：编译阶段的 `compile.host-file-in-child-scope`、`compile.offline-fallback-in-child-scope`、`compile.policy-rule-in-child-scope`、`compile.start-url-in-child-scope`、`compile.shortcut-url-in-child-scope`，以及计划校验阶段对应的 `plan.precache-in-child-scope`、`plan.offline-fallback-in-child-scope`、`plan.start-url-in-child-scope`、`plan.shortcut-url-in-child-scope`。

### 一部 Android 与一部 iPhone 能验证什么

两部手机都能用于真实设备测试：Android Chrome 和 iPhone Safari 各测在线、离线、安装入口、更新提示、明确刷新与恢复，并分别记录浏览器和系统版本。iPhone Safari 属于渐进兼容范围，不要求第二部 iPhone。当前 `desktop` 发布通道只承诺桌面 Chrome N/N-1；`desktop+android` 通道按现有浏览器矩阵还要求 Android Chrome N/N-1，且以两台关闭自动更新的实体设备保留旧版本。因此只有一部 Android 时仍可完成其当前版本的功能测试，但不能把未测的另一个 Chrome 版本记为通过，也不能据此宣称 Android 正式支持。

## 更新与旧资源保留

新 worker 等待期间，旧页面仍可能请求旧版指纹资源。发布系统不能只保留最新一版：发布 R 时，R、R-1、R-2 的带指纹资源都必须可获取；更早版本的资源须从被下一次发布取代之日起保留满 7 天，以两项要求中更长的窗口为准。一次 Vite 构建不会替发布系统执行历史保留检查。

## 身份发布基线 {#identity-baseline}

生产注册后，`appId`、`origin`、`scope`、`serviceWorkerUrl`、`manifestId`、`manifestUrl`、`mountPath`、`cacheNamespaceSeed` 和 `environment` 不能再变。发布基线就是用来在发布时发现这种变动的：

- **内容**：该部署槽位上一次**生产发布成功**时使用的完整 `PwaIdentity`，存成 JSON，必须能通过身份校验。
- **槽位**：部署槽位是你给“某个环境中的某个应用”起的稳定名称，小写 kebab-case（如 `businessapp-production`），登记后不改名、不复用；一个槽位只对应一个环境，不同环境用不同槽位。
- **存放**：每个槽位一个文件 `<基线目录>/<槽位名>.json`，和身份配置放在同一个仓库里受版本控制。基线目录由你的发布脚本指定。
- **生成与更新**：首次生产发布成功后，把当时的身份写成该文件并提交；此后**只在生产发布成功之后**才更新，未发布的改动不能写进去。
- **比较**：`compareIdentityBaseline` 把候选身份与基线上面九个字段逐字比较，不做大小写、结尾斜杠或百分号编码的归一化；每个不同的字段产出一条 `verify.baseline-mismatch`。找不到基线报 `verify.baseline-missing`，基线不是合法身份报 `verify.baseline-invalid`。工具不判断“这是不是首次发布”，这由发布负责人评审决定。

基线文件例（`release/baselines/businessapp-production.json`，就是上线时的 `IDENTITY`）：

~~~json
{
  "appId": "businessapp",
  "manifestId": "/",
  "origin": "https://app.example.com",
  "scope": "/",
  "serviceWorkerUrl": "/sw.js",
  "manifestUrl": "/manifest.webmanifest",
  "mountPath": "/",
  "environment": "production",
  "cacheNamespaceSeed": "r1"
}
~~~

发布脚本里读取并比较（`plan` 是本次构建得到的计划）：

~~~ts
import { readIdentityBaseline, verifyRelease } from "@pwa-platform/build-verifier";

let baseline: unknown; // 读不到时保持 undefined，会得到 verify.baseline-missing
try {
  baseline = readIdentityBaseline({ directory: "release/baselines", slot: "businessapp-production" });
} catch {
  // 文件不存在、槽位名非法或不是 JSON：读取函数会抛错，不会替你判断是不是首次发布
}

const report = verifyRelease({ plan, baseline }); // 显式传入 baseline 属性，即使值是 undefined
~~~

`verifyRelease` 里省略 `baseline` 属性表示“没有做比较”，传入 `undefined` 才表示“查过但没找到”，两者不同。若确实要变更身份字段，属于身份迁移：必须以有名称的迁移提出并获批准，并把 `cacheNamespaceSeed` 提升为从未用过的新值。完整规则与迁移记录格式详见[身份发布基线](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/identity-release-baseline.md)。

## 回滚与恢复

普通回滚要确保旧版 HTML、脚本和资产仍能获取。若线上 worker 自身异常，按恢复流程把构建输出根目录下的 `pwa-recovery-worker.js` 部署到**原 worker URL**（内容覆盖 `serviceWorkerUrl` 指向的文件，响应头要求与原 worker 相同，见[服务器与 CDN 配置](/operations/hosting#回滚与紧急下线)），核查它只清理该应用的专属缓存，并从网络重新加载页面。不要通过改变生产身份字段来临时“绕过”事故。

本页给出业务接入必须核对的发布条件。若你是本平台仓库的维护者，还应使用内部的[发布与事故手册](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/release-and-incident-runbook.md)和[身份发布基线](https://github.com/haigeerlab/pwa-platform/blob/main/docs/operations/identity-release-baseline.md)记录完整证据。
