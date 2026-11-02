import io

# 1) tables.registry.ts
p = "apps/api/src/__db__/isolation/tables.registry.ts"
s = io.open(p, encoding="utf-8").read()
anchor = '  // PHASE-015 (migration 0022): the applied-template row (PK = tenant_id).\n  { table: "tenant_industry_config" },\n'
assert anchor in s
s = s.replace(anchor, anchor + """  // PHASE-016 (migration 0023): POS module + narrow sync slice.
  { table: "pos_terminals" },
  { table: "change_log" },
  { table: "sync_cursors" },
  { table: "sync_commands" },
""", 1)
io.open(p, "w", encoding="utf-8").write(s)
print("registry ok")

# 2) identity-isolation.db.spec.ts
p2 = "apps/api/src/__db__/isolation/identity-isolation.db.spec.ts"
s2 = io.open(p2, encoding="utf-8").read()

# seedFixtures: append inserts after the cash_accounts insert block (find tenant_industry_config seed insert)
seed_anchor = None
import re
m = re.search(r"INSERT INTO tenant_industry_config[\s\S]*?ON CONFLICT[^\n]*\n[^\n]*\n?\s*\);", s2)
if m:
    seed_anchor = m.group(0)
print("seed anchor found:", bool(seed_anchor))
if seed_anchor:
    add = seed_anchor + """
  // PHASE-016 (migration 0023): POS terminals + narrow sync slice fixtures.
  await superuser.query(
    `INSERT INTO devices (id, user_id, platform, name, device_key_hash)
     VALUES ('e9e9e9e9-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'POS_TERMINAL', 'POS A', 'hash-iso-a')
     ON CONFLICT (id) DO NOTHING`,
  );
  await superuser.query(
    `INSERT INTO pos_terminals (id, tenant_id, branch_id, device_id, code, name, cash_account_id, receipt_size_mm, status)
     VALUES
       ('e0e0e0e0-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000001', 'POS-01', 'Counter A', 'd0d0d0d0-0000-4000-8000-000000000001', 80, 'ACTIVE'),
       ('e0e0e0e0-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', NULL, 'POS-01', 'Counter B', 'd0d0d0d0-0000-4000-8000-000000000002', 58, 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO change_log (tenant_id, entity_type, entity_id, op, payload)
     VALUES
       ($1, 'pos_terminal', 'e0e0e0e0-0000-4000-8000-000000000001', 'INSERT', '{}'::jsonb),
       ($2, 'pos_terminal', 'e0e0e0e0-0000-4000-8000-000000000002', 'INSERT', '{}'::jsonb)`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sync_cursors (id, tenant_id, device_id, entity_type, cursor)
     VALUES
       ('e1e1e1e1-0000-4000-8000-000000000001', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'items', 0),
       ('e1e1e1e1-0000-4000-8000-000000000002', $2, 'e9e9e9e9-0000-4000-8000-000000000001', 'items', 0)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sync_commands (idempotency_key, tenant_id, device_id, command_type, client_id, status, result)
     VALUES
       ('iso-cmd-a', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'pos_sale', 'e2e2e2e2-0000-4000-8000-000000000001', 'ACCEPTED', '{}'::jsonb),
       ('iso-cmd-b', $2, NULL, 'pos_sale', 'e2e2e2e2-0000-4000-8000-000000000002', 'REJECTED', '{}'::jsonb)`,
    [TENANT_A, TENANT_B],
  );
"""
    s2 = s2.replace(seed_anchor, add, 1)

# OWN_ROW entries
own_anchor = "  tenant_industry_config: [TENANT_A, TENANT_B],\n};"
assert own_anchor in s2
s2 = s2.replace(own_anchor, """  tenant_industry_config: [TENANT_A, TENANT_B],
  // PHASE-016: pos_terminals keyed by id; change_log by entity_id (PK = tenant_id+seq);
  // sync_cursors by id; sync_commands by idempotency_key (PK = tenant_id+key).
  pos_terminals: ["e0e0e0e0-0000-4000-8000-000000000001", "e0e0e0e0-0000-4000-8000-000000000002"],
  change_log: ["e0e0e0e0-0000-4000-8000-000000000001", "e0e0e0e0-0000-4000-8000-000000000002"],
  sync_cursors: ["e1e1e1e1-0000-4000-8000-000000000001", "e1e1e1e1-0000-4000-8000-000000000002"],
  sync_commands: ["iso-cmd-a", "iso-cmd-b"],
};""", 1)

# MISMATCHED_INSERT entries
mis_anchor = """  tenant_industry_config: `INSERT INTO tenant_industry_config (tenant_id, template_key, applied_version, applied_manifest_hash)
     VALUES ($1, 'industry.grocery', '1.0.0', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')`,
};"""
assert mis_anchor in s2
s2 = s2.replace(mis_anchor, """  tenant_industry_config: `INSERT INTO tenant_industry_config (tenant_id, template_key, applied_version, applied_manifest_hash)
     VALUES ($1, 'industry.grocery', '1.0.0', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')`,
  pos_terminals: `INSERT INTO pos_terminals (id, tenant_id, branch_id, code, name, cash_account_id)
     VALUES ('e0e0e0e0-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'POS-XX', 'X', 'd0d0d0d0-0000-4000-8000-000000000001')`,
  change_log: `INSERT INTO change_log (tenant_id, entity_type, entity_id, op)
     VALUES ($1, 'pos_terminal', 'e0e0e0e0-3000-4000-8000-000000000003', 'INSERT')`,
  sync_cursors: `INSERT INTO sync_cursors (id, tenant_id, device_id, entity_type, cursor)
     VALUES ('e1e1e1e1-3000-4000-8000-000000000003', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'items', 0)`,
  sync_commands: `INSERT INTO sync_commands (idempotency_key, tenant_id, command_type, client_id, status)
     VALUES ('iso-cmd-x', $1, 'pos_sale', 'e2e2e2e2-3000-4000-8000-000000000003', 'ACCEPTED')`,
};""", 1)

# idColumn special cases
idc_anchor = """    const idColumn =
      table === "role_permissions"
        ? "role_id"
        : table === "tenant_industry_config"
          ? "tenant_id"
          : "id";"""
assert idc_anchor in s2
s2 = s2.replace(idc_anchor, """    const idColumn =
      table === "role_permissions"
        ? "role_id"
        : table === "tenant_industry_config"
          ? "tenant_id"
          : table === "change_log"
            ? "entity_id"
            : table === "sync_commands"
              ? "idempotency_key"
              : "id";""", 1)

# probeColumn special cases
probe_anchor = '        const probeColumn = table === "tenant_industry_config" ? "applied_version" : "updated_at";'
assert probe_anchor in s2
s2 = s2.replace(probe_anchor, """        const probeColumn =
          table === "tenant_industry_config"
            ? "applied_version"
            : table === "change_log"
              ? "op"
              : table === "sync_commands"
                ? "status"
                : table === "sync_cursors"
                  ? "cursor"
                  : "updated_at";""", 1)

io.open(p2, "w", encoding="utf-8").write(s2)
print("isolation spec ok")
