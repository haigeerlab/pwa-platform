import { describe, expect, it } from "vitest";
import { describeAndroid, exposeToAndroid, readAndroidSerial } from "../src/android.js";

describe("readAndroidSerial", () => {
  it("is undefined when unset or empty", () => {
    expect(readAndroidSerial({})).toBeUndefined();
    expect(readAndroidSerial({ PWA_ANDROID_SERIAL: "" })).toBeUndefined();
  });

  it("returns the serial", () => {
    expect(readAndroidSerial({ PWA_ANDROID_SERIAL: "4a1c64d0" })).toBe("4a1c64d0");
  });

  it("refuses to combine with PWA_REAL_BROWSER", () => {
    expect(() => readAndroidSerial({ PWA_ANDROID_SERIAL: "4a1c64d0", PWA_REAL_BROWSER: "safari" })).toThrow(/cannot be combined/);
    expect(readAndroidSerial({ PWA_ANDROID_SERIAL: "4a1c64d0", PWA_REAL_BROWSER: "" })).toBe("4a1c64d0");
  });
});

describe("describeAndroid", () => {
  it("names the version, model and transport", () => {
    expect(describeAndroid("153.0.8010.53", "23127PN0CC")).toBe("Android Chrome 153.0.8010.53 (23127PN0CC, USB CDP)");
  });
});

describe("exposeToAndroid", () => {
  it("maps nothing outside an Android run", async () => {
    await expect((await exposeToAndroid(1234, {}))()).resolves.toBeUndefined();
  });
});
