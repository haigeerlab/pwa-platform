// The opt-in periodic update check. Kept out of facade.ts so the chained-timer/visibility bookkeeping does not
// crowd the registration and takeover logic there; the facade still owns `track`, so dispose() reaches everything
// this module schedules without this module knowing about dispose() at all.

/** The lower bound keeps automatic checks from turning `serviceWorkerUrl` into a high-frequency poll target. */
const MIN_INTERVAL_MS = 60_000;
/** The largest delay `setTimeout` accepts before it wraps. */
const MAX_INTERVAL_MS = 2_147_483_647;

/** Validates `options.updateCheck.intervalMs`. Throws for anything but an integer in range; never echoes the value. */
export function validateUpdateCheckIntervalMs(intervalMs: unknown): number {
  if (typeof intervalMs !== "number" || !Number.isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new Error(`options.updateCheck.intervalMs must be an integer between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS}`);
  }
  return intervalMs;
}

export type UpdateCheckDocument = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export type UpdateScheduler = {
  /** Arms the schedule. A second call while already running is a no-op. */
  start(): void;
  /** Clears the timer, removes the visibility listener and forgets any owed check. Idempotent. */
  stop(): void;
};

export type UpdateSchedulerOptions = {
  readonly intervalMs: number;
  readonly document: UpdateCheckDocument;
  /** Runs one check, coalesced with any manual `checkForUpdate()` in flight. Its result is not inspected here. */
  readonly runCheck: () => Promise<unknown>;
  /** The facade's own `track`: registers an undo and returns a handle that runs it once, so dispose() reaches this. */
  readonly track: (undo: () => void) => () => void;
};

/**
 * Builds a chained-timer scheduler: the next tick is armed only once the previous automatic check has settled, so
 * checks never overlap. A tick that lands while the page is hidden is skipped and remembered as "owed"; becoming
 * visible again runs a check immediately when one is owed, or when a full interval has already passed since the
 * last check started — the latter covers the gap between that check's start and the moment its own next tick would
 * fire, which is otherwise a window where nothing is "owed" yet the interval has already elapsed.
 */
export function createUpdateScheduler(options: UpdateSchedulerOptions): UpdateScheduler {
  const { intervalMs, document, runCheck, track } = options;

  let started = false;
  let checking = false;
  let owed = false;
  let lastCheckStart = 0;
  /**
   * Bumped by every start() and stop(). A check that began under an earlier generation belongs to a schedule that
   * has since been stopped (and possibly restarted), so when it settles it must leave the current one alone.
   */
  let generation = 0;
  let untrackTimer: (() => void) | undefined;
  let untrackVisibility: (() => void) | undefined;

  function clearTimer(): void {
    untrackTimer?.();
    untrackTimer = undefined;
  }

  function armTimer(): void {
    clearTimer();
    const timer = setTimeout(onTick, intervalMs);
    untrackTimer = track(() => clearTimeout(timer));
  }

  function onTick(): void {
    // The timer that called this has already fired; drop its now-stale teardown entry either way.
    clearTimer();
    if (document.visibilityState !== "visible") {
      owed = true;
      return;
    }
    void runAutomaticCheck();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState !== "visible" || checking) return;
    if (!owed && Date.now() - lastCheckStart < intervalMs) return;
    clearTimer();
    void runAutomaticCheck();
  }

  async function runAutomaticCheck(): Promise<void> {
    if (checking) return;
    checking = true;
    lastCheckStart = Date.now();
    const startedIn = generation;
    try {
      await runCheck();
    } catch {
      // An automatic check's failure (including a rejected `update()`) is swallowed: no throw, no event, and
      // nothing left unhandled. The next cycle proceeds regardless of why this one failed.
    }
    // stop() — and perhaps a new start() — may have run while this check was in flight. Re-arming then would
    // replace the new schedule's timer with one counted from this late settle, and clearing the flags would let
    // the new schedule start a second check while its own is still running.
    if (startedIn !== generation) return;
    checking = false;
    owed = false;
    armTimer();
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      generation += 1;
      owed = false;
      lastCheckStart = Date.now();
      document.addEventListener("visibilitychange", onVisibilityChange);
      untrackVisibility = track(() => document.removeEventListener("visibilitychange", onVisibilityChange));
      armTimer();
    },
    stop(): void {
      if (!started) return;
      started = false;
      generation += 1;
      checking = false;
      owed = false;
      clearTimer();
      untrackVisibility?.();
      untrackVisibility = undefined;
    },
  };
}
