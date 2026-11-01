/**
 * Public surface of the items module (DEPENDENCY_RULES §1 `api/`): the
 * pricing resolution service (BR-003) + the item existence read used by
 * the partners module's opening-balance stock drafts.
 */

import * as store from "../infrastructure/items.store";

export { PriceListService, type PriceResolution, type PriceResolutionRequest } from "../application/price-list-service";
export { UomService } from "../application/uom-service";
export {
  ItemSkuTakenError,
  BarcodeTakenError,
  ImportCommitConflictError,
  ImportFileInvalidError,
} from "../domain/items-errors";

/** Item existence + kind read for opening-balance stock drafts (partners). */
export async function getItemForOpeningBalance(
  itemId: string,
): Promise<{ id: string; sku: string; kind: string } | undefined> {
  const item = await store.findItemById(itemId);
  if (item === undefined || item.deletedAt !== null) {
    return undefined;
  }
  return { id: item.id, sku: item.sku, kind: item.kind };
}
