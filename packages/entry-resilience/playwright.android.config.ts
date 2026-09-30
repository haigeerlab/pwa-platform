import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// Local, non-blocking run in the Chrome of a USB-connected Android phone (ADR-0048): the same suite, with the harness
// connecting `browser` to the phone over DevTools. PWA_ANDROID_SERIAL=<adb serial> selects the device. One device runs
// one session at a time, so everything is serial.
if ((process.env.PWA_ANDROID_SERIAL ?? "") === "") {
  throw new Error("PWA_ANDROID_SERIAL must be set to the adb serial of the phone to use this config");
}

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  projects: [{ name: "android" }],
});

export default config;
