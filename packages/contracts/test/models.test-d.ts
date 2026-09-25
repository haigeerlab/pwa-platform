import { describe, expectTypeOf, it } from "vitest";
import type {
  JsonValue,
  PwaDiagnostic,
  PwaEventReadResult,
  PwaIdentity,
  PwaInstallMetadata,
  PwaLifecycleEvent,
  PwaLifecycleEventType,
  PwaOfflineWritePolicy,
  PwaOfflineWriteTarget,
  PwaOriginRegistry,
  PwaOfflineWritePlan,
  PwaPlan,
  PwaPlanV3,
  PwaPolicy,
  PwaPolicyV3,
  PwaResourceRule,
  PwaRuntimeCachePlan,
  PwaRuntimeCachePolicy,
  PwaTopology,
  PwaValidationResult,
} from "../src/index.js";
import { identity, policy } from "./fixtures.js";

describe("PwaPlan v1", () => {
  it("has exactly the 15 top-level fields from the spec", () => {
    expectTypeOf<keyof PwaPlan>().toEqualTypeOf<
      | "schemaVersion"
      | "planVersion"
      | "policyVersion"
      | "identity"
      | "install"
      | "hostBuildOutput"
      | "topology"
      | "artifacts"
      | "precache"
      | "cacheNamespace"
      | "requestBaselineDenials"
      | "pathRules"
      | "offlineFallback"
      | "updateMode"
      | "diagnostics"
      | "networkTimeoutSeconds"
    >();
  });

  it("pins every version field to its schema version", () => {
    expectTypeOf<PwaPlan["schemaVersion"]>().toEqualTypeOf<1 | 2 | 3>();
    expectTypeOf<PwaPlan["planVersion"]>().toEqualTypeOf<1 | 2 | 3>();
    expectTypeOf<PwaPlan["policyVersion"]>().toEqualTypeOf<1 | 2 | 3>();
    expectTypeOf<PwaPolicy["schemaVersion"]>().toEqualTypeOf<1 | 2 | 3>();
  });
});

describe("PwaPolicyV3", () => {
  it("requires a closed runtime-cache policy alongside every v2 field", () => {
    expectTypeOf<PwaRuntimeCachePolicy>().toEqualTypeOf<{
      readonly enabled: boolean;
      readonly maxEntries: number;
      readonly maxEntryBytes: number;
      readonly maxAgeSeconds: number;
    }>();
    expectTypeOf<keyof PwaPolicyV3>().toEqualTypeOf<
      | "schemaVersion"
      | "install"
      | "offlineFallback"
      | "updateMode"
      | "resources"
      | "extensions"
      | "offlineWrites"
      | "runtimeCache"
      | "networkTimeoutSeconds"
    >();
    expectTypeOf<PwaPolicyV3["schemaVersion"]>().toEqualTypeOf<3>();
    expectTypeOf<PwaPolicyV3["runtimeCache"]>().toEqualTypeOf<PwaRuntimeCachePolicy>();
    expectTypeOf<PwaPolicyV3>().toExtend<PwaPolicy>();

    // @ts-expect-error runtimeCache is required on v3
    const missingRuntimeCache: PwaPolicyV3 = { ...policy, schemaVersion: 3 };
    void missingRuntimeCache;
  });
});

describe("PwaPlanV3", () => {
  it("closes over every v2 field plus a runtime-cache plan", () => {
    expectTypeOf<PwaRuntimeCachePlan>().toEqualTypeOf<
      | { readonly enabled: false }
      | {
          readonly enabled: true;
          readonly maxEntries: number;
          readonly maxEntryBytes: number;
          readonly maxAgeSeconds: number;
          readonly configDigest: string;
        }
    >();
    expectTypeOf<keyof PwaPlanV3>().toEqualTypeOf<
      | "schemaVersion"
      | "planVersion"
      | "policyVersion"
      | "identity"
      | "install"
      | "hostBuildOutput"
      | "topology"
      | "artifacts"
      | "precache"
      | "cacheNamespace"
      | "requestBaselineDenials"
      | "pathRules"
      | "offlineFallback"
      | "updateMode"
      | "diagnostics"
      | "offlineWrites"
      | "runtimeCache"
      | "networkTimeoutSeconds"
    >();
    expectTypeOf<PwaPlanV3["schemaVersion"]>().toEqualTypeOf<3>();
    expectTypeOf<PwaPlanV3["runtimeCache"]>().toEqualTypeOf<PwaRuntimeCachePlan>();
    expectTypeOf<PwaPlanV3>().toExtend<PwaPlan>();

    // @ts-expect-error runtimeCache is required on v3
    const missingRuntimeCache: Pick<PwaPlanV3, "schemaVersion" | "runtimeCache"> = { schemaVersion: 3 };
    void missingRuntimeCache;
  });
});

describe("PwaTopology", () => {
  it("is a closed union discriminated by kind, carrying a registry only when shared", () => {
    expectTypeOf<PwaTopology["kind"]>().toEqualTypeOf<"standalone-origin" | "shared-origin">();
    expectTypeOf<Extract<PwaTopology, { kind: "shared-origin" }>["registry"]>().toEqualTypeOf<PwaOriginRegistry>();
    expectTypeOf<Extract<PwaTopology, { kind: "standalone-origin" }>>().toEqualTypeOf<{
      readonly kind: "standalone-origin";
    }>();

    // @ts-expect-error a standalone topology cannot carry a registry
    const invalid: PwaTopology = { kind: "standalone-origin", registry: undefined };
    void invalid;
  });
});

describe("offline write policy contracts", () => {
  it("keeps a target and its queue limits structurally distinct", () => {
    expectTypeOf<PwaOfflineWriteTarget>().toEqualTypeOf<{
      readonly id: string;
      readonly pathPrefix: `/${string}`;
      readonly maxBodyBytes: number;
    }>();
    expectTypeOf<PwaOfflineWritePolicy>().toEqualTypeOf<{
      readonly enabled: boolean;
      readonly maxEntries: number;
      readonly maxTotalBodyBytes: number;
      readonly targets: readonly PwaOfflineWriteTarget[];
    }>();
  });

  it("keeps worker-facing queue configuration free of policy extensions", () => {
    expectTypeOf<PwaOfflineWritePlan>().toEqualTypeOf<
      | { readonly enabled: false }
      | {
          readonly enabled: true;
          readonly databaseName: string;
          readonly maxEntries: number;
          readonly maxTotalBodyBytes: number;
          readonly targets: readonly { readonly id: string; readonly pathPrefix: `/${string}`; readonly maxBodyBytes: number }[];
        }
    >();
  });
});

describe("PwaIdentity", () => {
  it("has exactly the platform-owned identity fields", () => {
    expectTypeOf<keyof PwaIdentity>().toEqualTypeOf<
      | "appId"
      | "manifestId"
      | "origin"
      | "scope"
      | "serviceWorkerUrl"
      | "manifestUrl"
      | "mountPath"
      | "environment"
      | "cacheNamespaceSeed"
    >();
  });

  it("rejects relative identity paths", () => {
    // @ts-expect-error scope must be an absolute path
    const invalid: PwaIdentity = { ...identity, scope: "app/" };
    void invalid;
  });
});

describe("PwaPolicy", () => {
  it("cannot express identity overrides or baseline denial overrides", () => {
    type ForbiddenKeys =
      | keyof PwaIdentity
      | "identity"
      | "scope"
      | "requestBaselineDenials"
      | "pathRules"
      | "workbox"
      | "handler";
    expectTypeOf<Extract<keyof PwaPolicy, ForbiddenKeys>>().toBeNever();
    expectTypeOf<Extract<keyof PwaInstallMetadata, keyof PwaIdentity | "scope">>().toBeNever();

    // @ts-expect-error policy cannot carry identity
    const withIdentity: PwaPolicy = { ...policy, identity };
    void withIdentity;
  });

  it("only allows path prefixes, classes and named cache strategies in rules", () => {
    expectTypeOf<keyof PwaResourceRule>().toEqualTypeOf<"pathPrefix" | "resourceClass" | "cache">();

    const rules: PwaResourceRule[] = [
      // @ts-expect-error callbacks are not expressible
      { pathPrefix: "/api", resourceClass: "public-data", cache: "none", handler: () => undefined },
      // @ts-expect-error regular expressions are not expressible
      { pathPrefix: /^\/api/, resourceClass: "public-data", cache: "none" },
      // @ts-expect-error prefixes are mountPath-relative absolute segments
      { pathPrefix: "api", resourceClass: "public-data", cache: "none" },
      // @ts-expect-error raw Workbox strategy names are not accepted
      { pathPrefix: "/api", resourceClass: "public-data", cache: "NetworkFirst" },
    ];
    void rules;
  });

  it("only supports prompt updates in v1", () => {
    // @ts-expect-error immediate activation is not a policy choice
    const immediate: PwaPolicy = { ...policy, updateMode: "immediate" };
    void immediate;
  });
});

describe("serializable shapes", () => {
  it("every public model is assignable to JsonValue", () => {
    expectTypeOf<PwaIdentity>().toExtend<JsonValue>();
    expectTypeOf<PwaInstallMetadata>().toExtend<JsonValue>();
    expectTypeOf<PwaPolicy>().toExtend<JsonValue>();
    expectTypeOf<PwaPlan>().toExtend<JsonValue>();
    expectTypeOf<PwaLifecycleEvent>().toExtend<JsonValue>();
    expectTypeOf<PwaDiagnostic>().toExtend<JsonValue>();
  });

  it("does not allow extensions on the closed plan", () => {
    expectTypeOf<Extract<keyof PwaPlan, "extensions">>().toBeNever();
  });
});

describe("PwaValidationResult", () => {
  it("is a single discriminated union handled exhaustively", () => {
    const describeResult = (result: PwaValidationResult<PwaPolicy>): string => {
      switch (result.ok) {
        case true:
          expectTypeOf(result.value).toEqualTypeOf<PwaPolicy>();
          expectTypeOf(result.diagnostics[0]!.severity).toEqualTypeOf<"warning">();
          return "ok";
        case false:
          expectTypeOf(result.diagnostics[0]).toEqualTypeOf<PwaDiagnostic>();
          // @ts-expect-error failed results carry no value
          void result.value;
          return result.diagnostics[0].code;
        default:
          expectTypeOf(result).toBeNever();
          return result;
      }
    };
    void describeResult;
  });

  it("requires at least one diagnostic on failure", () => {
    // @ts-expect-error an empty failure is not representable
    const empty: PwaValidationResult<PwaPolicy> = { ok: false, diagnostics: [] };
    void empty;
  });
});

describe("PwaLifecycleEvent", () => {
  it("narrows by event type and rejects unknown names", () => {
    expectTypeOf<Extract<PwaLifecycleEvent, { type: "installed" }>["type"]>().toEqualTypeOf<"installed">();
    expectTypeOf<PwaLifecycleEvent["metadata"][string]>().toEqualTypeOf<string | number | boolean | null>();
    // @ts-expect-error push events are not part of the foundation event set
    const push: PwaLifecycleEvent["type"] = "push-clicked";
    void push;
  });

  it("gives consumers an exhaustive known / unknown / invalid result", () => {
    const handle = (result: PwaEventReadResult): string => {
      switch (result.kind) {
        case "known":
          expectTypeOf(result.event.type).toEqualTypeOf<PwaLifecycleEventType>();
          return result.event.type;
        case "unknown":
          expectTypeOf(result.event.type).toEqualTypeOf<string>();
          return "ignored";
        case "invalid":
          expectTypeOf(result.diagnostics[0]).toEqualTypeOf<PwaDiagnostic>();
          return result.diagnostics[0].code;
        default:
          expectTypeOf(result).toBeNever();
          return result;
      }
    };
    void handle;
  });
});
