/**
 * PHASE-021 T4 — the desktop sync host: a thin trigger scheduler over the
 * PHASE-020 cycle engine (SYNC_PROTOCOL §8 triggers): app start/unlock, OS
 * connectivity signal debounced 5 s, periodic 2 min when dirty, push-only
 * fast cycle after local writes, and manual "sync now". Deterministic when
 * `now`/`setTimeout` are injected (tests drive it with fake time).
 */

import { runCycle, type CycleResult, type Transport } from "./cycle";
import type { LocalStore } from "./local-store";

export interface HostDeps {
  store: LocalStore;
  transport: Transport;
  deviceId: string;
  entities: readonly string[];
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export const CONNECTIVITY_DEBOUNCE_MS = 5_000;
export const PERIODIC_MS = 120_000;

export class SyncHost {
  private periodicHandle: unknown = undefined;
  private debounceHandle: unknown = undefined;
  private running = false;
  private readonly now: () => number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;

  constructor(private readonly deps: HostDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as Parameters<typeof clearTimeout>[0]));
  }

  /** App start / unlock: recover, run one cycle, arm the periodic timer. */
  start(): void {
    void this.cycle("start");
    this.armPeriodic();
  }

  /** OS connectivity came back: debounce 5 s then cycle. */
  onConnectivityRestored(): void {
    if (this.debounceHandle !== undefined) this.clearTimeoutFn(this.debounceHandle);
    this.debounceHandle = this.setTimeoutFn(() => void this.cycle("connectivity"), CONNECTIVITY_DEBOUNCE_MS);
  }

  /** A local write happened: push-only fast cycle (no pull). */
  onLocalWrite(): void {
    void this.cycle("post-write");
  }

  /** Manual "sync now". */
  syncNow(): Promise<CycleResult> {
    return this.cycle("manual");
  }

  stop(): void {
    if (this.periodicHandle !== undefined) this.clearTimeoutFn(this.periodicHandle);
    if (this.debounceHandle !== undefined) this.clearTimeoutFn(this.debounceHandle);
  }

  private armPeriodic(): void {
    this.periodicHandle = this.setTimeoutFn(() => {
      void this.cycle("periodic").then(() => this.armPeriodic());
    }, PERIODIC_MS);
  }

  private async cycle(trigger: string): Promise<CycleResult> {
    if (this.running) return { pulled: 0, pushed: 0, acked: 0, deferred: 0, rejected: 0, readOnly: false, resynced: [] };
    this.running = true;
    try {
      const result = await runCycle({
        store: this.deps.store,
        transport: this.deps.transport,
        deviceId: this.deps.deviceId,
        entities: this.deps.entities,
        now: this.now,
      });
      (result as CycleResult & { trigger?: string }).trigger = trigger;
      return result;
    } finally {
      this.running = false;
    }
  }
}
