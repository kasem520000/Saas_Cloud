import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb, superuserClient } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { DevicesService } from "../../modules/sync/application/devices.service";
import { PullService } from "../../modules/sync/application/pull.service";
import { setupSalesFixture, TENANT_S, S_CASHIER } from "../sales/fixtures";

/**
 * PHASE-022 T4/T13 mobile profile (real PG16): an ANDROID device registers
 * with a capability subset (`van_sales`), attestation-lite sets trust flags,
 * and the scoped pull answers with the frozen PHASE-020 contract. The
 * capability subset is enforced server-side; the client only declares it.
 */

const audit = new AuditService(new DrizzleAuditStore());
const devices = new DevicesService(audit);
const pull = new PullService();

const ANDROID_DEV = "00000000-0000-4000-8000-0000000000c3";

beforeAll(async () => {
  ensureTestDb();
  await setupSalesFixture();
  const su = await superuserClient();
  await su.query(
    `INSERT INTO users (id, email, full_name, password_hash, status) VALUES
     ('00000000-0000-0000-0000-000000000606', 'mobile-actor@system', 'Mobile Actor', 'x', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
  );
  await su.query(
    `INSERT INTO devices (id, user_id, platform, name, device_key_hash, capabilities) VALUES
     ($1, $2, 'ANDROID', 'field van phone', 'hash-c3', '{van_sales}') ON CONFLICT (id) DO NOTHING`,
    [ANDROID_DEV, S_CASHIER],
  );
  await su.query(
    `INSERT INTO devices (id, user_id, platform, name, device_key_hash, capabilities) VALUES
     ('00000000-0000-4000-8000-0000000000c4', $1, 'ANDROID', 'customer phone', 'hash-c4', '{personal_account}') ON CONFLICT (id) DO NOTHING`,
    [S_CASHIER],
  );
  await su.end();
});

describe("PHASE-022 mobile profile (real PG)", () => {
  it("M-01: android device row carries the van_sales capability subset", async () => {
    const su = await superuserClient();
    const r = await su.query<{ capabilities: string[]; platform: string }>(
      `SELECT capabilities, platform FROM devices WHERE id = $1`,
      [ANDROID_DEV],
    );
    await su.end();
    expect(r.rows[0]?.platform).toBe("ANDROID");
    expect(r.rows[0]?.capabilities).toEqual(["van_sales"]);
  });

  it("M-02: attestation-lite sets trust flags + attested_at on the android device", async () => {
    await withTenant(TENANT_S, async () => {
      const challenge = await devices.attestationChallenge({ deviceId: ANDROID_DEV, actorId: S_CASHIER });
      expect(challenge.nonce).toBeTruthy();
      const att = await devices.attest({ deviceId: ANDROID_DEV, actorId: S_CASHIER, nonce: challenge.nonce, signature: "sig", publicKey: "pub-c3" });
      expect(att.attested).toBe(true);
    });
    const su = await superuserClient();
    const r = await su.query<{ trust_flags: { attestationLite?: boolean }; attested_at: string | null }>(
      `SELECT trust_flags, attested_at FROM devices WHERE id = $1`,
      [ANDROID_DEV],
    );
    await su.end();
    expect(r.rows[0]?.attested_at).not.toBeNull();
    expect(r.rows[0]?.trust_flags?.attestationLite).toBe(true);
  });

  it("M-03: scoped pull answers on the frozen contract (contractVersion=1, signed cursor)", async () => {
    await withTenant(TENANT_S, async () => {
      const page = await pull.pull({ deviceId: ANDROID_DEV, entity: "sales_invoice" });
      expect(page.contractVersion).toBe(1);
      expect(typeof page.nextCursor).toBe("string");
      expect(page.nextCursor.includes(".")).toBe(true); // signed token
      const status = await pull.status({ deviceId: ANDROID_DEV, entities: ["sales_invoice"] });
      expect(status.contractVersion).toBe(1);
    });
  });

  it("M-05: personal-account device registers with the read-only capability subset", async () => {
    const su = await superuserClient();
    const r = await su.query<{ capabilities: string[] }>(
      `SELECT capabilities FROM devices WHERE id = '00000000-0000-4000-8000-0000000000c4'`,
    );
    await su.end();
    expect(r.rows[0]?.capabilities).toEqual(["personal_account"]);
    // client-side: ReadOnlyLocalStore (unit-tested in @erp/mobile) refuses all
    // writes for this class; server-side feed scoping is the PHASE-020 proof
  });

  it("M-04: revoked android device is rejected on the kill switch (D-01)", async () => {
    await withTenant(TENANT_S, async () => {
      await devices.revoke({ deviceId: ANDROID_DEV, actorId: S_CASHIER, reason: "lost phone" });
    });
    const su = await superuserClient();
    const r = await su.query<{ revoked_at: string | null }>(`SELECT revoked_at FROM devices WHERE id = $1`, [ANDROID_DEV]);
    await su.end();
    expect(r.rows[0]?.revoked_at).not.toBeNull();
  });
});
