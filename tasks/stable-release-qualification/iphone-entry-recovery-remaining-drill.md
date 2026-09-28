# iPhone 入口恢复演练：补测第 4b、5、6 步

2026-09-28 的 iPhone React 单 Origin 演练（[verification.md](verification.md)“iPhone React 入口恢复单 Origin 故障演练（R3，部分完成）”）完成了第 1、2、3、4a、8 步，余下三步因为拿不到可靠的“只有当前 Origin 不可达”环境而未执行。本单只覆盖这三步；步骤编号与判定标准以[入口恢复演练](../../docs/operations/entry-recovery-drill.md)为准，本单只补 iPhone 上的具体做法。

## 先准备：不经过 WARP 的单域名屏蔽

上一轮试过的三种办法都不可用：Wi-Fi HTTP 代理与 PAC 拦不住 iOS 的 HTTP/3（QUIC）直连；经开启 Cloudflare One/WARP 的 Mac 转发会被重签 TLS；同一台 Mac 也无法给手机提供自建 DNS。**必须让 React drill 的主机名在 DNS 层解析失败**，这样 QUIC 与 TCP 都连不上。任选其一：

- **路由器域名屏蔽**（首选）：在 iPhone 所连 Wi-Fi 的路由器上，把 React drill 主机名加入屏蔽或家长控制列表；Vue drill 的主机名**不要**屏蔽。
- **另一台不装 WARP 的机器做 DNS**：例如在另一台电脑或树莓派上运行 dnsmasq，把 React drill 主机名解析到 `0.0.0.0`，其余转发到公共 DNS；iPhone 的 Wi-Fi 设置里把 DNS 改为“手动”并只填这台机器的地址。

**屏蔽生效的判据**（在 iPhone 上确认，不要在 Mac 上确认）：Safari 打开 React drill 的地址报“无法找到服务器”，同时打开 Vue drill 正常。iOS 会缓存 DNS，改完后先开关一次飞行模式。

另外：
- 关闭 iPhone 的“iCloud 私人中继”和“限制 IP 地址跟踪”，否则 DNS 查询可能绕过你设置的服务器。
- 演练前确认主屏幕上的 React Drill 网页 App 已在线打开过、平台 worker 已接管（与上一轮相同）。
- 清单沿用上一轮的交入方式（示例页 `__entryUpdate` / `__entryCheck`）；上一轮收尾序号为 3100，本轮从 **3101** 起递增。
- 两个 drill 当前部署的是 0.2.1 构建；`entry-resilience` 从 0.2.1 到 0.2.3 源码未变（见 [0.2.3 发布记录](../package-distribution/release-0.2.3.md)），无需重新部署。

## 第 4b 步：当前 Origin 不可达、已存 `normal` → `unconfirmed-outage`

1. **在屏蔽生效前**，在线交入 `normal` 清单（序号 3101，`entries` 含 Vue drill 一条入口）。`checkEntryRecovery()` 应为 `none`：主入口可达。
2. 打开屏蔽，开关一次飞行模式，从主屏幕图标重新打开 React Drill：应用壳应从缓存启动。
3. 调用 `checkEntryRecovery({ returnPath })`：
   - **预期** `available`，状态 `unconfirmed-outage`，入口只有 Vue drill。
   - 主入口探测最多等 **5 秒**，然后再逐个探测备用入口（[入口恢复](../../website/guide/entry-resilience.md)），结果大约 5–10 秒后返回，不是卡住。
4. 打开返回的恢复页链接：显示入口按钮（不是离线降级页），**不自动跳转**；点击后到达 Vue drill，`pwa-return` 与传入一致。
5. 解除屏蔽，开关一次飞行模式。

记录：结果状态、从调用到返回的大致秒数、恢复页截图。

## 第 5 步：整机离线不被误报

1. 在线交入 `normal` 清单（序号 3102，`entries` 保留 Vue drill）。`checkEntryRecovery()` 为 `none`。
2. 打开飞行模式并关闭 Wi-Fi（整机离线，两个 Origin 都不可达），从主屏幕图标重新打开 React Drill。
3. 调用 `checkEntryRecovery()`：**预期仍为 `none`**，恢复页没有按钮。原因：主入口不可达，但备用入口同样探测不通，平台只展示探测确认可达的入口。
4. 恢复网络。

注意：iOS 断网时请求可能**挂起**而不是立即失败（R9 复核中观察到），此时依靠两次各 5 秒的探测超时，结果可能要 10 秒左右才返回。若超过 30 秒仍无结果，记为异常，并记录现象。

## 第 6 步：过期

不修改手机时钟（改时钟会同时影响 TLS 校验），改用短有效期清单：

1. 在线交入 `migrating` 清单（序号 3103，`expiresAt` 设为当前 UTC 时间之后约 **3 分钟**，格式为不带毫秒的 `YYYY-MM-DDTHH:mm:ssZ`，交入前先按演练文档用 `parseEntryManifest` 自查）。`checkEntryRecovery()` 为 `available/migrating`。
2. 等过了 `expiresAt`，再调用 `checkEntryRecovery()`：**预期 `none`**，诊断中含 `entry.expired`；恢复页没有按钮。

## 收尾

交入 `normal` 空清单（序号 3104），`checkEntryRecovery()` 为 `none`；撤销路由器或 DNS 的屏蔽，把 iPhone 的 DNS 改回“自动”，并重新打开“私人中继”等设置。

## 记录

结果按[演练文档的记录模板](../../docs/operations/entry-recovery-drill.md#记录模板)写入 [verification.md](verification.md) 新的一节，每一步写明：设备与 iOS 版本、屏蔽方式、序号、结果状态、诊断码、耗时，以及“通过 / 不通过 / 未执行”；不通过时附截图或检查器读数。三步都通过后，把 R3 的 iPhone 部分从“部分完成”改为“通过”，并同步证据台账第 17 行。
