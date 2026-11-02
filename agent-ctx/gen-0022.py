import io, json, re, sys

base = "docs/industries/templates/"
files = {
    "industry.retail": base + "retail.md",
    "industry.grocery": base + "grocery-supermarket.md",
    "industry.restaurant": base + "restaurant-cafe.md",
}
manifests = {}
for key, path in files.items():
    src = io.open(path, encoding="utf-8").read()
    m = re.search(r"```json\n(.*?)```", src, re.S)
    assert m, path
    data = json.loads(m.group(1))
    assert data["id"] == key, (key, data["id"])
    manifests[key] = data
    print(key, data["version"], "keys:", len(data["required_feature_keys"]))

def dollar(obj):
    s = json.dumps(obj, ensure_ascii=False)
    assert "$$" not in s
    return "$$" + s + "$$"

seeds = []
for key in ["industry.retail", "industry.grocery", "industry.restaurant"]:
    d = manifests[key]
    seeds.append(
        f"""INSERT INTO "industry_templates" ("key", "name", "name_ar", "version", "manifest", "is_active")
VALUES ('{d['id']}', '{d['name']}', '{d['name_ar']}', '{d['version']}', {dollar(d)}::jsonb, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;"""
    )

sql = """-- PHASE-015 · migration 0022 · industry configuration framework
--
-- Purpose (PHASE-015 §4; CONFIGURATION_ENGINE §2; industries/README §3):
-- - `tenant_industry_config` — the tenant's applied L1 template (key, applied
--   version, manifest content hash, overrides, archived label/nav history) —
--   the write target of the apply/switch service (BR-038 additive-only).
-- - `feature_flags` — L8 rollout flags (platform delivery only, never tenant
--   policy; a flag may not emulate an entitlement — L4 is the only feature truth).
-- - seeds the three priority template manifests (industry.retail /
--   industry.grocery / industry.restaurant v1.0.0) into the platform-owned
--   `industry_templates` registry, validated against the manifest schema in CI.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_industry_config" (
  "tenant_id" uuid NOT NULL PRIMARY KEY REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "template_key" text NOT NULL REFERENCES "industry_templates" ("key") ON UPDATE CASCADE,
  "applied_version" text NOT NULL,
  "applied_manifest_hash" text NOT NULL,
  "applied_at" timestamptz NOT NULL DEFAULT now(),
  "overrides" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "archived" jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT ck_tic_version_shape CHECK ("applied_version" ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'),
  CONSTRAINT ck_tic_hash_shape CHECK ("applied_manifest_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "key" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "description" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_feature_flags PRIMARY KEY ("key"),
  CONSTRAINT ck_feature_flags_key_shape CHECK ("key" ~ '^[a-z][a-z0-9_]{2,40}(\\.[a-z0-9_]+)*$')
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"tenant_industry_config"');
--> statement-breakpoint
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "feature_flags" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "industry_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "industry_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Registry reads are global (platform-owned manifests): every app session may
-- read templates/flags; writes go through the configuration service in
-- platform scope only (platform_admin policies).
DROP POLICY IF EXISTS registry_read ON "industry_templates";
--> statement-breakpoint
CREATE POLICY registry_read ON "industry_templates" FOR SELECT TO erp_app, erp_readonly
  USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS registry_read ON "feature_flags";
--> statement-breakpoint
CREATE POLICY registry_read ON "feature_flags" FOR SELECT TO erp_app, erp_readonly
  USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS registry_write ON "industry_templates";
--> statement-breakpoint
CREATE POLICY registry_write ON "industry_templates" FOR ALL TO erp_app
  USING (erp.platform_scope_active()) WITH CHECK (erp.platform_scope_active());
--> statement-breakpoint
DROP POLICY IF EXISTS registry_write ON "feature_flags";
--> statement-breakpoint
CREATE POLICY registry_write ON "feature_flags" FOR ALL TO erp_app
  USING (erp.platform_scope_active()) WITH CHECK (erp.platform_scope_active());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "tenant_industry_config" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "tenant_industry_config" TO erp_readonly;
--> statement-breakpoint
GRANT SELECT ON "industry_templates", "feature_flags" TO erp_app, erp_readonly;
--> statement-breakpoint
-- The three priority template manifests (docs/industries/templates/*.md §Manifest,
-- schema: docs/industries/README.md §3 — CI-validated by manifest-schema.spec).
"""

sql += "\n--> statement-breakpoint\n".join(seeds) + "\n"

io.open("apps/api/migrations/0022_industry_configuration.sql", "w", encoding="utf-8").write(sql)

# journal entry
jp = "apps/api/migrations/meta/_journal.json"
j = json.load(open(jp))
j["entries"].append({
    "idx": 21,
    "version": "7",
    "when": 1793577600022,
    "tag": "0022_industry_configuration",
    "breakpoints": True,
})
json.dump(j, open(jp, "w"), indent=2)
print("migration + journal written")
