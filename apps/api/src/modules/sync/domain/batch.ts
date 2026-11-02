/**
 * PHASE-020 T6 — push batch validation (SYNC_PROTOCOL §3): a batch is ≤ 50
 * commands AND ≤ 1 MB serialized; validation happens BEFORE any command
 * executes (never all-or-nothing at the ledger, but the batch envelope itself
 * is rejected wholesale when it violates the wire budget).
 */

export const MAX_BATCH_COMMANDS = 50;
export const MAX_BATCH_BYTES = 1024 * 1024;

export class BatchError extends Error {
  constructor(readonly code: "BATCH_TOO_LARGE" | "EMPTY_BATCH", message: string) {
    super(message);
    this.name = "BatchError";
  }
}

export interface SyncCommand {
  commandId: string; // client UUIDv7 (ADR-0006)
  entityType: string;
  intent: string;
  idempotencyKey: string;
  baseVersion?: number;
  clientCreatedAt?: string;
  localRef?: string;
  payload: unknown;
}

export function validateBatch(commands: readonly SyncCommand[], serializedBytes: number): void {
  if (commands.length === 0) throw new BatchError("EMPTY_BATCH", "push batch must carry at least one command");
  if (commands.length > MAX_BATCH_COMMANDS) {
    throw new BatchError("BATCH_TOO_LARGE", `batch has ${commands.length} commands; protocol budget is ${MAX_BATCH_COMMANDS}`);
  }
  if (serializedBytes > MAX_BATCH_BYTES) {
    throw new BatchError("BATCH_TOO_LARGE", `batch is ${serializedBytes} bytes; protocol budget is ${MAX_BATCH_BYTES}`);
  }
  for (const c of commands) {
    if (typeof c.commandId !== "string" || c.commandId.length === 0) {
      throw new BatchError("VALIDATION_ERROR" as never, "every command needs a commandId");
    }
    if (typeof c.idempotencyKey !== "string" || c.idempotencyKey.length === 0) {
      throw new BatchError("VALIDATION_ERROR" as never, "every command needs an idempotencyKey");
    }
  }
}
