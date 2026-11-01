# ERD — Tenancy & Identity Cluster

> **Status:** STABLE · **Owner:** Database Architecture · **Updated:** 2026-10-27 · **Phases:** 002–004

Core attributes only (full column specs: [TABLES/tenancy-identity.md](../TABLES/tenancy-identity.md)).
All tenant-owned tables additionally carry `tenant_id`, `created_at`, `updated_at`,
`version` ([DATABASE_CONVENTIONS.md](../DATABASE_CONVENTIONS.md)).

```mermaid
erDiagram
  tenants ||--o{ branches : "has"
  tenants ||--o{ memberships : "has"
  users ||--o{ memberships : "joins"
  roles ||--o{ memberships : "grants"
  roles ||--o{ role_permissions : ""
  permissions ||--o{ role_permissions : ""
  users ||--o{ sessions : "authenticates"
  users ||--o{ devices : "registers"
  users ||--o{ mfa_factors : "enrolls"
  users ||--o{ invitations : "invited-by"
  tenants ||--o{ subscriptions : "subscribes"
  plans ||--o{ subscriptions : ""
  tenants ||--o{ entitlements : "resolves"
  tenants ||--o{ tenant_settings : "configures"
  tenants ||--o{ audit_events : "records"

  tenants {
    uuid id PK
    text name
    text name_ar
    text status
    text base_currency
    text country_code
    text industry_template_key
    timestamptz deleted_at
  }
  branches {
    uuid id PK
    text code
    text name
    text name_ar
    boolean is_active
  }
  users {
    uuid id PK
    text email UK
    text phone
    text password_hash
    text status
    text locale
  }
  memberships {
    uuid id PK
    uuid user_id FK
    uuid tenant_id FK
    uuid role_id FK
    text status
  }
  roles {
    uuid id PK
    text key
    text name
    boolean is_system
  }
  permissions {
    text key PK
    text module
  }
  sessions {
    uuid id PK
    uuid user_id FK
    text token_hash
    uuid active_tenant_id FK
    timestamptz expires_at
  }
  devices {
    uuid id PK
    uuid user_id FK
    text platform
    text key_hash
    timestamptz revoked_at
  }
  mfa_factors {
    uuid id PK
    uuid user_id FK
    text secret_enc
    text recovery_codes_hash
  }
  plans {
    uuid id PK
    text key UK
    jsonb limits
  }
  subscriptions {
    uuid id PK
    uuid tenant_id FK
    uuid plan_id FK
    text status
  }
  entitlements {
    uuid id PK
    uuid tenant_id FK
    text feature_key
    text source
  }
  audit_events {
    uuid id PK
    uuid tenant_id FK
    uuid actor_id
    text action
    text entity_type
    uuid entity_id
    jsonb before
    jsonb after
  }
```

Note: `sessions.active_tenant_id` is a convenience reference to the user's selected
membership — authorization still derives from `memberships`, never from this column
([../architecture/MULTI_TENANCY.md](../../architecture/MULTI_TENANCY.md)).
