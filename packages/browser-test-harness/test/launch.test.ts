import { describe, expect, it } from "vitest";
import { desktopLaunchOverrides } from "../src/launch.js";

describe("desktopLaunchOverrides", () => {
  it("keeps the configured channel unless an executable is given", () => {
    expect(desktopLaunchOverrides({})).toEqual({});
    expect(desktopLaunchOverrides({ PWA_HARNESS_CHROME_PATH: "" })).toEqual({});
  });

  it("uses PWA_HARNESS_CHROME_PATH as the executable", () => {
    expect(desktopLaunchOverrides({ PWA_HARNESS_CHROME_PATH: "/opt/chrome-n-1/chrome" })).toEqual({
      executablePath: "/opt/chrome-n-1/chrome",
    });
  });
});
