# 服务器与 CDN 配置

本页面向自己部署 PWA 的业务团队：哪些文件要返回什么响应头、怎样在 Nginx 与 CDN 上配置、按什么顺序上传、出事故时怎样回退，以及怎样自检。每个字段为什么要这样配、浏览器正反例和未验证项见[响应头配置实测依据](/operations/header-evidence)；发布流程与门禁见[部署与发布](/operations/release)。

## 为什么需要服务端配合

构建只能生成文件，浏览器最终看到的是服务器和 CDN 返回的响应。更新检查需要取得 worker 的新脚本字节；长缓存是否挡住某一次检查，取决于浏览器的 `updateViaCache` 模式和中间缓存行为。本地实验中，默认 `imports` 模式仍发现了更新，显式 `all` 模式的长缓存反例未发现更新。为使同名覆盖的文件可再验证，本项目要求 worker、manifest 与公开 HTML 返回 <code>no-cache</code>。带内容指纹的资源改了内容就会换文件名，可以长期缓存，但旧文件还须按发布保留窗口继续提供。详见[对照记录](/operations/header-evidence#实测时发生了什么)。

另外两条浏览器层面的前提：

- 页面、worker 与 manifest 必须经 HTTPS 提供，只有本机回环地址（<code>localhost</code> 等）可以用 HTTP。
- 平台不使用、也不支持 <code>Service-Worker-Allowed</code> 响应头：<code>scope</code> 必须等于 worker 脚本所在的目录。

## 响应头总表

下表中 worker、manifest、公开 HTML 和带指纹资产的“必须”“不得”是发布检查（<code>build-verifier</code>）对 <code>Cache-Control</code> 实际判断的内容；标为“建议”的项及私有响应需人工核对。<code>no-cache</code> 是**本项目发布约定**，不是所有 PWA 的规范硬性条件。请按实际 URL 的最终响应判断，不能只检查配置文件。

| 资源 | Cache-Control 必须包含 | Cache-Control 不得包含 | 原因 |
| --- | --- | --- | --- |
| 入口 HTML（挂载路径、安装的 <code>startUrl</code>）、离线页、其他进入预缓存的 HTML | <code>no-cache</code> | <code>immutable</code> | HTML 的文件名不变，内容随每次发布变化 |
| <code>sw.js</code>（即 <code>serviceWorkerUrl</code>） | <code>no-cache</code> | <code>immutable</code> | 更新检查须取得新脚本字节；长缓存的影响取决于检查模式，本项目要求可再验证 |
| <code>pwa-recovery-worker.js</code> | 建议 <code>no-cache</code>（不检查） | <code>immutable</code> | 事故时要被复制到 <code>sw.js</code> 的位置；部署工具通常要求两者规则一致 |
| <code>manifest.webmanifest</code> | <code>no-cache</code> | <code>immutable</code> | 安装元数据可在同一路径更新；长缓存使本次页面读取继续得到旧名称，原生安装记录的更新周期另算 |
| 带指纹的资源（文件名形如 <code>name-&lt;8 个字符&gt;.&lt;扩展名&gt;</code>，例如 <code>assets/index-BGTT0tj4.js</code>） | <code>immutable</code> 和**正数**的 <code>max-age</code>（如 <code>max-age=31536000</code>） | <code>no-cache</code>、<code>no-store</code> | 内容变了文件名就变，可永久缓存；<code>max-age=0, immutable</code> 是常见的错误配置，检查会判为失败 |
| <code>public/</code> 目录复制出来的文件（含图标） | 建议 <code>no-cache</code> 或较短的 <code>max-age</code>（不检查） | 不要 <code>immutable</code> | 文件名由人起，即使名字里恰好有 8 个字符的后缀，平台也不把它当作指纹文件；覆盖同名文件后，长期缓存会让用户一直看到旧版 |
| 私有 HTML 与 API | <code>private, no-store</code> | <code>public</code>、<code>immutable</code> | **不在机器检查范围内**，需人工核对；单独的 <code>private</code> 不禁止浏览器私有缓存 |

指纹文件的判定依据是文件名末尾恰好 8 个 <code>[A-Za-z0-9_-]</code> 字符再接扩展名，也就是 Vite 默认的输出名。如果你改了 Vite 的输出命名规则，平台可能不再把它们识别为指纹文件。

检查方式的细节：

- 只要求或禁止上表列出的指令，响应里的其他指令（<code>public</code>、<code>must-revalidate</code>、<code>s-maxage</code> 等）不会导致失败；指令名不区分大小写，格式错误的指令会被忽略，与浏览器一致。
- 检查的是**跟随重定向之后的最终响应**：例如 <code>/offline.html</code> 被 CDN 重定向到 <code>/offline</code> 时，要在最终地址上配置头，并把最终响应的头交给检查。
- 没有采集到响应头的路径会被报告为失败，而不是被静默跳过。
- <code>public/</code> 里的文件不会被要求 <code>immutable</code>。

其他响应头要求：

| 项目 | 要求 |
| --- | --- |
| <code>Content-Type</code> | <code>sw.js</code> 必须是 JavaScript MIME 类型（推荐 <code>text/javascript</code>；现有 <code>application/javascript</code> 也合格），配错可使 worker 注册失败。npm <code>0.3.0</code> **已支持**独立的 <code>worker-mime</code> 机器检查。manifest 建议使用 <code>application/manifest+json</code>，当前不做 MIME 发布检查 |
| <code>HEAD</code> 请求 | <code>sw.js</code> 的 <code>HEAD</code> 请求必须返回 2xx：离线页在断网时用它探测网络是否恢复，返回非 2xx 页面就不会自动重新加载 |
| <code>Vary</code> | 只有启用公共读取缓存时相关：运行时缓存只接受 <code>Vary</code> 中仅含 <code>Accept</code> 与 <code>Accept-Encoding</code> 的响应，CDN 或开发服务器额外加的 <code>Vary: Origin</code> 会让响应不被缓存 |

## Nginx 示例

下面是一个完整的示例：应用挂载在域名根路径 <code>/</code>，构建输出放在 <code>/var/www/app</code>，资源目录是 Vite 默认的 <code>assets/</code>，离线页是 <code>/offline.html</code>。

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name app.example.com;

    ssl_certificate     /etc/ssl/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/app.example.com/privkey.pem;

    root /var/www/app;

    # Service Worker：每次都要重新验证，并明确返回 JavaScript MIME。精确匹配优先于下面的 location /，
    # 所以不会被 SPA 回退接住；文件不存在就是 404，不能返回 index.html。
    location = /sw.js {
        types { }
        default_type text/javascript;
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }

    # 恢复 worker：与 sw.js 相同的规则。
    location = /pwa-recovery-worker.js {
        types { }
        default_type text/javascript;
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }

    # manifest：no-cache，并显式给出 MIME 类型（types {} 先清空 Nginx 按扩展名的映射）。
    location = /manifest.webmanifest {
        types { }
        default_type application/manifest+json;
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }

    # 离线页：no-cache，同样不参与 SPA 回退。
    location = /offline.html {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }

    # 带指纹的资源：永久缓存。^~ 让它优先于下面的正则 location。
    # 这里故意不加 always：缺失文件的 404 不能带一年的缓存头，否则 CDN 会把 404 缓存一年。
    location ^~ /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # public/ 里的其他静态文件（图标、截图、JSON 等）：no-cache；缺失时返回 404，不被 SPA 回退接住。
    location ~* \.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|json|txt|xml|woff2?)$ {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }

    # 入口 HTML 与 SPA 回退：no-cache。
    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ /index.html;
    }
}
```

要点：

- **`add_header ... always`**：不加 <code>always</code> 时，Nginx 只对 200、201、204、206、301、302、303、304、307、308 这几个状态码添加响应头。<code>no-cache</code> 类的规则加 <code>always</code>，让错误响应也不被缓存；**带指纹资源的长缓存规则不要加 <code>always</code>**，否则部署间隙里短暂缺失的文件会以一年缓存的 404 留在 CDN 上。
- **`add_header` 不继承**：只要某个 <code>location</code> 里写了自己的 <code>add_header</code>，外层 <code>server</code> 里的 <code>add_header</code>（例如安全头）就不再对它生效，需要在每个 <code>location</code> 里重复，或用 <code>include</code> 引入同一份片段。
- **SPA 回退只放在 `location /`，并用扩展名规则挡住静态文件**：<code>location /</code> 里的 <code>try_files $uri $uri/ /index.html</code> 会接住它下面**所有**缺失的路径，包括缺失的 <code>.js</code>、图标等文件。所以 worker、manifest、离线页、<code>/assets/</code> 有自己的精确或 <code>^~</code> 前缀 <code>location</code>，其余静态文件由扩展名正则 <code>location</code> 接住，缺失时都得到 404，而不是一个 200 的 HTML。把 404 变成 200 的 HTML 会掩盖缺失的资源，也会让预缓存安装“成功”地缓存下错误内容。
- **`/assets/` 下不要放手写命名的文件**：放在 <code>public/assets/</code> 里的文件会被当成指纹资源缓存一年。

::: tip 本地验证记录（2026-09-29）
此前配置的 <code>/app/</code> 子路径版本（见下节）已在 nginx 1.31.6 上用平台 React 示例的生产构建验证：各类资源的 <code>Cache-Control</code> 与 <code>Content-Type</code> 用 <code>curl -I</code> 逐项核对；<code>verifyRelease</code> 的 <code>artifacts</code>、<code>response-headers</code>、<code>html-headers</code> 三项通过；缺失的 worker、图标和指纹资源返回 404，深层路由回退到 <code>index.html</code>，<code>/app</code> 301 到 <code>/app/</code>。上方新增的显式 MIME 两行尚未在该次 Nginx 演练中复测；使用的是自签名证书，因此**没有**在浏览器里验证 worker 注册。它不在本仓库 CI 中运行（仓库自己的测试部署使用 Cloudflare Pages）；上线前仍请在你自己的环境里按[自检](#自检)核对。

精确匹配的 worker 位置用 <code>types { }</code> 和 <code>default_type</code> 固定 MIME；其他静态文件仍依赖外层 <code>http</code> 块的 <code>include mime.types</code>。Nginx 这两个指令的行为见[官方文档](https://nginx.org/en/docs/http/ngx_http_core_module.html#types)。
:::

### 挂载在子路径 `/app/`

应用挂载在 <code>/app/</code> 时，Vite <code>base</code>、身份的 <code>scope</code>、<code>mountPath</code> 与 <code>serviceWorkerUrl</code>（<code>/app/sw.js</code>）都要按公开 URL <code>/app/</code> 配置。<code>dist/</code> 顶层不需要有 <code>app/</code>：把构建输出的**内容**放到 <code>/var/www/site/app/</code>，Nginx 的 <code>root</code> 仍为 <code>/var/www/site</code>，浏览器就能访问 <code>/app/sw.js</code>。Nginx 中把上面每个 <code>location</code> 的路径加上 <code>/app</code> 前缀（<code>location = /app/sw.js</code>、<code>location ^~ /app/assets/</code>、扩展名正则改为 <code>~* ^/app/.+\.(?:js|…)$</code>、<code>location /app/</code>，回退改为 <code>/app/index.html</code>），并增加一条重定向：

```nginx
location = /app { return 301 /app/; }
```

<code>/app</code> 不带斜杠时不能直接提供页面：相对路径会解析错，也落在 worker 的 <code>scope</code> 之外。

## Cloudflare Pages 与通用 CDN

Cloudflare Pages 用发布目录里的 <code>_headers</code> 文件配置响应头。本仓库自己的测试部署（应用挂在 <code>/app/</code>）生成的规则如下，应用在根路径时去掉 <code>/app</code> 前缀即可：

```text
/app/
  Cache-Control: no-cache
/app/index.html
  Cache-Control: no-cache
/app/offline.html
  Cache-Control: no-cache
/app/offline
  Cache-Control: no-cache
/app/sw.js
  Cache-Control: no-cache
/app/pwa-recovery-worker.js
  Cache-Control: no-cache
/app/manifest.webmanifest
  Cache-Control: no-cache
/app/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

其中 <code>/app/offline</code> 是因为 Cloudflare Pages 会把 <code>offline.html</code> 重定向到无扩展名的地址，最终响应也要带头。发布检查看的是最终响应。

这段 <code>_headers</code> 只列缓存规则；<code>sw.js</code> 的实收 <code>Content-Type</code> 仍须单独核对。Pages 静态资产若已返回 <code>application/javascript</code>，无需改成另一种合法 JavaScript MIME；若返回 <code>text/plain</code>，可在 <code>_headers</code> 的 <code>/app/sw.js</code> 规则下明确设置 <code>Content-Type: text/javascript</code>，重新部署后以 GET 复核。Pages 的 <code>_headers</code> 只作用于静态资产响应；Functions／Worker 路由须在实际处理响应的代码中设置，详见[Cloudflare Pages 文档](https://developers.cloudflare.com/pages/configuration/headers/)。

通用 CDN 与其他托管的规则：

- **让 CDN 遵从源站的 `Cache-Control`**。如果 CDN 的规则覆盖或忽略源站的 <code>no-cache</code>，先修正 CDN 规则，再核对实际出口响应；发布时清除被错误缓存的 <code>sw.js</code>、恢复 worker、manifest、入口 HTML 和离线页。一次清除不能代替后续每次请求的可再验证规则。
- **指纹资源不要依赖清除**：它们文件名唯一，可以永久缓存；发布流程不应假设“上传后清一次缓存”能修复它们。
- **不要让 CDN 改写 `sw.js`**：关闭对它的压缩缩小、脚本注入（如各家的 auto-minify、Rocket Loader 一类功能）等重写功能。任何字节变化都会让 worker 内容与构建产物不一致。
- 不要用 <code>max-age=0</code> 搭配长时间的 <code>s-maxage</code> 代替 <code>no-cache</code>，也不要让 CDN 平台规则忽略源站的 <code>no-cache</code>。若此前已缓存旧响应，修正规则时清除旧副本并重新核对出口 GET；后续发布仍须满足响应头基线。

## 部署顺序

新 worker 安装时会取回预缓存清单里的**每一个** URL，任何一个返回 400 及以上的状态码，整个安装就失败，用户继续使用旧版本。所以先让所有被引用的文件存在，最后才让新 worker 可见：

1. 上传新的带指纹资源和其他进入预缓存的文件（图标等）；
2. 上传 HTML、离线页和 manifest；
3. **最后**上传 <code>sw.js</code>。

如果 <code>sw.js</code> 先于资源上线，用户机器上的新 worker 会因缺文件而反复安装失败；如果 HTML 先于资源上线，用户会在页面里加载到 404 的脚本。

**保留旧版本资源**：发布 R 时，R、R-1、R-2 三个版本的带指纹资源都要能取到；更早的版本，从被下一次发布取代之日起再保留 7 天，两条要求取更长的。等待中的旧页面、尚未更新的 worker 和恢复 worker 都可能还在请求这些文件。

**共享 origin**：根应用先发布排除子应用 scope 的规则，再发布子应用；移除子应用时反向执行。细节见[同源多应用](/operations/release#同源多应用)。

## SPA 回退

- **在线时**：把不存在的路径改写成 <code>index.html</code> 是可以的。导航请求在有网时总是先走网络，服务器的回退页面直接返回给浏览器。
- **离线时没有应用壳通配回退**：worker 只会依次尝试：请求的 URL 本身、去掉查询参数的同一路径、该路径下的 <code>index.html</code>（仅限已预缓存），最后才是离线页。所以一个只靠服务器回退才能打开的 history 路由，断网直接访问时会落到离线页。服务器上的改写**不会**让任何东西进入预缓存，预缓存只由构建产物和策略决定。需要离线可直接打开的路由，要预渲染成文件并进入预缓存。
- **不要改写** <code>sw.js</code>、<code>pwa-recovery-worker.js</code>、manifest 和离线页：它们缺失时应当返回 404，而不是 200 的 <code>index.html</code>。
- **子路径**：<code>/app</code> 要重定向到 <code>/app/</code>，见上文。

## 回滚与紧急下线

**普通回滚**：保留旧版本的带指纹资源，把旧版 HTML、manifest 和 <code>sw.js</code> 重新部署回去即可。注意已安装新 worker 的用户会继续使用它的预缓存，直到浏览器再次检查到 <code>sw.js</code> 的变化并更新；回滚不会立即让这些用户回到旧版本。

**worker 自身出了问题**（例如无限报错、缓存了错误内容）：把构建输出根目录下的 <code>pwa-recovery-worker.js</code> 复制到 <code>serviceWorkerUrl</code> 指向的位置，覆盖 <code>sw.js</code>，响应头保持与原 <code>sw.js</code> 相同（<code>no-cache</code>）。浏览器检查到 <code>sw.js</code> 变了，就会安装恢复 worker，它会：

- 立即接管，不等待页面确认；
- 删除本应用的全部缓存和离线写队列的数据库，并尽力清理缓存的过期记录、取消 Push 订阅；
- 缓存或离线写数据库的删除失败时**中止并失败**（fail closed），不接管；
- 之后不拦截任何请求，页面直接走网络。

恢复 worker 不会注销 registration。事故处理完成后，发布修复后的平台 worker：它作为新版本会进入等待，需要用户确认或所有标签页关闭后才接管，这是正常的更新流程。恢复是发布操作，需要事先演练，并且在恢复期间同样要保证 <code>sw.js</code> 不被 CDN 缓存。不要用改变生产身份字段的办法绕过事故。

## 更新检查对服务端的负载

- 开启 <code>updateCheck</code> 后，页面按间隔请求一次 <code>sw.js</code>，并且**绕过 HTTP 缓存**（浏览器对主脚本的更新检查总是如此）。最小间隔 60 秒，即每个**可见**标签页每小时最多约 60 次请求；页面在后台时跳过。每个标签页各自轮询。
- 离线页显示期间，每 10 秒对当前控制页面的 worker 脚本地址发一次 <code>HEAD</code> 请求（3 秒超时），仅在页面可见时发送；成功（2xx）就重新加载页面。
- 所以 <code>sw.js</code> 请求要便宜：应由源站或 CDN 边缘直接返回并做条件请求（<code>ETag</code>／<code>Last-Modified</code> 返回 304），不要让它每次穿透到应用服务器。

## 自检

**`build-verifier` 没有命令行入口。** 它的发布检查是函数，输入（线上响应头、发布路径、历史记录）由你在部署脚本或 CI 里采集。<code>plan</code> 是构建时编译出的计划（Vite 插件的 <code>api.getPlan()</code> 在 <code>writeBundle</code> 及之后可读）。

```ts
import {
  requiredReleaseChecks,
  verifyRelease,
  verifyReleaseGateCoverage,
} from "@pwa-platform/build-verifier";

// 线上 worker、manifest 与指纹资源的最终响应头，键为绝对路径，头名小写
const observed = {
  "/sw.js": { "cache-control": "no-cache", "content-type": "text/javascript" },
  "/manifest.webmanifest": { "cache-control": "no-cache" },
  "/assets/index-BGTT0tj4.js": { "cache-control": "public, max-age=31536000, immutable" },
};

const report = verifyRelease({
  plan,
  // 构建产物实际发布的绝对路径
  published: ["/index.html", "/offline.html", "/sw.js", "/manifest.webmanifest", "/assets/index-BGTT0tj4.js"],
  observed,
  workerMimeObserved: observed,
  // 公开 HTML 的最终响应头（跟随重定向后）
  htmlObserved: {
    "/": { "cache-control": "no-cache" },
    "/offline.html": { "cache-control": "no-cache" },
  },
  baseline: storedIdentityBaseline, // 存档的生产身份基线；传 undefined 表示“查过但没有”
  retention: { asOfMs: Date.now(), previous: previousReleases, available: livePaths },
  // 共享 origin 子应用另外需要：deployedRootPlan: deployedRootPlan,
});

// 省略的输入不会被检查，空报告也是 ok: true。用必需检查集合确认没有漏项。
const coverage = verifyReleaseGateCoverage(report, requiredReleaseChecks(plan));

if (!report.ok || !coverage.ok) {
  for (const item of report.diagnostics) console.error(item.code, item.path);
  for (const name of coverage.missing) console.error("未执行的检查：", name);
  process.exitCode = 1;
}
```

要点：

- 固定模式下的输入省略即跳过：<code>published</code>、<code>observed</code>、<code>workerMimeObserved</code>、<code>htmlObserved</code>、<code>baseline</code>、<code>retention</code>（以及子应用的 <code>deployedRootPlan</code>）。所以要同时使用 <code>requiredReleaseChecks(plan)</code> 和 <code>verifyReleaseGateCoverage</code>：前者按拓扑给出必需检查（共享 origin 子应用多一项 <code>release-order</code>），后者确认报告里真的有这些检查。
- <code>ok</code> 与“覆盖完整”是两件事，门禁要同时满足。
- 上述示例适用于已发布的 npm <code>0.3.0</code>；`workerMimeObserved` 为独立的 <code>worker-mime</code> 检查提供已采集的响应头。旧版 <code>0.2.5</code> 没有该检查，其对应的本地功能正反例见[实测依据](/operations/header-evidence#实测时发生了什么)。
- 私有 HTML 与 API 的响应头不在检查内，需人工确认。

**手工用 curl 核对**（使用 GET；<code>-L</code> 跟随重定向，看输出中最后一个 HTTP 响应块）：

```sh
# worker、恢复 worker、manifest、入口页、离线页：应有 no-cache，不应有 immutable
curl -sS -L -D - -o /dev/null https://app.example.com/sw.js
curl -sS -L -D - -o /dev/null https://app.example.com/pwa-recovery-worker.js
curl -sS -L -D - -o /dev/null https://app.example.com/manifest.webmanifest
curl -sS -L -D - -o /dev/null https://app.example.com/
curl -sS -L -D - -o /dev/null https://app.example.com/offline.html

# 指纹资源：应有 immutable 和正数的 max-age
curl -sS -L -D - -o /dev/null https://app.example.com/assets/index-BGTT0tj4.js

# 离线页用 HEAD 探测 sw.js：必须是 2xx
curl -sI https://app.example.com/sw.js -o /dev/null -w '%{http_code}\n'
```

最后一条单独使用 <code>HEAD</code>，是为了确认离线页恢复探测能得到 2xx；上面的 GET 才用来核对浏览器实际会取得的资源响应头。
