// Guards the one thing ADR-0039's locale addition depends on: both framework packages independently define the
// same `PwaUpdateNoticeLocale` values and the same built-in message tables (spec: update-notice-ui, 补充验收：内置
// 语言, "由现有的跨包一致性测试守护两侧取值与文案完全一致"). Each package keeps its own copy of the tables — same
// pattern as parity.test.ts for the state machine — so without this suite the two sides are free to drift apart
// silently.
//
// The Vue side is reached through its public `./ui` entry only, matching how parity.test.ts reaches the rest of
// the Vue package.
import { describe, expect, it } from "vitest";
import { PWA_UPDATE_NOTICE_MESSAGES as REACT_MESSAGES } from "../src/ui.js";
import { PWA_UPDATE_NOTICE_MESSAGES as VUE_MESSAGES } from "@pwa-platform/vue/ui";

describe("the two packages agree on built-in update notice locales", () => {
  it("expose the same locale keys", () => {
    expect(Object.keys(REACT_MESSAGES).sort()).toEqual(["en", "zh-CN"]);
    expect(Object.keys(VUE_MESSAGES).sort()).toEqual(Object.keys(REACT_MESSAGES).sort());
  });

  it("expose byte-identical message tables for every locale", () => {
    expect(VUE_MESSAGES).toEqual(REACT_MESSAGES);
  });
});
