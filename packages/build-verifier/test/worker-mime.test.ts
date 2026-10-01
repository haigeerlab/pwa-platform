import { DIAGNOSTIC_MESSAGES, type PwaPlan } from "@pwa-platform/contracts";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyWorkerScriptMime } from "../src/worker-mime.js";

const location = decodeURIComponent(new URL("./fixtures/storefront.plan.json", import.meta.url).pathname);
const source = ts.sys.readFile(location);
if (source === undefined) throw new Error(`Cannot read ${location}`);
const plan = JSON.parse(source) as PwaPlan;
const worker = plan.identity.serviceWorkerUrl;

describe("verifyWorkerScriptMime", () => {
  it.each(["text/javascript", "application/javascript", "TEXT/JAVASCRIPT; charset=utf-8", "application/x-javascript"])(
    "accepts JavaScript MIME %s",
    (mime) => {
      expect(verifyWorkerScriptMime(plan, { [worker]: { "content-type": mime } })).toEqual({
        name: "worker-mime",
        ok: true,
        diagnostics: [],
      });
    },
  );

  it.each(["text/plain", "application/json", "text/javascript, text/plain", ""])("rejects MIME %s", (mime) => {
    const result = verifyWorkerScriptMime(plan, { [worker]: { "content-type": mime } });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([{
      code: "verify.worker-script-mime-invalid",
      severity: "error",
      path: "/identity/serviceWorkerUrl",
      message: DIAGNOSTIC_MESSAGES["verify.worker-script-mime-invalid"],
    }]);
    expect(result.diagnostics[0]?.message).not.toContain(mime || "<empty>");
  });

  it("rejects a missing Content-Type without calling it an unobserved response", () => {
    expect(verifyWorkerScriptMime(plan, { [worker]: { "cache-control": "no-cache" } }).diagnostics[0]?.code)
      .toBe("verify.worker-script-mime-invalid");
  });

  it("reports an unobserved worker once using the existing unreadable diagnostic", () => {
    expect(verifyWorkerScriptMime(plan, {}).diagnostics).toEqual([{
      code: "verify.header-unreadable",
      severity: "error",
      path: "/identity/serviceWorkerUrl",
      message: DIAGNOSTIC_MESSAGES["verify.header-unreadable"],
    }]);
  });
});
