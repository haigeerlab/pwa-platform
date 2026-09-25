// The page-side facade. The application never touches navigator.serviceWorker: registration, the install prompt,
// the update confirmation and logout all go through this object, and every listener it adds is removed by dispose().
import {
  isOfflineWriteClearResult,
  isRuntimeCachePendingResult,
  isRuntimeCacheServedMessage,
  SKIP_WAITING_MESSAGE,
} from "@pwa-platform/sw-runtime/messages";
import { validateClientConfig, type PwaClientConfig } from "../shared/config.js";
import { clientEvent, type PwaClientEvent, type PwaClientEventMetadata, type PwaClientEventType } from "./events.js";
import { createUpdateScheduler, validateUpdateCheckIntervalMs, type UpdateCheckDocument } from "./update-check.js";

/**
 * `beforeinstallprompt`, which no standard DOM lib declares. Only the two members the facade uses are named; the
 * event is saved and handed back to the browser untouched.
 */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
};

export type PwaInstallOutcome = "accepted" | "dismissed" | "unavailable";

export type PwaUpdateCheckResult = "update-available" | "up-to-date" | "unavailable";

/** How long `applyUpdate` waits for the confirmed worker to take control before giving up. */
const TAKEOVER_TIMEOUT_MS = 10_000;
const CLEAR_TIMEOUT_MS = 10_000;
/** How long the pending-served query waits for the worker's reply (same bound as the offline-write clear handshake). */
const RUNTIME_CACHE_PENDING_TIMEOUT_MS = 10_000;

/** A takeover wait in flight. Exposed to `applyUpdate` so a failure to post can stop it instead of leaking it. */
type PendingTakeover = {
  /** Resolves when another worker takes control; rejects on timeout, on cancel and when the facade is disposed. */
  readonly settled: Promise<void>;
  /** Stops waiting and rejects `settled`. Harmless once it has settled. */
  readonly cancel: () => void;
};

export type PwaClientOptions = {
  readonly config: PwaClientConfig;
  /** Defaults to `navigator.serviceWorker`; passed explicitly only to inject a fake in tests. */
  readonly container?: ServiceWorkerContainer;
  /** Listening target for the install events; defaults to the global `window`, injected only in tests. */
  readonly target?: EventTarget;
  /**
   * Automatic periodic checks. Omitted means off, and `options.document` is then never resolved — not even to the
   * global `document` — since nothing needs page visibility.
   */
  readonly updateCheck?: { readonly intervalMs: number };
  /** Visibility source for the automatic check; defaults to the global `document`, injected only in tests. */
  readonly document?: UpdateCheckDocument;
  /** Creates a one-shot message channel for the logout cleanup handshake; injected only in tests. */
  readonly messageChannel?: () => MessageChannel;
};

export type PwaClient = {
  /** Registers the plan's worker at the plan's scope. Repeated calls reuse the first registration. */
  register(): Promise<void>;
  /**
   * Shows the saved install prompt and resolves with the user's choice. Returns `"unavailable"` when no prompt is
   * held — the browser never offered one, it was already used, or the plan has no install metadata.
   */
  promptInstall(): Promise<PwaInstallOutcome>;
  /**
   * Confirms a waiting update and resolves once the new worker controls the page. Returns `false` when nothing is
   * waiting. Never reloads the page: that is the application's decision. Throws if the takeover times out, if the
   * confirmation cannot be delivered, or if the facade is disposed while waiting.
   */
  applyUpdate(): Promise<boolean>;
  /** Clears the worker-owned offline-write queue, then unregisters. Returns `false` if either prerequisite is unavailable or fails. */
  logout(): Promise<boolean>;
  /**
   * Asks the browser to check `config.serviceWorkerUrl` for a new version right now. Returns `"unavailable"` when
   * there is no registration. Never sends the confirmation message and never lets a new version take control — a
   * version it finds still reaches `update-waiting` only through the existing install-watching path, once it
   * finishes installing. On a first visit, `"update-available"` can report the first worker still installing, for
   * which no `update-waiting` follows: the result is a hint, the event is what prompts. Concurrent calls share one
   * in-flight check; once it settles, the next call starts a new one.
   */
  checkForUpdate(): Promise<PwaUpdateCheckResult>;
  subscribe(listener: (event: PwaClientEvent) => void): () => void;
  /** Removes every listener this facade added. Afterwards its methods throw; calling it again is harmless. */
  dispose(): void;
};

/** Validates the config and returns a facade bound to it. Throws for an invalid config. */
export function createPwaClient(options: PwaClientOptions): PwaClient {
  const config = validateClientConfig(options.config);
  const container = options.container ?? defaultContainer();
  // Validated and resolved before the install target and the facade's state: an invalid intervalMs throws before
  // anything is listened to, and `options.document` (or the global `document`) stays untouched when `updateCheck`
  // is omitted.
  const updateCheckIntervalMs =
    options.updateCheck !== undefined ? validateUpdateCheckIntervalMs(options.updateCheck.intervalMs) : undefined;
  const updateCheckDocument = updateCheckIntervalMs !== undefined ? (options.document ?? defaultDocument()) : undefined;
  const createMessageChannel = options.messageChannel ?? (() => new MessageChannel());

  const listeners = new Set<(event: PwaClientEvent) => void>();
  /**
   * Everything dispose() must undo: listener removals and timer cancellations. A set rather than a list, because
   * waits and registrations are also undone individually (a settled takeover, a logout) and must not pile up here
   * for the lifetime of the facade.
   */
  const teardown = new Set<() => void>();
  let registration: Promise<ServiceWorkerRegistration> | undefined;
  let stopWatching: (() => void) | undefined;
  /** Removes the runtime-cache-served listener `register()` attached; tied to the registration's lifetime, not the facade's. */
  let stopRuntimeCacheMessages: (() => void) | undefined;
  let installPrompt: BeforeInstallPromptEvent | undefined;
  /** The worker `update-waiting` was last announced for, so the two detection paths cannot announce it twice. */
  let announcedWaiting: ServiceWorker | undefined;
  /** A `checkForUpdate()` in flight, shared by concurrent callers; cleared once it settles either way. */
  let pendingCheck: Promise<PwaUpdateCheckResult> | undefined;
  let nextClearRequestId = 1;
  let disposed = false;

  function alive(): void {
    if (disposed) throw new Error("This PWA client has been disposed");
  }

  /** Registers an undo callback and returns a handle that runs it once and forgets it. */
  function track(undo: () => void): () => void {
    teardown.add(undo);
    return () => {
      if (teardown.delete(undo)) undo();
    };
  }

  // No `disposed` check here on purpose: dispose() empties `listeners`, so a dispatch that races a dispose reaches
  // nobody anyway. A second guard would be unreachable code no test could tell apart from its absence.
  function emit(type: PwaClientEventType, metadata: PwaClientEventMetadata): void {
    const event = clientEvent(type, config.appId, metadata);
    // A copy, so a listener that unsubscribes during delivery does not change this dispatch. Each listener is
    // isolated: one that throws must not keep the others from seeing the event, nor fail the caller that emitted it.
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Deliberately swallowed; a faulty subscriber is not the platform's failure to report.
      }
    }
  }

  /**
   * An update is a worker waiting while another one still controls the page. On a first visit nothing controls the
   * page yet, so the worker that just installed is not an update and must not prompt anyone.
   */
  function announceWaiting(waiting: ServiceWorker | null): void {
    if (waiting === null || container.controller === null || waiting === announcedWaiting) return;
    announcedWaiting = waiting;
    emit("update-waiting", {});
  }

  /**
   * Watches one registration for versions that install later in this page's lifetime. Returns a handle that removes
   * every listener it added, so logging out can stop watching a registration that no longer exists.
   */
  function watchForUpdates(current: ServiceWorkerRegistration): () => void {
    announceWaiting(current.waiting);
    const undoAll: (() => void)[] = [];

    const onControllerChange = (): void => {
      // This is a page-side completion, not the worker's generic activation event: only a facade that previously
      // told its application a version was waiting can tell it that this particular prompt is no longer actionable.
      // Every controlled same-scope page observes its own controllerchange, so another tab's confirmation and the
      // recovery worker both clear stale prompts without a page-to-page channel or worker message protocol.
      if (announcedWaiting === undefined) return;
      announcedWaiting = undefined;
      emit("update-applied", {});
    };
    container.addEventListener("controllerchange", onControllerChange);
    undoAll.push(track(() => container.removeEventListener("controllerchange", onControllerChange)));

    const onUpdateFound = (): void => {
      const installing = current.installing;
      if (installing === null) return;
      const onStateChange = (): void => {
        // The worker being watched is the one that reached "installed", so it is the one now waiting. Reading
        // `registration.waiting` instead would assume the slot is already updated, and while it still held the
        // previous version this update would be swallowed as a duplicate.
        if (installing.state === "installed") announceWaiting(installing);
      };
      installing.addEventListener("statechange", onStateChange);
      undoAll.push(track(() => installing.removeEventListener("statechange", onStateChange)));
    };

    current.addEventListener("updatefound", onUpdateFound);
    undoAll.push(track(() => current.removeEventListener("updatefound", onUpdateFound)));

    return () => {
      for (const undo of undoAll.splice(0)) undo();
    };
  }

  /**
   * Waits for another worker to take control. `applyUpdate` subscribes before it posts the confirmation; today the
   * two run in one synchronous block, so no `controllerchange` could arrive between them either way, but keeping
   * the subscription first means an `await` added between them later cannot open that gap.
   *
   * The listener and the timer are registered with `track`, so dispose() reaches this wait too. Without that, a
   * facade retired mid-update would keep a timer alive and reject ten seconds later into a promise the application
   * had already stopped awaiting — an unhandled rejection with no owner.
   */
  function takeover(): PendingTakeover {
    let cancel = (): void => undefined;
    const settled = new Promise<void>((resolve, reject) => {
      const finish = (settle: () => void) => (): void => {
        clearTimeout(timer);
        container.removeEventListener("controllerchange", onControllerChange);
        teardown.delete(stop);
        settle();
      };
      const onControllerChange = (): void => finish(resolve)();
      const timer = setTimeout(
        finish(() => reject(new Error("The confirmed worker did not take control in time"))),
        TAKEOVER_TIMEOUT_MS,
      );
      // What dispose() runs must both clean up *and* settle this promise. Registering only the cleanup would
      // leave `applyUpdate` awaiting a promise that can never settle — a hang instead of a stray rejection.
      const stop = finish(() => reject(new Error("Stopped waiting for the worker to take control")));
      cancel = stop;
      container.addEventListener("controllerchange", onControllerChange);
      teardown.add(stop);
    });
    return { settled, cancel: () => cancel() };
  }

  /**
   * The actual check: fetch the registration, ask the browser to re-fetch the worker script, then read what it
   * left behind. `installing`/`waiting` are read after `update()` settles, not derived from its resolution value —
   * the browser API itself carries no result beyond "the check finished".
   */
  async function performUpdateCheck(): Promise<PwaUpdateCheckResult> {
    const current = await container.getRegistration(config.scope);
    if (current === undefined) return "unavailable";
    await current.update();
    return current.installing !== null || current.waiting !== null ? "update-available" : "up-to-date";
  }

  /**
   * The coalescing entry point both `checkForUpdate()` and the automatic scheduler call, so a manual and an
   * automatic check in flight at the same time share one `update()` call instead of issuing two.
   */
  function sharedUpdateCheck(): Promise<PwaUpdateCheckResult> {
    if (pendingCheck === undefined) {
      pendingCheck = performUpdateCheck();
      // A caller that awaits checkForUpdate() already handles a rejection; this second, unreferenced branch off
      // the same promise exists only to clear the slot, and must not itself surface as an unhandled rejection.
      pendingCheck.then(
        () => (pendingCheck = undefined),
        () => (pendingCheck = undefined),
      );
    }
    return pendingCheck;
  }

  /** Clears worker-owned sensitive queue state through a one-shot port before the registration can disappear. */
  function clearOfflineWrites(worker: ServiceWorker): Promise<void> {
    const requestId = `logout-${nextClearRequestId++}`;
    const channel = createMessageChannel();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        channel.port1.close();
        settle();
      };
      const timeout = setTimeout(() => finish(() => reject(new Error("The worker did not acknowledge offline-write cleanup in time"))), CLEAR_TIMEOUT_MS);
      channel.port1.onmessage = (event) => {
        if (isOfflineWriteClearResult(event.data, requestId)) finish(resolve);
        else finish(() => reject(new Error("The worker sent an invalid offline-write cleanup acknowledgement")));
      };
      channel.port1.onmessageerror = () => finish(() => reject(new Error("The worker sent an unreadable offline-write cleanup acknowledgement")));
      channel.port1.start();
      try {
        worker.postMessage({ type: "pwa:offline-write:clear", version: 1, requestId }, [channel.port2]);
      } catch (error) {
        finish(() => reject(error));
      }
    });
  }

  /**
   * Listens for the worker's runtime-cache-served signal (spec "页面信号"). Accepts only a message from the current
   * controller whose shape sw-runtime's own validator recognizes; everything else — another app's worker, a
   * malformed payload, a message some other part of the application posted — is ignored silently, never thrown or
   * logged. Does not call `container.startMessages()`: that would release every queued worker message the moment
   * this listener attaches, ahead of any listener the application itself adds, changing delivery order for every
   * app regardless of whether it uses this feature. The browser starts delivering messages on its own once any
   * listener is attached and the page performs another turn of the event loop, so a listener added here still
   * observes messages, just not ones queued before the *first* listener anywhere on the page attached.
   *
   * The listener is tied to the registration's lifetime, not the facade's: `forgetRegistration()` removes it, so a
   * register → logout → register cycle ends up with exactly one listener, not one per registration.
   */
  function startRuntimeCacheMessages(): void {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== container.controller) return;
      if (!isRuntimeCacheServedMessage(event.data)) return;
      const { url, cachedAt, reason } = event.data;
      emit("served-from-cache", { url, cachedAt, reason });
    };
    container.addEventListener("message", onMessage);
    stopRuntimeCacheMessages = track(() => container.removeEventListener("message", onMessage));
  }

  /**
   * Asks the controller once, right after registration, whether a navigation it just served from the runtime cache
   * has a signal stashed for this page (spec "页面信号": the worker cannot deliver that one by direct `postMessage`
   * because this page starts listening after the navigation, so it is fetched instead). A timeout, a malformed
   * reply, a failed post or no controller at all all mean silence — never an error, never a retry.
   */
  function queryPendingServed(worker: ServiceWorker): void {
    const channel = createMessageChannel();
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      channel.port1.onmessage = null;
      channel.port1.close();
      untrack();
    };
    const untrack = track(finish);
    const timeout = setTimeout(finish, RUNTIME_CACHE_PENDING_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      if (isRuntimeCachePendingResult(event.data) && event.data.served !== null) {
        const { url, cachedAt, reason } = event.data.served;
        emit("served-from-cache", { url, cachedAt, reason });
      }
      finish();
    };
    channel.port1.onmessageerror = () => finish();
    channel.port1.start();
    try {
      worker.postMessage({ type: "pwa:runtime-cache:pending", version: 1 }, [channel.port2]);
    } catch {
      finish();
    }
  }

  function forgetRegistration(): void {
    // The facade must not keep handing out a registration that no longer exists, nor keep listening to it: a
    // detached registration could still report an update that the next register() knows nothing about. This runs
    // when the browser reports no registration too — another tab may have logged out first.
    stopWatching?.();
    stopWatching = undefined;
    stopRuntimeCacheMessages?.();
    stopRuntimeCacheMessages = undefined;
    registration = undefined;
    announcedWaiting = undefined;
    scheduler?.stop();
  }

  const scheduler =
    updateCheckIntervalMs !== undefined && updateCheckDocument !== undefined
      ? createUpdateScheduler({
          intervalMs: updateCheckIntervalMs,
          document: updateCheckDocument,
          runCheck: sharedUpdateCheck,
          track,
        })
      : undefined;

  // Only when the plan carries install metadata. Otherwise preventDefault would suppress the browser's own install
  // prompt while nothing would ever call promptInstall() to show it again, silently disabling installation. The
  // default target is resolved here too, so a page that disabled installs never touches the global `window`.
  if (config.installEnabled) {
    const target = options.target ?? defaultTarget();

    const onBeforeInstallPrompt = (event: Event): void => {
      // The application owns when the prompt appears (ADR-0005), so the browser's own timing is suppressed here and
      // the event is kept until promptInstall() asks for it.
      event.preventDefault();
      installPrompt = event as BeforeInstallPromptEvent;
      emit("install-eligible", {});
    };
    const onAppInstalled = (): void => {
      installPrompt = undefined;
      emit("installed", {});
    };

    target.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    target.addEventListener("appinstalled", onAppInstalled);
    track(() => {
      target.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      target.removeEventListener("appinstalled", onAppInstalled);
    });
  }

  return {
    async register(): Promise<void> {
      alive();
      if (registration === undefined) {
        // A failed registration is not remembered, so the caller can retry; only a success is reused.
        const pending = container.register(config.serviceWorkerUrl, { scope: config.scope });
        registration = pending.catch((error: unknown) => {
          registration = undefined;
          throw error;
        });
        const result = await registration;
        // dispose() may have run while the registration was in flight. Emitting now would reach nobody, and
        // watching this registration would attach listeners that outlive the facade.
        if (disposed) return;
        emit("registered", { scope: result.scope });
        stopWatching = watchForUpdates(result);
        scheduler?.start();
        startRuntimeCacheMessages();
        if (container.controller !== null) queryPendingServed(container.controller);
        return;
      }
      await registration;
    },

    async promptInstall(): Promise<PwaInstallOutcome> {
      alive();
      const pending = installPrompt;
      if (pending === undefined) return "unavailable";
      // `prompt()` may be called only once per event, so the prompt is dropped before it is used — including when
      // `prompt()` rejects, since retrying the same event is not allowed either.
      installPrompt = undefined;
      await pending.prompt();
      const { outcome } = await pending.userChoice;
      return outcome;
    },

    async applyUpdate(): Promise<boolean> {
      alive();
      const current = await container.getRegistration(config.scope);
      const waiting = current?.waiting;
      if (waiting === undefined || waiting === null) return false;
      // Subscribe first: skipWaiting can hand over before postMessage even returns.
      const controlled = takeover();
      try {
        waiting.postMessage(SKIP_WAITING_MESSAGE);
      } catch (error) {
        // The wait is already in flight; leaving it would reject ten seconds later with nobody awaiting it.
        controlled.cancel();
        await controlled.settled.catch(() => undefined);
        throw error;
      }
      await controlled.settled;
      return true;
    },

    async logout(): Promise<boolean> {
      alive();
      const current = await container.getRegistration(config.scope);
      const controller = container.controller;
      if (current === undefined) {
        forgetRegistration();
        return false;
      }
      if (controller === null) return false;
      try {
        await clearOfflineWrites(controller);
      } catch {
        return false;
      }
      const unregistered = await current.unregister();
      forgetRegistration();
      return unregistered;
    },

    async checkForUpdate(): Promise<PwaUpdateCheckResult> {
      alive();
      return sharedUpdateCheck();
    },

    subscribe(listener: (event: PwaClientEvent) => void): () => void {
      alive();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Stopped explicitly, not only through `teardown`: an automatic check still in flight re-arms its timer when
      // it settles unless the scheduler knows it has stopped, and that timer would outlive the emptied teardown.
      scheduler?.stop();
      // A copy: every undo removes itself from the set as it runs.
      for (const undo of [...teardown]) undo();
      teardown.clear();
      stopWatching = undefined;
      listeners.clear();
      installPrompt = undefined;
    },
  };
}

function defaultContainer(): ServiceWorkerContainer {
  // Feature detection, never user-agent sniffing: a browser without service workers gets a clear error here rather
  // than a TypeError deep inside register().
  if (typeof navigator === "undefined" || navigator.serviceWorker === undefined) {
    throw new Error("This environment has no navigator.serviceWorker; pass options.container explicitly");
  }
  return navigator.serviceWorker;
}

function defaultTarget(): EventTarget {
  if (typeof window === "undefined") {
    throw new Error("This environment has no window for the install events; pass options.target explicitly");
  }
  return window;
}

function defaultDocument(): UpdateCheckDocument {
  if (typeof document === "undefined") {
    throw new Error("This environment has no document for the automatic update check; pass options.document explicitly");
  }
  return document;
}
