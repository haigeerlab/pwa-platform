import type { Response } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { NavigationStatusUnavailableError } from "./real-browser.js";
import { readRealBrowserKind } from "./webdriver.js";

/** Annotation type under which a check that a real browser cannot make is recorded, so it shows up in reports. */
export const UNVERIFIABLE_ANNOTATION = "unverifiable-on-real-browser";

function record(description: string): void {
  test.info().annotations.push({ type: UNVERIFIABLE_ANNOTATION, description });
}

/**
 * `expect(response.status()).toBe(expected)` for a `page.goto` response. Safari 18.6 reports no navigation status
 * (no `responseStatus` in Navigation Timing, no WebDriver command), so there the check is recorded as an
 * `UNVERIFIABLE_ANNOTATION` annotation instead of passing silently or failing (ADR-0047).
 */
export function expectNavigationStatus(response: Response | null, expected: number): void {
  expect(response, "page.goto returned no response").not.toBeNull();
  if (readRealBrowserKind(process.env) !== undefined) {
    try {
      (response as Response).status();
    } catch (error) {
      if (!(error instanceof NavigationStatusUnavailableError)) throw error;
      record(`navigation status ${expected}: this browser reports no navigation status`);
      return;
    }
  }
  expect((response as Response).status()).toBe(expected);
}

/**
 * `expect(response.fromServiceWorker()).toBe(expected)` for a `page.goto` response. A real browser can only tell that a
 * response did not come over the network, so `expected === false` is checked as is, while `expected === true` is
 * checked when the response is network-free and otherwise recorded as an `UNVERIFIABLE_ANNOTATION` annotation: a worker
 * that relays a network response looks like a plain network response in Safari (see `RealResponse.fromServiceWorker`).
 */
export function expectFromServiceWorker(response: Response | null, expected: boolean): void {
  expect(response, "page.goto returned no response").not.toBeNull();
  const actual = (response as Response).fromServiceWorker();
  if (expected && !actual && readRealBrowserKind(process.env) !== undefined) {
    record("fromServiceWorker true: Safari cannot tell a worker relaying a network response from the network");
    return;
  }
  expect(actual).toBe(expected);
}
