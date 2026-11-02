/**
 * PHASE-025 T1 — deterministic GA load-model seed generator.
 *
 * Tenant mix per PERFORMANCE_TEST_PLAN §3: 1 large (~100k docs, 50 users)
 * + 50 mid (~10k docs, 5-10 users) + 500 small (~1k docs, 1-2 users).
 * Document mix: 60% sales / 25% purchases / 15% treasury.
 * Deterministic: same seed => identical dataset (verified by unit test).
 */

export interface SeededTenant {
  tenantId: string;
  tier: "large" | "mid" | "small";
  docCount: number;
  concurrentUsers: number;
}

export interface LoadModel {
  seed: number;
  tenants: SeededTenant[];
  docMix: { sales: number; purchases: number; treasury: number };
  totals: { tenants: number; docs: number; users: number };
}

/** mulberry32 — tiny deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_DOCS = { large: 100_000, mid: 10_000, small: 1_000 } as const;
const TIER_USERS = { large: 50, mid: 8, small: 2 } as const;

export function buildLoadModel(seed = 20261102): LoadModel {
  const rand = mulberry32(seed);
  const tenants: SeededTenant[] = [];
  const tiers: Array<["large" | "mid" | "small", number]> = [
    ["large", 1],
    ["mid", 50],
    ["small", 500],
  ];
  let i = 0;
  for (const [tier, count] of tiers) {
    for (let n = 0; n < count; n++) {
      // small deterministic jitter (±5%) so tiers are not perfectly uniform
      const jitter = 0.95 + rand() * 0.1;
      tenants.push({
        tenantId: `t-${tier}-${String(i++).padStart(4, "0")}`,
        tier,
        docCount: Math.round(TIER_DOCS[tier] * jitter),
        concurrentUsers: TIER_USERS[tier],
      });
    }
  }
  const docs = tenants.reduce((s, t) => s + t.docCount, 0);
  const users = tenants.reduce((s, t) => s + t.concurrentUsers, 0);
  return {
    seed,
    tenants,
    docMix: { sales: 0.6, purchases: 0.25, treasury: 0.15 },
    totals: { tenants: tenants.length, docs, users },
  };
}

/** Assign each document of a tenant a type per the 60/25/15 mix (deterministic). */
export function docTypeFor(rand: () => number): "sales" | "purchases" | "treasury" {
  const r = rand();
  if (r < 0.6) return "sales";
  if (r < 0.85) return "purchases";
  return "treasury";
}
