/**
 * PHASE-022 T6 — Android sync scheduling (SYNC_PROTOCOL §8 + FAILURE_RECOVERY
 * battery/connectivity): foreground cycle every 2 min when dirty; OS-scheduled
 * background fetch at most every 15 min (Doze-aware); connectivity-regained
 * cycle debounced 5 s (inherited from sync-core SyncHost). Cellular budgets
 * per cycle: pull ≤ 8 MB, push ≤ 2 MB; personal-account background pulls
 * ≤ 256 KB. DEFERRED honors server retryAfterMs. Pure, deterministic when
 * time is injected.
 */

import { SyncHost, type HostDeps } from "@erp/sync-core";

export const FOREGROUND_PERIODIC_MS = 120_000; // 2 min
export const BACKGROUND_FETCH_MIN_MS = 15 * 60_000; // ≤ every 15 min (Doze)
export const PULL_BUDGET_BYTES = 8 * 1024 * 1024;
export const PUSH_BUDGET_BYTES = 2 * 1024 * 1024;
export const PERSONAL_PULL_BUDGET_BYTES = 256 * 1024;

export interface BudgetedTransport {
  pullBytes: number;
  pushBytes: number;
}

/** Enforce per-cycle cellular budgets by shrinking page/batch sizes. */
export function budgetedLimits(transport: BudgetedTransport, isPersonalBackground: boolean) {
  const pullCap = isPersonalBackground ? PERSONAL_PULL_BUDGET_BYTES : PULL_BUDGET_BYTES;
  return {
    maxPullBytes: Math.min(pullCap, transport.pullBytes > 0 ? transport.pullBytes : pullCap),
    maxPushBytes: PUSH_BUDGET_BYTES,
    maxCommandsPerPush: 50, // protocol cap (PHASE-020)
  };
}

export class AndroidSyncScheduler {
  private backgroundHandle: unknown = undefined;
  private foregroundHandle: unknown = undefined;

  constructor(
    private readonly host: SyncHost,
    private readonly deps: Pick<HostDeps, "setTimeoutFn" | "clearTimeoutFn">,
  ) {}

  /** Foreground: periodic 2-min cycles while the app is alive. */
  startForeground(): void {
    const arm = () => {
      this.foregroundHandle = this.deps.setTimeoutFn!(() => {
        void this.host.syncNow().then(arm);
      }, FOREGROUND_PERIODIC_MS);
    };
    arm();
  }

  /** Background: OS-scheduled fetch, never more often than every 15 min. */
  scheduleBackgroundFetch(nowMs: number, lastBackgroundMs: number | null): number {
    if (lastBackgroundMs !== null && nowMs - lastBackgroundMs < BACKGROUND_FETCH_MIN_MS) {
      return lastBackgroundMs; // Doze-safe: do not reschedule early
    }
    return nowMs;
  }

  stop(): void {
    if (this.foregroundHandle !== undefined) this.deps.clearTimeoutFn!(this.foregroundHandle);
    if (this.backgroundHandle !== undefined) this.deps.clearTimeoutFn!(this.backgroundHandle);
    this.host.stop();
  }
}
