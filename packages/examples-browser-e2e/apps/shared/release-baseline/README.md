# 身份发布基线

按[身份发布基线](../../../../../docs/operations/identity-release-baseline.md)的约定存放：`<基线目录>/<槽位名>.json`，
一个部署槽位一个文件，与应用的身份配置一同受版本控制（ADR-0008）。

`production.json` 是这两个示例共用的槽位基线。它是**手写的记录**，不是从 `identity.ts` 生成的——
基线的意义正在于独立于当前源码：身份被改动时，比较必须报出漂移，而不是跟着一起变。

写入基线是生产发布成功之后的动作，属于发布流程；`readIdentityBaseline` 只读不写（ADR-0014）。
