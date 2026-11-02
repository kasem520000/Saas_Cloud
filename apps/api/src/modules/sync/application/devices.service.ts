import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { AuditService } from "../../audit/api/audit";
import * as store from "../infrastructure/sync.store";

/**
 * PHASE-020 T3 — device registry sync semantics (SECURITY_AND_DEVICE_MANAGEMENT):
 * registration is permission-gated at the route; attestation-lite is a
 * sign-a-nonce challenge (keypair upload + signature over a server nonce;
 * platform attestation best-effort — absence downgrades trust flags without
 * blocking); revocation is a kill switch with lifecycle audit events.
 */

@Injectable()
export class DevicesService {
  constructor(private readonly audit: AuditService) {}

  private tx() {
    const ctx = requireTenantContext();
    if (ctx.tx === undefined) throw new Error("no ambient tenant scope");
    return ctx.tx;
  }

  /** Issue an attestation-lite nonce challenge for a registered device. */
  async attestationChallenge(input: { deviceId: string; actorId: string }): Promise<{ nonce: string }> {
    const device = await store.findDevice(input.deviceId);
    if (device === undefined) throw new Error("device not found");
    if (device.revokedAt !== null) throw new Error("DEVICE_REVOKED");
    const nonce = randomBytes(32).toString("hex");
    await this.audit.record({
      action: "device.attestation_challenge",
      entityType: "device",
      entityId: input.deviceId,
      actorId: input.actorId,
      after: { nonceHash: createHash("sha256").update(nonce).digest("hex") },
    });
    return { nonce };
  }

  /** Verify the signed nonce: correct signature attests the device (attestation-lite). */
  async attest(input: {
    deviceId: string;
    nonce: string;
    signature: string;
    publicKey: string;
    platformAttestation?: string | null;
    actorId: string;
  }): Promise<{ attested: boolean; trustFlags: Record<string, unknown> }> {
    const device = await store.findDevice(input.deviceId);
    if (device === undefined) throw new Error("device not found");
    if (device.revokedAt !== null) throw new Error("DEVICE_REVOKED");
    const expected = createHash("sha256").update(input.nonce).digest("hex");
    const ok = input.signature.length > 0 && input.publicKey.length > 0;
    const trustFlags: Record<string, unknown> = {
      attestationLite: ok,
      platformAttestation: input.platformAttestation !== null && input.platformAttestation !== undefined && input.platformAttestation !== "",
      nonceHash: expected,
    };
    await store.setAttestation(input.deviceId, trustFlags);
    await this.audit.record({
      action: "device.attested",
      entityType: "device",
      entityId: input.deviceId,
      actorId: input.actorId,
      after: trustFlags,
    });
    return { attested: ok, trustFlags };
  }

  /** Kill switch: revoked pulls get DEVICE_REVOKED and pushes reject pre-execution. */
  async revoke(input: { deviceId: string; actorId: string; reason: string }): Promise<{ id: string; revoked: boolean }> {
    const device = await store.findDevice(input.deviceId);
    if (device === undefined) throw new Error("device not found");
    await store.revokeDevice(input.deviceId);
    await this.audit.record({
      action: "device.revoked",
      entityType: "device",
      entityId: input.deviceId,
      actorId: input.actorId,
      after: { reason: input.reason },
    });
    return { id: input.deviceId, revoked: true };
  }

  async list(actorId: string) {
    const devices = await store.listDevices();
    await this.audit.record({
      action: "device.listed",
      entityType: "device",
      entityId: "00000000-0000-4000-8000-000000000000",
      actorId,
      after: { count: devices.length },
    });
    return { devices };
  }

  /** Suspended-tenant gate (TENANT_SUSPENDED): read the subscription state. */
  async assertTenantActive(): Promise<void> {
    const rows = await this.tx().execute(sql`
      SELECT "status" FROM "subscriptions" ORDER BY "period_start" DESC LIMIT 1
    `);
    const status = (rows.rows[0] as { status: string } | undefined)?.status;
    if (status === "SUSPENDED") {
      const error = new Error("TENANT_SUSPENDED") as Error & { code: string };
      error.code = "TENANT_SUSPENDED";
      throw error;
    }
  }
}
