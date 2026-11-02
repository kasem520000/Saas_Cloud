/**
 * PHASE-023 T8 — CommerceChannelPort + ShippingPort (reserved) with a fake
 * channel for contract testing (integrations/README §1.6: recorded mock
 * interactions). Order import is upsert by channel order id with
 * Idempotency-Key per batch; conflicts are SERVER-decision (no LWW,
 * ADR-0012). Adapters never write business tables directly — they go
 * through the owning module's services (ADR-0010 §4).
 */

export interface ChannelOrder {
  channelOrderId: string;
  placedAt: string;
  lines: { sku: string; qty: string; unitPrice: string }[]; // decimal text (ADR-0009)
  total: string;
}

export interface CommerceChannelPort {
  readonly id: string;
  pullOrders(sinceIso: string): Promise<ChannelOrder[]>;
  pushPrice(sku: string, price: string): Promise<void>;
  pushStock(sku: string, qty: string): Promise<void>;
}

export interface ShippingPort {
  readonly id: string;
  createLabel(input: { orderId: string; address: Record<string, string> }): Promise<{ trackingNo: string }>;
}

/** Fake channel: in-memory, scripted — the contract-test double. */
export class FakeCommerceChannel implements CommerceChannelPort {
  readonly id = "fake-commerce";
  orders: ChannelOrder[] = [];
  prices = new Map<string, string>();
  stock = new Map<string, string>();
  idempotencyKeys = new Set<string>();

  async pullOrders(sinceIso: string): Promise<ChannelOrder[]> {
    return this.orders.filter((o) => o.placedAt >= sinceIso);
  }
  async pushPrice(sku: string, price: string): Promise<void> {
    this.prices.set(sku, price);
  }
  async pushStock(sku: string, qty: string): Promise<void> {
    this.stock.set(sku, qty);
  }
  /** Records the batch idempotency key; a duplicate key is a no-op replay. */
  recordBatch(idempotencyKey: string): boolean {
    if (this.idempotencyKeys.has(idempotencyKey)) return false;
    this.idempotencyKeys.add(idempotencyKey);
    return true;
  }
}

export class FakeShippingProvider implements ShippingPort {
  readonly id = "fake-shipping";
  labels = new Map<string, string>();
  async createLabel(input: { orderId: string }): Promise<{ trackingNo: string }> {
    const no = `FAKE-TRK-${this.labels.size + 1}`;
    this.labels.set(input.orderId, no);
    return { trackingNo: no };
  }
}
