import type { PwaIdentity, PwaInstallMetadata } from "@pwa-platform/contracts";
import { IDENTITY, INSTALL } from "./identity.js";

/** Keep the local React/Vue comparison fixture unchanged unless a Cloudflare build is explicit. */
export function identityForCloudflare(host: "react" | "vue"): PwaIdentity {
  const target = process.env.PWA_PLATFORM_CF_TARGET;
  const origin = process.env.PWA_PLATFORM_CF_ORIGIN;
  const slot = process.env.PWA_PLATFORM_CF_SLOT ?? "main";
  if (target === undefined && origin === undefined) return IDENTITY;
  if (target !== host || origin === undefined) {
    throw new Error("Cloudflare build target and origin must both match the host configuration");
  }
  if (slot !== "main" && slot !== "drill") {
    throw new Error("Cloudflare PWA slot must be main or drill");
  }
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) {
    throw new Error("Cloudflare PWA identity requires an HTTPS origin without a path or credentials");
  }
  return {
    ...IDENTITY,
    appId: host === "react" ? (slot === "main" ? "pwareactdemo" : "pwareactdrill") : (slot === "main" ? "pwavuedemo" : "pwavuedrill"),
    origin,
    environment: "test",
  };
}

/** Give installed Cloudflare demos distinct launcher names without changing the local comparison fixture. */
export function installForCloudflare(host: "react" | "vue"): PwaInstallMetadata {
  const target = process.env.PWA_PLATFORM_CF_TARGET;
  const origin = process.env.PWA_PLATFORM_CF_ORIGIN;
  const slot = process.env.PWA_PLATFORM_CF_SLOT ?? "main";
  if (target === undefined && origin === undefined) return INSTALL;
  if (target !== host || origin === undefined || (slot !== "main" && slot !== "drill")) {
    throw new Error("Cloudflare install metadata must match the host identity configuration");
  }
  const hostName = host === "react" ? "React" : "Vue";
  const slotName = slot === "main" ? "Demo" : "Drill";
  return {
    ...INSTALL,
    name: `PWA Platform ${hostName} ${slotName}`,
    shortName: `${hostName} ${slotName}`,
  };
}
