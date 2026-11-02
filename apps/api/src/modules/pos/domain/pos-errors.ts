/**
 * PHASE-016 — POS domain errors. Fail-closed: every rejection is typed so the
 * reconciliation UX (CONFLICT_RESOLUTION §3) can map it to a user action.
 */
export class PosError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class TerminalNotFoundError extends PosError {
  constructor(code: string) {
    super("POS_TERMINAL_NOT_FOUND", `POS terminal ${code} does not exist in this tenant`);
  }
}

export class TerminalCodeInvalidError extends PosError {
  constructor(code: string) {
    super("POS_TERMINAL_CODE_INVALID", `terminal code '${code}' must match ^[A-Z0-9-]{{2,20}}$`);
  }
}

export class TerminalCodeConflictError extends PosError {
  constructor(code: string) {
    super("POS_TERMINAL_CODE_CONFLICT", `terminal code ${code} already exists in this tenant`);
  }
}

export class TerminalInactiveError extends PosError {
  constructor(code: string) {
    super("POS_TERMINAL_INACTIVE", `POS terminal ${code} is INACTIVE and cannot sell`);
  }
}

export class DeviceRevokedError extends PosError {
  constructor() {
    super("DEVICE_REVOKED", "device is revoked — pushes are rejected before any command executes");
  }
}

export class SyncCommandRejectedError extends PosError {
  constructor(code: string, message: string) {
    super(`SYNC_REJECTED_${code}`, message);
  }
}

export class PosSaleValidationError extends PosError {
  constructor(message: string) {
    super("POS_SALE_INVALID", message);
  }
}
