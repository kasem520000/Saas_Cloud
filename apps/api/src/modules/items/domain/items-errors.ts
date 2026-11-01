import { DomainError } from "@erp/domain-core";

/**
 * Items error registry (ERROR_MODEL §4: module-scoped codes are contracts).
 * HTTP mapping in the exception filter: 404 not-found, 409 natural-key
 * conflicts, 422 rule violations (tracking flags, import files).
 */

export class ItemNotFoundError extends DomainError {
  constructor(id: string) {
    super("ITEM_NOT_FOUND", `item ${id} does not exist in this tenant`);
  }
}

export class ItemSkuTakenError extends DomainError {
  constructor(sku: string) {
    super("ITEM_SKU_TAKEN", `item sku ${sku} is already used in this tenant`);
  }
}

export class ItemArchivedError extends DomainError {
  constructor(id: string) {
    super("ITEM_ARCHIVED", `item ${id} is archived`);
  }
}

export class CategoryNotFoundError extends DomainError {
  constructor(id: string) {
    super("CATEGORY_NOT_FOUND", `item category ${id} does not exist in this tenant`);
  }
}

export class CategoryCodeTakenError extends DomainError {
  constructor(code: string) {
    super("CATEGORY_CODE_TAKEN", `item category code ${code} is already used in this tenant`);
  }
}

export class CategoryCycleError extends DomainError {
  constructor() {
    super(
      "CATEGORY_CYCLE",
      "moving this category under its own descendant would create a cycle",
    );
  }
}

export class CategoryParentArchivedError extends DomainError {
  constructor(id: string) {
    super("CATEGORY_PARENT_ARCHIVED", `parent category ${id} is archived`);
  }
}

export class TrackingFlagsInvalidError extends DomainError {
  constructor(message: string) {
    super("TRACKING_FLAGS_INVALID", message);
  }
}

export class BarcodeTakenError extends DomainError {
  constructor(code: string) {
    super(
      "BARCODE_TAKEN",
      `barcode ${code} is already used in this tenant (scan-unique across all items)`,
    );
  }
}

export class BarcodeNotFoundError extends DomainError {
  constructor(id: string) {
    super("BARCODE_NOT_FOUND", `barcode ${id} does not exist in this tenant`);
  }
}

// -- uoms + conversions (T2 compose-exactly) -------------------------------

export class UomNotFoundError extends DomainError {
  constructor(id: string) {
    super("UOM_NOT_FOUND", `unit of measure ${id} does not exist in this tenant`);
  }
}

export class UomCodeTakenError extends DomainError {
  constructor(code: string) {
    super("UOM_CODE_TAKEN", `unit code ${code} is already used in this tenant`);
  }
}

export class SystemUomImmutableError extends DomainError {
  constructor(code: string) {
    super(
      "SYSTEM_UOM_IMMUTABLE",
      `unit ${code} is a system seed row — extend with a custom code instead`,
    );
  }
}

export class ConversionNotFoundError extends DomainError {
  constructor(from: string, to: string) {
    super("UOM_CONVERSION_NOT_FOUND", `no conversion path from ${from} to ${to}`);
  }
}

export class ConversionDuplicateError extends DomainError {
  constructor(from: string, to: string) {
    super("UOM_CONVERSION_EXISTS", `a conversion from ${from} to ${to} already exists`);
  }
}

// -- price lists (BR-003) ----------------------------------------------------

export class PriceListNotFoundError extends DomainError {
  constructor(id: string) {
    super("PRICE_LIST_NOT_FOUND", `price list ${id} does not exist in this tenant`);
  }
}

export class PriceListInvalidError extends DomainError {
  constructor(message: string) {
    super("PRICE_LIST_INVALID", message);
  }
}

export class PriceListRowNotFoundError extends DomainError {
  constructor(id: string) {
    super("PRICE_LIST_ROW_NOT_FOUND", `price list row ${id} does not exist in this tenant`);
  }
}

// -- import/export (PHASE-006 §2.6; U-07 zip-bomb guard) ---------------------

export class ImportJobNotFoundError extends DomainError {
  constructor(id: string) {
    super("IMPORT_JOB_NOT_FOUND", `import job ${id} does not exist in this tenant`);
  }
}

export class ImportNotPreviewedError extends DomainError {
  constructor(id: string) {
    super("IMPORT_NOT_PREVIEWED", `import job ${id} has no committed preview to apply`);
  }
}

export class ImportFileInvalidError extends DomainError {
  constructor(message: string) {
    super("IMPORT_FILE_INVALID", message);
  }
}

export class ImportCommitConflictError extends DomainError {
  constructor(id: string) {
    super(
      "IMPORT_COMMIT_CONFLICT",
      `import job ${id} is already being committed (or committed) — retrying the same token is idempotent`,
    );
  }
}

/** PHASE-009 (T5): the item/category tax-code assignment FK surfaced cleanly. */
export class TaxCodeAssignmentInvalidError extends DomainError {
  constructor(message: string) {
    super("TAX_CODE_ASSIGNMENT_INVALID", message);
  }
}
