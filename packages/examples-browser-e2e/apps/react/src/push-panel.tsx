// Reference implementation and test vehicle for spec/push-module.md's "修订：真实订阅与真实送达的证据收尾" and
// spec/examples-browser-e2e.md's "修订：React 示例的 Push 演示". A real application sends the subscription to its own
// backend after `subscribePush` resolves, instead of offering to copy it to the clipboard the way this panel does —
// the copy button exists only so the network suite (XP4) can read a real subscription back out without a page hook.
//
// This does not change the platform's own stance (ADR-0005, ADR-0013): the platform still renders nothing, and this
// panel never touches `endpoint`, `keys.p256dh` or `keys.auth` in the DOM — only in component state, and only long
// enough to serialize it for the clipboard on request.
import { getPushState, PwaPushClientError, subscribePush, unsubscribePush, type PwaPushState } from "@pwa-platform/push";
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { SHELL_URL } from "../../shared/identity.js";

const TARGET = { scope: SHELL_URL };

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.75rem 1rem",
  marginTop: "1rem",
  border: "1px solid #ccc",
};

/**
 * A subscription is kept only in state, never rendered. `PushSubscriptionJSON` carries `endpoint` and `keys`, both
 * of which spec/push-module.md forbids putting in the DOM (or in any log or diagnostic).
 */
export function PushPanel(): ReactElement {
  const [state, setState] = useState<PwaPushState | "checking">("checking");
  const [key, setKey] = useState("");
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(null);
  const [result, setResult] = useState<string>("");
  // Several reads can be in flight (mount, `ready`, after an action); only the latest may set the state, or an older
  // "not-subscribed" could land after a newer "subscribed".
  const latestRead = useRef(0);

  const refreshState = (): void => {
    const read = ++latestRead.current;
    // getPushState rejects (push.registration-failed / push.subscription-failed) when the browser's own lookup does.
    getPushState(TARGET).then(
      (next) => {
        if (read === latestRead.current) setState(next);
      },
      (error: unknown) => {
        if (read === latestRead.current) setResult(error instanceof PwaPushClientError ? error.code : "error");
      },
    );
  };

  useEffect(() => {
    refreshState();
    // main.tsx registers the worker asynchronously at startup, so the first read above usually races it and reports
    // "no-registration". Read again once a registration is active; `ready` never settles where there is none to wait
    // for, which is fine — the first read already stands.
    if ("serviceWorker" in navigator) void navigator.serviceWorker.ready.then(refreshState);
  }, []);

  const onSubscribe = (): void => {
    // Only ever called from this click handler (spec: "订阅只在按钮点击时发起"), never from an effect or on mount.
    subscribePush(TARGET, { applicationServerKey: key }).then(
      (json) => {
        setSubscription(json);
        setResult("subscribed");
        refreshState();
      },
      (error: unknown) => {
        setSubscription(null);
        setResult(error instanceof PwaPushClientError ? error.code : "error");
        refreshState();
      },
    );
  };

  const onUnsubscribe = (): void => {
    unsubscribePush(TARGET).then(
      () => {
        setSubscription(null);
        setResult("unsubscribed");
        refreshState();
      },
      (error: unknown) => {
        setResult(error instanceof PwaPushClientError ? error.code : "error");
        refreshState();
      },
    );
  };

  const onCopy = (): void => {
    if (subscription === null) return;
    navigator.clipboard.writeText(JSON.stringify(subscription)).then(
      () => setResult("copied"),
      () => setResult("copy-failed"),
    );
  };

  const disabled = state === "unsupported" || state === "checking";

  return (
    <div style={PANEL_STYLE}>
      <p id="push-state">{state}</p>
      <input
        id="push-key"
        type="text"
        placeholder="VAPID public key (base64url)"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        disabled={disabled}
      />
      <div>
        <button id="push-subscribe" onClick={onSubscribe} disabled={disabled}>
          Subscribe
        </button>
        <button id="push-unsubscribe" onClick={onUnsubscribe} disabled={disabled}>
          Unsubscribe
        </button>
        <button id="push-copy" onClick={onCopy} disabled={disabled || subscription === null}>
          Copy subscription JSON
        </button>
      </div>
      <p id="push-result">{result}</p>
    </div>
  );
}
