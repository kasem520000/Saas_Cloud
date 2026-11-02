import io

p = "apps/api/src/modules/pos/infrastructure/pos.store.ts"
s = io.open(p, encoding="utf-8").read()

cols = (
    'id, tenant_id AS "tenantId", branch_id AS "branchId", device_id AS "deviceId",\n'
    '  code, name, cash_account_id AS "cashAccountId", receipt_size_mm AS "receiptSizeMm",\n'
    '  status, activated_at AS "activatedAt", deactivated_at AS "deactivatedAt"'
)

s = s.replace(
    'SELECT * FROM "pos_terminals" ORDER BY "code"',
    'SELECT ' + cols + ' FROM "pos_terminals" ORDER BY "code"',
)
s = s.replace(
    'SELECT * FROM "pos_terminals" WHERE "code" = ${code} LIMIT 1',
    'SELECT ' + cols + ' FROM "pos_terminals" WHERE "code" = ${code} LIMIT 1',
)
s = s.replace(
    'SELECT * FROM "pos_terminals" WHERE "id" = ${id} LIMIT 1',
    'SELECT ' + cols + ' FROM "pos_terminals" WHERE "id" = ${id} LIMIT 1',
)
s = s.replace("    RETURNING *", "    RETURNING " + cols)

io.open(p, "w", encoding="utf-8").write(s)
print("ok", s.count('AS "tenantId"'))
