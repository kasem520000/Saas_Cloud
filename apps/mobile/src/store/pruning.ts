/**
 * PHASE-022 T5 — LRU pruning within the 128 MB local-cache budget
 * (LOCAL_DATABASE §5): evicts least-recently-used cache rows (never outbox,
 * never inbox pending, never cursors/meta) until under budget. Pure logic
 * over a key-value-ish store; unit-tested.
 */

export interface CacheEntry {
  key: string;
  bytes: number;
  lastUsedAt: number;
}

export const CACHE_BUDGET_BYTES = 128 * 1024 * 1024;

/** Returns the keys to evict (LRU first) so total ≤ budget. */
export function planEviction(entries: readonly CacheEntry[], budget: number = CACHE_BUDGET_BYTES): string[] {
  const total = entries.reduce((s, e) => s + e.bytes, 0);
  if (total <= budget) return [];
  const sorted = [...entries].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const evict: string[] = [];
  let remaining = total;
  for (const e of sorted) {
    if (remaining <= budget) break;
    evict.push(e.key);
    remaining -= e.bytes;
  }
  return evict;
}
