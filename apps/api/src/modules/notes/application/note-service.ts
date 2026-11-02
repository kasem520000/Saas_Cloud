/**
 * PHASE-027 — note lifecycle service over ports (store + posting), so the
 * whole custody flow is unit-testable. ADR-0007: JournalSpec-only posting;
 * cash_movements stay treasury-owned (notes never writes them).
 */
import {
  buildG24Receive,
  buildG25Collect,
  buildG26Dishonor,
  buildG27Issue,
  buildG27Paid,
  buildDiscount,
} from "./journal-builders";
import {
  assertDishonorReason,
  transition,
  JOURNAL_BEARING_EVENTS,
  type NoteEventKind,
  type NoteStatus,
} from "../domain/custody-machine";
import type { JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

export interface NoteRow {
  id: string;
  tenantId: string;
  kind: "CHEQUE" | "PROMISSORY_NOTE";
  direction: "RECEIVED" | "ISSUED";
  number: string;
  partnerId: string;
  maturityDate: string;
  amount: string;
  currency: string;
  status: NoteStatus;
  sourceType: string | null;
  sourceId: string | null;
}
export interface NoteEventRow {
  noteId: string;
  eventKind: NoteEventKind;
  eventDate: string;
  reason: string | null;
  journalEntryId: string | null;
}

export interface NotesStore {
  findNote(tenantId: string, id: string): Promise<NoteRow | undefined>;
  findPartner(tenantId: string, partnerId: string): Promise<unknown | undefined>;
  findSourceDoc(tenantId: string, sourceType: string, sourceId: string): Promise<unknown | undefined>;
  saveNote(note: NoteRow): Promise<void>;
  appendEvent(event: NoteEventRow): Promise<void>;
  events(noteId: string): Promise<NoteEventRow[]>;
}

export type PostPort = (spec: JournalSpec) => Promise<{ entryId: string }>;

export class NoteNotFoundError extends Error {
  constructor(id: string) {
    super(`note not found in this tenant: ${id}`);
    this.name = "NoteNotFoundError"; // typed 404 (S-04/A7)
  }
}

export class NotesService {
  constructor(
    private readonly store: NotesStore,
    private readonly post: PostPort,
  ) {}

  private async noteOr404(tenantId: string, id: string): Promise<NoteRow> {
    const n = await this.store.findNote(tenantId, id);
    if (!n) throw new NoteNotFoundError(id);
    return n;
  }

  /** Record a received note against an invoice (G-24) — BR-045: maturity required. */
  async receive(tenantId: string, input: Omit<NoteRow, "id" | "tenantId" | "status" | "direction"> & { direction?: "RECEIVED"; entryDate: string; reference?: string }) {
    if (!input.maturityDate) throw new Error("maturity_date required (BR-045)");
    if (!input.partnerId || (await this.store.findPartner(tenantId, input.partnerId)) === undefined) {
      throw new NoteNotFoundError(`partner:${input.partnerId}`);
    }
    if (input.sourceType && input.sourceId && (await this.store.findSourceDoc(tenantId, input.sourceType, input.sourceId)) === undefined) {
      throw new NoteNotFoundError(`source:${input.sourceId}`);
    }
    const note: NoteRow = { ...input, direction: "RECEIVED", id: `note-${input.number}`, tenantId, status: "IN_CUSTODY" };
    await this.store.saveNote(note);
    const { entryId } = await this.post(
      buildG24Receive({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, partnerId: note.partnerId, reference: input.reference }),
    );
    await this.store.appendEvent({ noteId: note.id, eventKind: "RECLASSIFY", eventDate: input.entryDate, reason: "initial custody", journalEntryId: entryId });
    return { note, entryId };
  }

  /** Issue a note to a supplier (G-27 leg 1). */
  async issue(tenantId: string, input: Omit<NoteRow, "id" | "tenantId" | "status" | "direction"> & { entryDate: string; reference?: string }) {
    if (!input.maturityDate) throw new Error("maturity_date required (BR-045)");
    const note: NoteRow = { ...input, direction: "ISSUED", id: `note-${input.number}`, tenantId, status: "IN_CUSTODY" };
    await this.store.saveNote(note);
    const { entryId } = await this.post(
      buildG27Issue({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, partnerId: note.partnerId, reference: input.reference }),
    );
    await this.store.appendEvent({ noteId: note.id, eventKind: "RECLASSIFY", eventDate: input.entryDate, reason: "initial custody", journalEntryId: entryId });
    return { note, entryId };
  }

  /** Generic custody event: transition check, journal iff journal-bearing (INV-024), event appended. */
  async applyEvent(tenantId: string, noteId: string, event: NoteEventKind, input: { entryDate: string; reason?: string | null; fee?: string; cashPurpose?: "CASH" | "BANK"; proceeds?: string }) {
    const note = await this.noteOr404(tenantId, noteId);
    if (event === "DISHONOR") assertDishonorReason(input.reason ?? null);
    const target = transition(note.status, event);
    let entryId: string | null = null;
    if (JOURNAL_BEARING_EVENTS.has(event)) {
      let spec: JournalSpec;
      if (event === "COLLECT") {
        spec = note.direction === "RECEIVED"
          ? buildG25Collect({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, cashPurpose: input.cashPurpose ?? "CASH" })
          : buildG27Paid({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, cashPurpose: input.cashPurpose ?? "BANK" });
      } else if (event === "DISHONOR") {
        spec = buildG26Dishonor({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, partnerId: note.partnerId, fee: input.fee, reference: input.reason ?? undefined });
      } else if (event === "DISCOUNT") {
        spec = buildDiscount({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, proceeds: input.proceeds ?? note.amount, fee: input.fee ?? "0.0000" });
      } else {
        // RETURN: restore AR/AP exactly (G-26 restore side, no fee)
        spec = buildG26Dishonor({ noteId: note.id, entryDate: input.entryDate, currency: note.currency, amount: note.amount, partnerId: note.partnerId });
      }
      entryId = (await this.post(spec)).entryId;
    }
    note.status = target;
    await this.store.saveNote(note);
    await this.store.appendEvent({ noteId: note.id, eventKind: event, eventDate: input.entryDate, reason: input.reason ?? null, journalEntryId: entryId });
    return { note, entryId, journalPosted: entryId !== null };
  }
}
