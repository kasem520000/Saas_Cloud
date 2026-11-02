import { Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/application/audit.service";
import { TerminalCodeConflictError, TerminalCodeInvalidError, TerminalNotFoundError } from "../domain/pos-errors";
import * as store from "../infrastructure/pos.store";

/**
 * PHASE-016 T2 — POS terminal registry: register per branch with a till cash
 * account + receipt size, bind one device, activate/deactivate lifecycle.
 * One terminal = one device (SYNC_PROTOCOL §11); revocation of the device
 * is enforced at push time by the sync slice (DEVICE_REVOKED).
 */
@Injectable()
export class TerminalService {
  constructor(private readonly audit: AuditService) {}

  async list() {
    return store.listTerminals();
  }

  async register(input: {
    branchId: string;
    deviceId: string | null;
    code: string;
    name: string;
    cashAccountId: string;
    receiptSizeMm: number;
    actorId: string | null;
  }) {
    const code = input.code.toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
      throw new TerminalCodeInvalidError(input.code);
    }
    if (input.receiptSizeMm !== 80 && input.receiptSizeMm !== 58) {
      throw new TerminalCodeInvalidError(input.code);
    }
    const existing = await store.findTerminalByCode(code);
    if (existing !== undefined) {
      throw new TerminalCodeConflictError(code);
    }
    const row = await store.insertTerminal({
      branchId: input.branchId,
      deviceId: input.deviceId,
      code,
      name: input.name,
      cashAccountId: input.cashAccountId,
      receiptSizeMm: input.receiptSizeMm,
    });
    await this.audit.record({
      action: "pos_terminal.registered",
      entityType: "pos_terminal",
      entityId: row.id,
      actorId: input.actorId,
      after: { code: row.code, branchId: row.branchId },
    });
    return row;
  }

  async setStatus(id: string, status: "ACTIVE" | "INACTIVE", actorId: string | null) {
    const row = await store.setTerminalStatus(id, status);
    if (row === undefined) {
      throw new TerminalNotFoundError(id);
    }
    await this.audit.record({
      action: status === "ACTIVE" ? "pos_terminal.activated" : "pos_terminal.deactivated",
      entityType: "pos_terminal",
      entityId: row.id,
      actorId,
      after: { code: row.code, status: row.status },
    });
    return row;
  }

  async bindDevice(terminalId: string, deviceId: string, actorId: string | null) {
    const row = await store.findTerminalById(terminalId);
    if (row === undefined) {
      throw new TerminalNotFoundError(terminalId);
    }
    await store.bindDevice(terminalId, deviceId);
    await this.audit.record({
      action: "pos_terminal.device_bound",
      entityType: "pos_terminal",
      entityId: row.id,
      actorId,
      after: { code: row.code, deviceId },
    });
    return { ...row, deviceId };
  }
}
