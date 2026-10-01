import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// Local, non-blocking run in the Safari of a USB-connected iPhone (ADR-0049): the same suite, with the harness
// driving the phone through a W3C WebDriver session of the Mac's safaridriver, with every server reached over a LAN HTTPS
// proxy. PWA_IOS_UDID, PWA_IOS_LAN_IP and PWA_IOS_TLS_DIR select the device (all three are required). One device runs one
// session at a time, so everything is serial.
for (const name of ["PWA_IOS_UDID", "PWA_IOS_LAN_IP", "PWA_IOS_TLS_DIR"]) {
  if ((process.env[name] ?? "") === "") throw new Error(`${name} must be set to use this config (all of PWA_IOS_UDID, PWA_IOS_LAN_IP, PWA_IOS_TLS_DIR)`);
}

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  // Copies the static fixture site and the built page entry into the git-ignored browser-build/.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  projects: [{ name: "ios" }],
});

export default config;
