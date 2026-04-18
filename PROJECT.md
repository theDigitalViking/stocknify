# Stocknify — Project Documentation

> This document is the single source of truth for all development decisions.
> Every coding agent session starts with this document as context.
> For frontend work, also read DESIGN_SYSTEM.md before writing any UI code.

---

## 1. Project Overview

### What is Stocknify?

Stocknify is a multi-tenant SaaS tool for inventory management and monitoring.
It connects shop and ERP systems (Shopify, WooCommerce, Xentral) with warehouse
management systems (fulfillers such as Hive, Byrd, Zenfulfillment) and shows merchants
their real-time inventory in a central dashboard — with configurable alert rules
and notifications across multiple channels.

### Core Problem

Merchants operating across multiple fulfillers and sales channels have no unified
view of their inventory. Critical thresholds are identified too late, leading to
overselling or unnecessarily high capital tied up in stock.

### Target Audience

- Primary: E-commerce merchants with 1–5 sales channels and 1–3 fulfillers
- Secondary: Fulfillers themselves (as white-label or reseller channel)
- Market: DACH region + English-speaking EU markets

### Go-to-Market

Primary channel: partnerships with fulfillers (Hive, Byrd, Zenfulfillment, BigBlue,
ShipBob). Fulfillers recommend Stocknify to their merchants or integrate it directly
into their offering. This creates a scalable B2B2C sales channel without direct
end-customer acquisition costs.

---

## 2. Tech Stack

### Decision Principle

The stack is deliberately conventional to ensure maximum compatibility with
AI coding agents (Claude Code, Cursor). No exotic frameworks, no custom toolchains.
Every decision is justified and final — deviations only after explicit discussion
and documentation.

### Frontend

| Technology | Version | Rationale |
|------------|---------|-----------|
| Next.js | 14+ (App Router) | Best AI codegen coverage, SPA + SSR where needed |
| TypeScript | 5+ | Strict mode, no `any` types |
| Tailwind CSS | 3+ | Utility-first, no CSS-in-JS |
| shadcn/ui | latest | Headless UI components on Radix foundation |
| TanStack Query | 5+ | Server state management, caching |
| Zustand | 4+ | Client state (minimal, only where needed) |
| Recharts | 2+ | Charts and visualizations |
| React Hook Form + Zod | latest | Forms and validation |

**Hosting:** Vercel (automatic deployment from `main` branch)

### Backend

| Technology | Version | Rationale |
|------------|---------|-----------|
| Node.js | 20 LTS | Stable, broad tooling support |
| Fastify | 4+ | Faster than Express, good TypeScript support |
| TypeScript | 5+ | Strict mode |
| Prisma | 5+ | Type-safe ORM, good migration tooling |
| BullMQ | 4+ | Job queues for integration syncs |
| Zod | 3+ | API request/response validation |

**Hosting:** Hetzner Cloud (CX21, Ubuntu 24.04) via Docker + Kamal

### Database & Infrastructure

| Technology | Purpose |
|------------|---------|
| PostgreSQL 16 | Primary database (Supabase managed) |
| Row-Level Security (RLS) | Multi-tenant isolation at DB level |
| Supabase Auth | Authentication, session management |
| Redis (Upstash) | BullMQ job queue, rate-limiting cache |
| Resend | Transactional emails |
| Stripe | Billing, subscriptions |

### External Services

| Service | Purpose |
|---------|---------|
| GitHub | Code, CI/CD via GitHub Actions |
| Vercel | Frontend hosting, preview deployments |
| Hetzner Cloud | Backend server |
| Sentry | Error tracking (frontend + backend) |
| Upstash | Managed Redis |
| Supabase | PostgreSQL + Auth |
| Resend | Email delivery |
| Stripe | Payment processing |
| Twilio | SMS notifications (Phase 2) |

---

## 3. Repository Structure

```
stocknify/
├── apps/
│   ├── web/                    # Next.js frontend (Vercel)
│   │   ├── app/                # App Router pages
│   │   │   ├── (auth)/         # Login, register, onboarding
│   │   │   ├── (dashboard)/    # Main application (requires auth)
│   │   │   │   ├── stock/      # Inventory overview
│   │   │   │   ├── rules/      # Rule engine UI
│   │   │   │   ├── integrations/ # Integration management
│   │   │   │   ├── notifications/ # Notification channel settings
│   │   │   │   └── settings/   # Tenant settings, billing, users
│   │   │   └── api/            # Next.js API routes (auth callbacks only)
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui base components
│   │   │   ├── stock/          # Stock-specific components
│   │   │   ├── rules/          # Rule builder components
│   │   │   └── shared/         # Layout, navigation, etc.
│   │   ├── lib/
│   │   │   ├── api.ts          # API client (TanStack Query hooks)
│   │   │   ├── auth.ts         # Supabase auth client
│   │   │   └── utils.ts        # Helper functions
│   │   └── types/              # Shared TypeScript types (from packages/shared)
│   │
│   └── api/                    # Fastify backend (Hetzner/Docker)
│       ├── src/
│       │   ├── routes/         # API route handlers
│       │   │   ├── auth/       # Auth endpoints (Supabase webhook)
│       │   │   ├── stock/      # Stock CRUD
│       │   │   ├── rules/      # Rule management
│       │   │   ├── integrations/ # Integration config
│       │   │   ├── notifications/ # Notification config
│       │   │   ├── webhooks/   # Incoming webhooks (Shopify, etc.)
│       │   │   └── billing/    # Stripe webhooks + billing
│       │   ├── services/       # Business logic
│       │   │   ├── stock/
│       │   │   ├── rule-engine/
│       │   │   ├── notification/
│       │   │   └── billing/
│       │   ├── integrations/   # Connector implementations
│       │   │   ├── base/       # AbstractConnector interface
│       │   │   ├── shopify/
│       │   │   ├── woocommerce/
│       │   │   ├── xentral/
│       │   │   ├── hive/
│       │   │   ├── byrd/
│       │   │   └── zenfulfillment/
│       │   ├── jobs/           # BullMQ job definitions
│       │   │   ├── sync-stock.job.ts
│       │   │   ├── evaluate-rules.job.ts
│       │   │   └── send-notification.job.ts
│       │   ├── db/
│       │   │   ├── schema.prisma
│       │   │   └── migrations/
│       │   ├── middleware/     # Auth, rate-limiting, tenant context
│       │   └── plugins/        # Fastify plugins
│       └── Dockerfile
│
├── packages/
│   └── shared/                 # Shared types and utilities
│       ├── types/              # TypeScript interfaces (Stock, Rule, etc.)
│       ├── schemas/            # Zod schemas (validation on both sides)
│       └── constants/          # Enums, constants
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint, type-check, tests
│       └── deploy.yml          # Deploy to Vercel + Hetzner
│
├── docker-compose.yml          # Local development
├── docker-compose.prod.yml     # Production
├── turbo.json                  # Turborepo configuration
├── package.json                # Root package (workspaces)
└── PROJECT.md                  # This file
```

---

## 4. Multi-Tenant Architecture

### Strategy: Shared Database, Row-Level Security

All tenants share a single PostgreSQL database. Isolation is enforced exclusively
via PostgreSQL Row-Level Security (RLS). No separate schema and no separate container
per tenant.

**Rationale:**
- 20–200 tenants: separate containers would be operational overkill
- RLS is battle-tested and performant
- Supabase supports RLS natively and generates auth tokens with `tenant_id`
- Simpler to operate, cheaper, and coding agents can implement it precisely

### Tenant Context in Requests

Every authenticated request carries the Supabase JWT with `tenant_id`.
The backend middleware extracts the tenant context and sets it as a
Postgres session variable (`SET app.current_tenant_id = '...'`).
RLS policies then automatically apply to all queries.

```typescript
// Middleware pseudocode
async function tenantMiddleware(request, reply) {
  const { tenant_id } = await verifyJWT(request.headers.authorization);
  await db.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}, true)`;
  request.tenantId = tenant_id;
}
```

### RLS Policy Pattern (for all tenant-scoped tables)

```sql
-- Example for the stock_items table
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON stock_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Tenant Isolation Rules

- Every table containing tenant data has a `tenant_id UUID NOT NULL` column
- Every such table has an RLS policy following the pattern above
- No cross-tenant queries are possible (except in admin context with bypassrls)
- Integration credentials are stored encrypted (AES-256, key from environment variable)

---

## 5. Database Schema

### Core Principles

- All primary keys: `UUID` (gen_random_uuid())
- All timestamps: `TIMESTAMPTZ` (always UTC)
- Soft deletes via `deleted_at TIMESTAMPTZ` (never hard delete)
- Audit timestamps: `created_at`, `updated_at` on all tables
- Naming: `snake_case` for all database objects

### Architecture Decisions

**Product structure is three-tiered:** `products` (master data) → `product_variants`
(SKU + attribute combination e.g. size/color) → `product_bundles` (which variants
make up a bundle and in what quantity). Stock is always tracked at variant level.
Bundle stock is derived, never stored directly.

**Variants are transparent to the user by default:** A simple product (one SKU,
no size/color) always has exactly one auto-created default variant. The UI never
exposes the variant layer unless the product has more than one variant. The API
aggregates to product level for display. Internally, `stock_levels` always
references `variant_id`, never `product_id` directly.

**Bundles are schema-ready but logic-deferred:** The `product_bundles` table is
created in the initial migration. Bundle business logic (derived stock, component
reservation) is not implemented in MVP — controlled by a `bundle_tracking` feature
flag on the `tenants` table. Phase 3 will implement the full logic.

**Location structure is two-tiered:** `locations` (warehouses/fulfillers) →
`storage_locations` (bins/shelves within a location). Whether a storage location
tracks its own inventory is configurable per location via `bin_tracking_enabled`.
`stock_levels` has an optional `storage_location_id`.

**Stock types are integration-driven, not freely configurable:** Stock type definitions
exist in `stock_type_definitions` as a reference table, but which types actually get
populated for a given product+location combination depends entirely on the integration.
A fulfiller API only sends the stock types it supports — Stocknify cannot add types
that the fulfiller doesn't provide. Exception: CSV imports are unbounded and can carry
any stock type defined in `stock_type_definitions`, including tenant-custom types.
This means the Stock page must display rows dynamically based on what data exists,
not based on a fixed set of columns.

**Stock types are tenant-extensible:** A `stock_type_definitions` table holds
system defaults plus any custom types a tenant adds. System defaults are:
`available`, `physical`, `reserved`, `blocked`, `in_transit`, `expired`,
`damaged`, `pre_transit`. Stock type is a free-text string validated against this
table at runtime — not a TypeScript enum. New types can be added without schema
or code changes.

**Batch/MHD tracking is per-product configurable:** Products have a
`batch_tracking` flag. When enabled, stock is tracked per batch in the `batches`
table. `stock_levels` gets an optional `batch_id`. Batches carry `batch_number`,
`expiry_date`, `manufactured_date`.

**stock_levels uses a COALESCE-based unique index for nullable foreign keys:**
PostgreSQL does not treat NULL as equal in standard UNIQUE constraints, which
would allow duplicate batch-agnostic or bin-agnostic rows. A custom unique index
using COALESCE replaces the standard constraint. This index is defined in
`apps/api/src/db/migrations/manual/unique-stock-levels.sql` and must be applied
after the initial Prisma migration. Prisma schema carries a comment referencing
this file.

**Stock movements are explicit:** Every change to `stock_levels` produces a
`stock_movements` record with `movement_type`, optional `reason`, and optional
reference to an external document. This replaces the simpler `stock_history`
append-only approach and enables full audit trails.

**Stock movements retention is plan-limited with user control:** Movements are
retained up to a maximum of 1 year regardless of plan. Within that window, the
plan determines how far back the UI exposes data (Trial: 7 days, Starter: 30 days,
Growth: 1 year, Enterprise: 1 year). After 1 year, the system prompts the tenant
to choose: delete or aggregate to daily summaries. No data is deleted automatically
without explicit tenant confirmation.

**MHD/expiry logic runs through the Rule Engine:** No hardcoded expiry logic.
The rule engine supports condition types `days_until_expiry` and
`stock_type_transition`, enabling tenants to configure their own expiry alerts
and auto-reclassification rules.

**Rules have a DB-level check constraint for valid condition combinations:**
To prevent invalid rule configurations (e.g. a `stock_level` rule without an
operator), a CHECK constraint enforces that `operator` and `threshold` are
non-null when `condition_type = 'stock_level'`, and `days_threshold` is non-null
when `condition_type = 'days_until_expiry'`. Defined in
`apps/api/src/db/migrations/manual/rules-check-constraint.sql`.

**Batch-agnostic stock is a first-class concept:** A product with
`batch_tracking = true` can still have stock records with `batch_id = NULL`.
This is intentional and common in practice — for example, `available` stock
that has already been deducted by orders at the fulfiller level, but where the
physical batch assignment has not yet happened. This is not a data error.

To distinguish intentional batch-agnostic stock from missing data, a
`variant_location_config` table stores per-variant-per-location settings:
- `batch_required`: whether batch_id must be present for this stock type at
  this location. If false, NULL batch_id is accepted silently.
- `export_strategy`: how to handle batch-agnostic stock when writing back to
  an ERP or shop system. Options: `skip` (exclude from export) or `dummy`
  (inject placeholder batch data).
- `dummy_batch_number`: static batch number to use when strategy is `dummy`.
- `dummy_expiry_offset_days`: expiry date = today + N days, used when strategy
  is `dummy` and no real expiry is known.

This allows tenants to configure per integration how ambiguous stock is handled
on export, without polluting the core stock data with fake values.

### Table Overview

```sql
-- Tenants (customers/companies)
tenants
  id UUID PK
  name TEXT NOT NULL
  slug TEXT UNIQUE NOT NULL
  plan TEXT NOT NULL DEFAULT 'trial'   -- trial | starter | growth | enterprise
  plan_status TEXT NOT NULL DEFAULT 'active'
  stripe_customer_id TEXT
  stripe_subscription_id TEXT
  trial_ends_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Users (linked to Supabase Auth)
users
  id UUID PK                           -- matches Supabase Auth user ID
  tenant_id UUID FK -> tenants
  email TEXT NOT NULL
  full_name TEXT
  role TEXT NOT NULL DEFAULT 'user'    -- admin | user | viewer
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

-- Stock type definitions (system defaults + tenant-custom types)
stock_type_definitions
  id UUID PK
  tenant_id UUID FK -> tenants (nullable — null = system default)
  key TEXT NOT NULL                    -- 'available' | 'physical' | 'reserved' | ...
  label TEXT NOT NULL                  -- display name
  description TEXT
  is_system BOOLEAN NOT NULL DEFAULT false
  color TEXT                           -- hex color for UI display
  sort_order INT NOT NULL DEFAULT 0
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, key)

-- Products (master data, no SKU here — SKU lives on variants)
products
  id UUID PK
  tenant_id UUID FK -> tenants
  name TEXT NOT NULL
  description TEXT
  category TEXT
  unit TEXT DEFAULT 'piece'            -- piece | kg | liter | etc.
  batch_tracking BOOLEAN NOT NULL DEFAULT false
  metadata JSONB DEFAULT '{}'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Product variants (SKU level — size, color, etc.)
product_variants
  id UUID PK
  tenant_id UUID FK -> tenants
  product_id UUID FK -> products
  sku TEXT NOT NULL
  name TEXT                            -- e.g. "Red / XL"
  barcode TEXT
  attributes JSONB DEFAULT '{}'        -- {color: "red", size: "XL"}
  is_active BOOLEAN NOT NULL DEFAULT true
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ
  UNIQUE(tenant_id, sku)

-- Product bundles (which variants make up a bundle)
product_bundles
  id UUID PK
  tenant_id UUID FK -> tenants
  bundle_variant_id UUID FK -> product_variants  -- the bundle SKU itself
  component_variant_id UUID FK -> product_variants
  quantity NUMERIC(12,3) NOT NULL
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

-- Batches / lots (for MHD and lot tracking)
batches
  id UUID PK
  tenant_id UUID FK -> tenants
  product_id UUID FK -> products
  batch_number TEXT NOT NULL
  expiry_date DATE
  manufactured_date DATE
  metadata JSONB DEFAULT '{}'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, product_id, batch_number)

-- Warehouse locations (fulfiller / own warehouse / virtual)
locations
  id UUID PK
  tenant_id UUID FK -> tenants
  name TEXT NOT NULL
  type TEXT NOT NULL                   -- fulfiller | own_warehouse | virtual
  integration_id UUID FK -> integrations (nullable)
  bin_tracking_enabled BOOLEAN NOT NULL DEFAULT false
  address JSONB DEFAULT '{}'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Storage locations / bins / shelves within a location
storage_locations
  id UUID PK
  tenant_id UUID FK -> tenants
  location_id UUID FK -> locations
  name TEXT NOT NULL                   -- e.g. "A-01-03" or "Shelf B"
  type TEXT NOT NULL DEFAULT 'bin'     -- bin | shelf | zone | collection
  track_inventory BOOLEAN NOT NULL DEFAULT true
  metadata JSONB DEFAULT '{}'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Stock levels (current quantities — the heart of the system)
stock_levels
  id UUID PK
  tenant_id UUID FK -> tenants
  variant_id UUID FK -> product_variants
  location_id UUID FK -> locations
  storage_location_id UUID FK -> storage_locations (nullable)
  batch_id UUID FK -> batches (nullable)
  stock_type TEXT NOT NULL             -- references stock_type_definitions.key
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0
  last_synced_at TIMESTAMPTZ
  source TEXT                          -- 'manual' | 'shopify' | 'hive' | etc.
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, variant_id, location_id, storage_location_id, batch_id, stock_type)

-- Stock movements (every change to stock_levels — full audit trail)
stock_movements
  id UUID PK
  tenant_id UUID FK -> tenants
  variant_id UUID FK -> product_variants
  location_id UUID FK -> locations
  storage_location_id UUID FK -> storage_locations (nullable)
  batch_id UUID FK -> batches (nullable)
  stock_type TEXT NOT NULL
  quantity_before NUMERIC(12,3) NOT NULL
  quantity_after NUMERIC(12,3) NOT NULL
  delta NUMERIC(12,3) NOT NULL
  movement_type TEXT NOT NULL          -- inbound | outbound | correction | transfer | return | disposal | sync
  reason TEXT                          -- optional free text
  reference_type TEXT                  -- 'order' | 'shipment' | 'adjustment' | null
  reference_id TEXT                    -- external document ID (optional)
  source TEXT                          -- 'manual' | 'shopify' | 'hive' | 'rule_engine' | etc.
  created_by UUID FK -> users (nullable)
  created_at TIMESTAMPTZ               -- append-only, no updated_at

-- Integrations (shop/ERP/WMS connections)
integrations
  id UUID PK
  tenant_id UUID FK -> tenants
  type TEXT NOT NULL                   -- shopify | woocommerce | xentral | hive | byrd | zenfulfillment
  name TEXT NOT NULL
  status TEXT NOT NULL DEFAULT 'pending' -- pending | active | error | paused
  credentials JSONB NOT NULL DEFAULT '{}' -- AES-256 encrypted
  config JSONB NOT NULL DEFAULT '{}'
  last_sync_at TIMESTAMPTZ
  last_error TEXT
  sync_interval_minutes INT DEFAULT 15
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Alert rules
rules
  id UUID PK
  tenant_id UUID FK -> tenants
  name TEXT NOT NULL
  description TEXT
  is_active BOOLEAN NOT NULL DEFAULT true
  -- Filters
  variant_filter JSONB DEFAULT '{}'    -- null = all variants, or {sku: [...]}
  location_filter JSONB DEFAULT '{}'   -- null = all locations
  batch_filter JSONB DEFAULT '{}'      -- null = all batches
  -- Condition
  condition_type TEXT NOT NULL         -- stock_level | days_until_expiry | stock_type_transition
  stock_type TEXT                      -- for stock_level conditions
  operator TEXT                        -- lt | lte | gt | gte | eq
  threshold NUMERIC(12,3)              -- for stock_level conditions
  days_threshold INT                   -- for days_until_expiry conditions
  -- Escalation
  cooldown_minutes INT DEFAULT 60
  last_triggered_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Actions belonging to a rule
rule_actions
  id UUID PK
  tenant_id UUID FK -> tenants
  rule_id UUID FK -> rules
  channel_id UUID FK -> notification_channels
  message_template TEXT
  -- For stock_type_transition rules: auto-reclassify stock
  transition_to_stock_type TEXT        -- nullable — if set, auto-move stock to this type
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

-- Notification channels
notification_channels
  id UUID PK
  tenant_id UUID FK -> tenants
  name TEXT NOT NULL
  type TEXT NOT NULL                   -- email | slack | webhook | sms | in_app
  config JSONB NOT NULL DEFAULT '{}'
  is_active BOOLEAN NOT NULL DEFAULT true
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Alert history
alerts
  id UUID PK
  tenant_id UUID FK -> tenants
  rule_id UUID FK -> rules
  variant_id UUID FK -> product_variants
  location_id UUID FK -> locations
  batch_id UUID FK -> batches (nullable)
  triggered_value NUMERIC(12,3)        -- quantity or days_until_expiry
  threshold NUMERIC(12,3)
  status TEXT NOT NULL DEFAULT 'sent'  -- sent | acknowledged | resolved
  acknowledged_by UUID FK -> users (nullable)
  acknowledged_at TIMESTAMPTZ
  created_at TIMESTAMPTZ

-- Per-variant-per-location configuration (batch export strategy etc.)
variant_location_config
  id UUID PK
  tenant_id UUID FK -> tenants
  variant_id UUID FK -> product_variants
  location_id UUID FK -> locations
  -- Batch handling
  batch_required BOOLEAN NOT NULL DEFAULT false  -- if false, NULL batch_id is valid even when product has batch_tracking=true
  -- Export strategy for batch-agnostic stock (batch_id = NULL on a batchable product)
  export_strategy TEXT NOT NULL DEFAULT 'skip'   -- skip | dummy
  dummy_batch_number TEXT                        -- used when export_strategy = 'dummy'
  dummy_expiry_offset_days INT                   -- expiry = today + N days, when export_strategy = 'dummy'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, variant_id, location_id)

-- Notification deliveries (one per channel per alert)
notification_deliveries
  id UUID PK
  tenant_id UUID FK -> tenants
  alert_id UUID FK -> alerts
  channel_id UUID FK -> notification_channels
  status TEXT NOT NULL DEFAULT 'pending' -- pending | sent | failed
  error TEXT
  sent_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
```

---

## 6. API Design

### Conventions

- REST API, JSON, camelCase for all fields
- Base URL: `https://api.stocknify.app/v1`
- Authentication: `Authorization: Bearer <supabase-jwt>`
- All responses use the following envelope format:

```json
{ "data": { ... }, "meta": {} }
{ "data": [...], "meta": { "total": 42, "page": 1, "perPage": 25 } }
{ "error": { "code": "RULE_NOT_FOUND", "message": "..." } }
```

- Error codes are uppercase snake_case strings
- Pagination: `?page=1&perPage=25`
- Sorting: `?sortBy=createdAt&sortDir=desc`

### Endpoint Overview

```
POST   /auth/webhook
GET    /tenant
PATCH  /tenant
GET    /users
POST   /users/invite
PATCH  /users/:id
DELETE /users/:id
GET    /products
POST   /products
GET    /products/:id
PATCH  /products/:id
DELETE /products/:id
GET    /locations
POST   /locations
PATCH  /locations/:id
DELETE /locations/:id
GET    /stock
GET    /stock/:variantId
PUT    /stock
GET    /stock/movements
GET    /integrations
POST   /integrations
GET    /integrations/:id
PATCH  /integrations/:id
DELETE /integrations/:id
POST   /integrations/:id/sync
GET    /integrations/:id/status
GET    /rules
POST   /rules
GET    /rules/:id
PATCH  /rules/:id
DELETE /rules/:id
POST   /rules/:id/test
GET    /notification-channels
POST   /notification-channels
PATCH  /notification-channels/:id
DELETE /notification-channels/:id
POST   /notification-channels/:id/test
GET    /alerts
PATCH  /alerts/:id/acknowledge
GET    /billing/plans
GET    /billing/subscription
POST   /billing/portal
POST   /billing/checkout
POST   /webhooks/shopify/:integrationId
POST   /webhooks/woocommerce/:integrationId
POST   /webhooks/stripe
```

---

## 7. Integration Framework

### AbstractConnector Interface

```typescript
interface StockData {
  sku: string;
  locationName: string;
  stockType: string;           // references stock_type_definitions.key
  quantity: number;
  batchNumber?: string;
  expiryDate?: string;         // ISO date string
  storageLocation?: string;    // bin/shelf name, optional
}

interface AbstractConnector {
  readonly type: string;
  readonly displayName: string;
  readonly direction: 'source' | 'target' | 'bidirectional';
  validateCredentials(credentials: unknown): Promise<boolean>;
  setupWebhooks?(integrationId: string): Promise<void>;
  fetchStockLevels(): Promise<StockData[]>;
  fetchProducts?(): Promise<{ sku: string; name: string }[]>;
  parseWebhook?(payload: unknown, signature: string): Promise<StockData[] | null>;
}
```

### Integrations by Priority

| Integration | Type | Priority | Protocol |
|-------------|------|----------|----------|
| Shopify | Shop/Source | P1 | REST + Webhooks |
| WooCommerce | Shop/Source | P1 | REST + Webhooks |
| Xentral | ERP/Source | P1 | REST |
| Hive | Fulfiller/Source | P1 | REST + Webhooks |
| Byrd | Fulfiller/Source | P2 | REST |
| Zenfulfillment | Fulfiller/Source | P2 | REST |
| BigBlue | Fulfiller/Source | P2 | REST |
| Magento | Shop/Source | P3 | REST |
| ShipBob | Fulfiller/Source | P3 | REST |

### Sync Strategy

- Pull sync every N minutes (configurable, default: 15 min) via BullMQ
- Push sync via webhooks where available for immediate updates
- Conflict resolution: newer timestamp always wins; all changes logged in `stock_movements`

---

## 8. Rule Engine

### Condition Types

The rule engine supports three condition types, making it extensible beyond simple
stock thresholds:

| Condition Type | Triggered By | Example Use Case |
|----------------|-------------|-----------------|
| `stock_level` | Any stock update | Alert when available stock < 10 |
| `days_until_expiry` | Scheduled daily job | Alert when batch expires in < 30 days |
| `stock_type_transition` | Any stock update | Auto-move stock to `expired` when MHD passed |

### Evaluation Logic

```
1. Stock update arrives (via sync, webhook, or manual adjustment)
2. `evaluate-rules` job pushed to queue (with variantId + locationId + batchId?)
3. Job loads all active rules matching this variant/location/batch
4. For each rule: evaluate condition based on condition_type
5. If condition met AND cooldown passed:
   a. Create alert in `alerts` table
   b. For each rule_action:
      — Create `send-notification` job if channel_id is set
      — Execute stock type transition if transition_to_stock_type is set
   c. Update `last_triggered_at` on the rule

Separately, a scheduled daily job evaluates all `days_until_expiry` rules
against all active batches with expiry_date set.
```

### Condition Evaluation

```typescript
function evaluateRule(rule: Rule, context: RuleContext): boolean {
  switch (rule.condition_type) {
    case 'stock_level':
      return evaluateStockLevel(rule, context.quantity);
    case 'days_until_expiry':
      return evaluateDaysUntilExpiry(rule, context.expiryDate);
    case 'stock_type_transition':
      return evaluateTransition(rule, context);
  }
}

function evaluateStockLevel(rule: Rule, quantity: number): boolean {
  switch (rule.operator) {
    case 'lt':  return quantity < rule.threshold;
    case 'lte': return quantity <= rule.threshold;
    case 'gt':  return quantity > rule.threshold;
    case 'gte': return quantity >= rule.threshold;
    case 'eq':  return quantity === rule.threshold;
  }
}

function evaluateDaysUntilExpiry(rule: Rule, expiryDate: Date | null): boolean {
  if (!expiryDate) return false;
  const daysUntil = differenceInDays(expiryDate, new Date());
  return daysUntil <= rule.days_threshold;
}
```

---

## 9. Notification System

### Channel Configurations

```typescript
{ type: 'email',   config: { to: ['ops@example.com'], subject?: string } }
{ type: 'slack',   config: { webhookUrl: 'https://hooks.slack.com/...', channel?: string } }
{ type: 'webhook', config: { url: '...', method: 'POST', headers?: Record<string, string> } }
{ type: 'sms',     config: { phoneNumbers: ['+4917...'] } }
{ type: 'in_app',  config: {} }
```

### Message Template Variables

```
{{product.name}}           {{product.sku}}            {{variant.name}}
{{variant.sku}}            {{location.name}}          {{storage_location.name}}
{{stock.quantity}}         {{stock.type}}             {{batch.number}}
{{batch.expiry_date}}      {{batch.days_until_expiry}} {{rule.name}}
{{rule.threshold}}         {{alert.url}}
```

---

## 10. Billing & Plans

| Feature | Trial | Starter | Growth | Enterprise |
|---------|-------|---------|--------|------------|
| Duration | 14 days | unlimited | unlimited | unlimited |
| Price/month | free | €49 | €149 | on request |
| Integrations | 2 | 3 | 10 | unlimited |
| Products | 500 | 1,000 | 10,000 | unlimited |
| Rules | 5 | 10 | 50 | unlimited |
| Notification channels | 2 | 3 | 10 | unlimited |
| Sync interval | 60 min | 30 min | 5 min | 1 min |
| Stock history | 7 days | 30 days | 1 year | unlimited |
| Support | — | Email | Email + chat | Dedicated |

### Stripe Integration

**Checkout Flow mit Partner-Logik:**
1. User klickt "Upgrade" im Dashboard
2. Frontend ruft `POST /billing/checkout` auf mit `plan: 'growth'`
3. Backend prüft Tenant-Zugehörigkeit und Billing-Mode:
   - `billing_mode: 'via_partner'` + `partner_pays`: Partner-Stripe-Customer wird belastet (aggregated billing)
   - `billing_mode: 'direct'` mit Partner: Merchant zahlt direkt, Stripe Coupon automatisch angewendet
   - Kein Partner: Standard-Checkout ohne Rabatt
4. **Coupon-Hierarchie beim Checkout:**
   ```
   1. tenant.discount_percent → dynamischer Stripe Coupon (on-the-fly erstellt)
   2. partner.stripe_coupon_id_partner_pays ODER stripe_coupon_id_direct_pays
      (je nach tenant.billing_mode — vordefiniert in Stripe)
   3. Kein Coupon
   ```
5. Backend erstellt Stripe Checkout Session mit korrektem Coupon
6. User wird zu Stripe weitergeleitet
7. `checkout.session.completed` Webhook → Backend aktualisiert `tenants.plan`

**Stripe Entitäten pro Partner:**
- `stripe_customer_id` — für `partner_pays`-Abrechnung (Partner zahlt gesammelt)
- `stripe_coupon_id_partner_pays` — vordefinierter Coupon wenn Partner abrechnet
- `stripe_coupon_id_direct_pays` — vordefinierter Coupon wenn Merchant direkt zahlt (Affiliate-Rabatt)

Beide Coupons werden manuell in Stripe angelegt wenn ein Partner-Vertrag abgeschlossen wird
und dann im Stocknify Admin auf dem `partners`-Eintrag hinterlegt.

**Warum keine separate Coupon-Tabelle für MVP:** Zwei Felder pro Partner sind ausreichend.
Coupon-Tiers (z.B. ab 10 Kunden mehr Rabatt) kommen in Phase 2 als separates Feature.

### Subscription Management
- `POST /billing/portal` → Stripe Customer Portal
- Alle Billing-Änderungen via Stripe Webhook (`/webhooks/stripe`)
- Stripe Webhooks werden via `STRIPE_WEBHOOK_SECRET` verifiziert

---

## 11. Coding Conventions

### TypeScript
- Strict mode: `"strict": true` in tsconfig
- No `any` types — use `unknown` and narrow
- No non-null assertions (`!`) — check explicitly
- All functions have explicit return types
- Interfaces for object shapes, type aliases for unions/primitives

### Naming
- Variables/functions: `camelCase`
- Classes/interfaces/types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case.ts`
- DB columns: `snake_case`
- API fields: `camelCase`

### Error Handling
- All async functions in try/catch — no unhandled rejections
- Custom error classes for business logic errors (`PlanLimitError`, `IntegrationError`)
- HTTP errors via Fastify's `reply.code(x).send()`
- Never expose sensitive data in error messages in production

### Database Access
- Exclusively via Prisma — no raw SQL except for RLS setup and performance-critical queries
- Raw SQL: always `$queryRaw` with tagged template literals
- No N+1 queries — always use `include` or separate batch queries
- All DB operations have a timeout (default: 5s)

### Security
- All incoming data validated with Zod (API + webhooks)
- Always verify webhook signatures (HMAC)
- Integration credentials: AES-256-GCM encrypted, key from environment variable
- Rate limiting: 100 req/min per tenant, 10 req/min for auth endpoints
- No sensitive data in logs — mask credentials, tokens, etc.

### Tests
- Unit tests: rule engine, notification templates, integration parsers, external reference matching
- Integration tests: all API route handlers (using Fastify inject, no real DB)
- E2E tests: critical user journeys with Playwright (see section 18)
- Test framework: Vitest (backend + shared), Playwright (E2E)
- Frontend component tests: Vitest + React Testing Library
- Minimum coverage targets:
  - Rule engine: 90%
  - API route handlers: 80%
  - Integration connectors: 80%
  - Shared schemas/utils: 95%
  - Frontend components: 70%
- Coverage reports generated in CI via `vitest --coverage`
- Tests run on every push and pull request (CI blocks merge on failure)
- Tests are written AFTER each feature phase is complete, before live testing begins

---

## 12. Environment Variables

### Backend (.env)

```bash
NODE_ENV=development|production
PORT=3001
API_URL=https://api.stocknify.app
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
REDIS_URL=redis://...
CREDENTIALS_ENCRYPTION_KEY=...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
FROM_EMAIL=alerts@stocknify.app
SENTRY_DSN=https://...
# Phase 2
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=https://api.stocknify.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_SENTRY_DSN=https://...
```

---

## 13. Deployment

| Environment | Frontend | Backend | Purpose |
|-------------|----------|---------|---------|
| Local | localhost:3000 | localhost:3001 | Development |
| Staging | staging.stocknify.app | api-staging.stocknify.app | QA, preview |
| Production | app.stocknify.app | api.stocknify.app | Live |

**Frontend:** Vercel — auto-deploy on push to `main`, preview URLs for PRs.

**Backend:** Hetzner via Kamal — zero-downtime container swap, health check on `GET /health`.

**CI/CD:** Type check → lint → unit tests → build → deploy staging → E2E tests → deploy production (manual approval).

---

## 14. Internationalisation (i18n)

### Supported Locales

- `en` — English (default, fallback)
- `de` — German
- Future: `fr`, `it`, `es` (architecture must support adding new locales without schema changes)

### Library

**`next-intl`** — built specifically for Next.js App Router, supports Server Components
natively, minimal overhead. Do not use `i18next` or `react-i18next`.

### Locale Detection & Storage

1. **Auto-detect** from `Accept-Language` header in Next.js middleware on first visit
2. **Fallback** to `en` if browser language is not supported
3. **User preference** stored as `locale` column on the `users` table (VARCHAR(10), e.g. `'en'`, `'de'`)
4. Stored preference takes priority over browser detection on subsequent visits
5. User can change locale in Settings → Account — updates via `PATCH /users/:id`

### URL Structure

Locale is **not** in the URL path. Routing stays clean (`/stock`, `/rules`, etc.).
The locale is resolved server-side from the user's stored preference or browser header.
This avoids breaking links when a user switches language.

### Translation Files

Stored in `apps/web/messages/` — one JSON file per locale:

```
apps/web/messages/
  en.json
  de.json
```

All UI strings go through `next-intl` — no hardcoded English strings in components.
Use namespaced keys: `{ "stock": { "title": "Inventory" }, "rules": { "title": "Rules" } }`

### Notification Templates (i18n)

Default notification message templates are stored per locale in a
`notification_templates` table. When a rule fires, the system selects the template
matching the tenant's primary locale (defaulting to `en`).

Users can override any default template or create custom templates.
The `{{variable}}` substitution system applies to all templates regardless of locale.

```sql
-- notification_templates table (add to schema)
notification_templates
  id UUID PK
  tenant_id UUID FK -> tenants (nullable — null = system default)
  rule_action_id UUID FK -> rule_actions (nullable — null = applies to all)
  locale VARCHAR(10) NOT NULL    -- 'en' | 'de' | 'fr' | 'it' | 'es'
  channel_type TEXT NOT NULL     -- email | slack | webhook | sms | in_app
  subject TEXT                   -- for email only
  body TEXT NOT NULL             -- with {{variable}} placeholders
  is_system BOOLEAN NOT NULL DEFAULT false
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, locale, channel_type, rule_action_id)
```

System defaults are seeded for `en` and `de` at startup.

### users Table Addition

Add `locale VARCHAR(10) NOT NULL DEFAULT 'en'` to the `users` table.
This requires a new Prisma migration.

---

## 15. Product Identity & Cross-System Mapping

### Core Concept

Products exist simultaneously in multiple systems. Stocknify must know which IDs
belong together to correctly assign stock data and make efficient API calls.

### Product Required Fields

- `name` — always required (visibility in dashboard)
- `sku` — always required (primary identifier)
- `barcode` (EAN) — required for physically storable products; bundles exempt

### Automatic Matching Strategy

```
For each product in a connected system:
  1. Check external_references for known external_id → matched
  2. Search for barcode (EAN) match in product_variants → match + store reference
  3. Search for SKU match in product_variants → match + store reference
  4. No match → status: 'unmatched', shown in dashboard for manual assignment
```

Barcode is primary, SKU is secondary — EAN is globally unique, SKU can differ between systems.

### Source of Truth (configurable per integration)

- `shop_to_fulfiller` — Products come from Shop/ERP → Stocknify creates → searches fulfiller
- `fulfiller_to_shop` — Products come from Fulfiller → Stocknify creates → searches Shop/ERP

Stored as `sync_direction` on the `integrations` table.

**Not an MVP feature:** Pushing product data to other systems. Architecture prepares for it.

### External References Table (polymorphic)

```sql
external_references
  id UUID PK
  tenant_id UUID FK -> tenants
  integration_id UUID FK -> integrations
  resource_type TEXT NOT NULL   -- 'product_variant' | 'location' | 'storage_location' | 'batch'
  resource_id UUID NOT NULL     -- our internal ID
  external_id TEXT NOT NULL     -- ID in the external system
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, integration_id, resource_type, resource_id)
  INDEX(tenant_id, integration_id, resource_type, external_id)  -- reverse lookup
```

Two indexes: forward (our ID → external ID) and reverse (external ID → our ID).
Applies to ALL resource types — not just products, but also locations, storage locations, batches.

### Integration Attribute Definitions + Values (scoped attributes)

User-visible additional information per integration + resource type.
Defined when setting up an integration. Separate from external_references.

```sql
integration_attribute_definitions
  id UUID PK
  tenant_id UUID FK -> tenants
  integration_id UUID FK -> integrations
  resource_type TEXT NOT NULL       -- 'product_variant' | 'location' | ...
  key TEXT NOT NULL                 -- e.g. 'temperature_class'
  label TEXT NOT NULL               -- display name
  data_type TEXT NOT NULL           -- 'text' | 'number' | 'boolean' | 'select'
  options JSONB                     -- for select type
  is_required BOOLEAN DEFAULT false
  validation_regex TEXT
  sort_order INT DEFAULT 0
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, integration_id, resource_type, key)

integration_attribute_values
  id UUID PK
  tenant_id UUID FK -> tenants
  definition_id UUID FK -> integration_attribute_definitions
  resource_type TEXT NOT NULL
  resource_id UUID NOT NULL
  value TEXT                        -- always stored as text, type comes from definition
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  UNIQUE(tenant_id, definition_id, resource_type, resource_id)
```

**Future (Enterprise plan):** Merchants can define their own attributes.

---

## 16. CSV Integration (First Integration / Prototype)

The first integration is CSV import/export — no API-specific connector, no
fulfiller or shop-specific logic. This is the foundation for the prototype.

**In scope for prototype:**
- CSV Import (upload file → map columns → create/update products and stock levels)
- CSV Export (download current stock as CSV)
- Column Mapping UI (merchant maps CSV columns to Stocknify fields)

**Column Mapping Feature:** Designed in a separate feature discussion.

**Not in scope for CSV integration:**
- Webhooks / real-time sync
- Automatic re-sync
- Product push back to other systems

---

## 17. CSV Integration & Mapping

### CSV als erste Integration (Prototyp)

Die CSV-Integration ist die erste und einfachste Integration — kein API-spezifischer
Connector, kein Fulfiller-Login. Sie dient als Grundlage für den Prototypen und
ermöglicht Merchants ohne API-Zugang sofort zu starten.

**In Scope für MVP:**
- CSV Import: Datei hochladen → Header erkennen → Spalten mappen → Daten importieren
- CSV Export: Bestandsdaten als CSV herunterladen oder via FTP/SFTP ablegen
- Mapping Templates: Wiederverwendbare Spalten-Mappings (Import + Export getrennt)
- Scheduled Jobs: Geplante Importe/Exporte zu konfigurierbaren Zeiten
- FTP/SFTP Ablage: Automatisierter Export in konfigurierte Ordner

**Nicht in Scope für MVP:**
- Produkt-Push zu anderen Systemen
- Automatischer Re-Import ohne Schedule
- Echtzeit-Sync via Webhook

### CSV Mapping Templates

Ein Mapping Template definiert die Übersetzung zwischen CSV-Spalten und
Stocknify-Feldern. Templates sind wiederverwendbar und integrationsunabhängig.

```sql
csv_mapping_templates
  id UUID PK
  tenant_id UUID FK -> tenants
  name TEXT NOT NULL                    -- z.B. "Xentral Bestandsexport"
  direction TEXT NOT NULL               -- 'import' | 'export'
  resource_type TEXT NOT NULL           -- 'products' | 'stock' | 'locations'
  delimiter TEXT NOT NULL DEFAULT ','   -- ',' | ';' | '\t'
  encoding TEXT NOT NULL DEFAULT 'utf-8'
  has_header_row BOOLEAN DEFAULT true
  column_mappings JSONB NOT NULL        -- [{csvColumn: "Artikel-Nr", field: "sku", required: true}]
  default_values JSONB DEFAULT '{}'     -- Standardwerte für nicht gemappte Pflichtfelder
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ
```

**column_mappings Format:**
```json
[
  { "csvColumn": "Artikel-Nr", "field": "sku", "required": true },
  { "csvColumn": "EAN", "field": "barcode", "required": false },
  { "csvColumn": "Bestand", "field": "quantity", "required": true },
  { "csvColumn": "Lager", "field": "locationName", "required": true }
]
```

**UI: Mapping-Editor**
- Drag-and-Drop oder Dropdown-Auswahl
- CSV-Header werden automatisch erkannt nach Datei-Upload
- Pflichtfelder werden farblich hervorgehoben
- Vorschau der ersten 5 Zeilen mit aktuellem Mapping
- Validierungsfeedback in Echtzeit

### Integration Credentials (polymorph)

Eine zentrale Tabelle für alle Credential-Typen aller Integrationen.
Ersetzt das verschlüsselte JSONB-Feld auf der `integrations`-Tabelle.
Ermittelt mehrere Credentials pro Integration (z.B. API-Key + SFTP für Xentral).

```sql
integration_credentials
  id UUID PK
  tenant_id UUID FK -> tenants
  integration_id UUID FK -> integrations
  credential_type TEXT NOT NULL         -- 'api_key' | 'sftp' | 'ftp' | 'oauth' | 'webhook' | 'basic_auth'
  name TEXT NOT NULL                    -- z.B. "Hive Production API", "Xentral SFTP"
  -- Credential-Felder (alle verschlüsselt at rest, AES-256-GCM)
  host TEXT                             -- SFTP/FTP Host
  port INT                              -- SFTP/FTP Port (Default: 22 für SFTP, 21 für FTP)
  username TEXT
  password TEXT
  token TEXT                            -- API Token / Bearer Token
  secret TEXT                           -- Webhook Secret / API Secret
  remote_path TEXT                      -- SFTP/FTP Verzeichnispfad
  additional_attributes JSONB DEFAULT '{}'  -- Sonstige systemspezifische Felder
  is_active BOOLEAN DEFAULT true
  last_verified_at TIMESTAMPTZ          -- Wann wurde die Verbindung zuletzt geprüft
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ
```

**Credential-Typen:**
| Typ | Verwendete Felder | Beispiel |
|-----|-------------------|---------|
| `api_key` | token | Shopify, Hive |
| `sftp` | host, port, username, password/token, remote_path | CSV-Ablage, Xentral |
| `ftp` | host, port, username, password, remote_path | Legacy-Systeme |
| `oauth` | token, secret, additional_attributes | Zukünftig |
| `webhook` | secret | Eingehende Webhooks |
| `basic_auth` | username, password | WooCommerce, REST APIs |

**Sicherheit:** Alle Felder werden vor dem Speichern AES-256-GCM verschlüsselt.
Kein Feld wird jemals im Klartext geloggt oder in API-Responses zurückgegeben.

### Integration Schedules

Gilt für **alle** Integrationen, nicht nur CSV. Jeder Schedule steuert wann
ein Import oder Export für eine bestimmte Ressource läuft.

```sql
integration_schedules
  id UUID PK
  tenant_id UUID FK -> tenants
  integration_id UUID FK -> integrations
  name TEXT NOT NULL                    -- z.B. "Täglicher Bestandsimport 06:00"
  resource_type TEXT NOT NULL           -- 'products' | 'stock' | 'locations' | 'storage_locations'
  direction TEXT NOT NULL               -- 'import' | 'export'
  is_active BOOLEAN DEFAULT true
  -- Schedule-Konfiguration (User-freundliche Werte)
  schedule_type TEXT NOT NULL           -- 'interval_minutes' | 'interval_hours' | 'daily' | 'weekly'
  interval_value INT                    -- für interval_minutes/hours: z.B. 15 oder 4
  time_of_day TIME                      -- für daily/weekly: z.B. 06:30
  weekdays INT[]                        -- für weekly: [1,3,5] = Mo,Mi,Fr (ISO: 1=Mo, 7=So)
  -- Intern gespeicherter Cron-Ausdruck (generiert aus obigen Werten)
  cron_expression TEXT NOT NULL         -- z.B. '30 6 * * 1,3,5'
  -- Optional: Mapping Template (für CSV-Integration)
  csv_mapping_template_id UUID FK -> csv_mapping_templates (nullable)
  -- Optional: Credentials (welche Credentials für diesen Schedule)
  credential_id UUID FK -> integration_credentials (nullable)
  -- Ausführungshistorie
  last_run_at TIMESTAMPTZ
  last_run_status TEXT                  -- 'success' | 'partial' | 'failed'
  last_run_error TEXT
  next_run_at TIMESTAMPTZ               -- berechnet aus cron_expression
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ
```

**Schedule UI → Cron-Übersetzung:**

| User-Auswahl | Beispielwert | Cron intern |
|--------------|-------------|-------------|
| Alle X Minuten | Alle 15 Min | `*/15 * * * *` |
| Alle X Stunden | Alle 4 Std | `0 */4 * * *` |
| Täglich um Uhrzeit | 06:30 Uhr | `30 6 * * *` |
| Wochentage + Uhrzeit | Mo,Mi,Fr 08:00 | `0 8 * * 1,3,5` |
| Jeden zweiten Tag | 00:00 Uhr | `0 0 */2 * *` |

**Wichtig:** Der User sieht nie einen Cron-Ausdruck. Die UI-Werte
(`schedule_type`, `interval_value`, `time_of_day`, `weekdays`) werden
gespeichert damit die UI beim Bearbeiten korrekt wiederhergestellt werden kann.

**Plan-Limits für Schedules:**

| Plan | Min. Intervall |
|------|----------------|
| Trial | 60 Minuten |
| Starter | 30 Minuten |
| Growth | 5 Minuten |
| Enterprise | 1 Minute |

### API Endpoints (geplant)

```
# CSV Mapping Templates
GET    /csv-mappings                    Liste aller Templates des Tenants
POST   /csv-mappings                    Neues Template anlegen
GET    /csv-mappings/:id                Template Detail
PATCH  /csv-mappings/:id                Template bearbeiten
DELETE /csv-mappings/:id                Template löschen

# CSV Import/Export
POST   /integrations/:id/csv/import     CSV-Datei importieren (multipart/form-data)
                                         Body: { file, mappingTemplateId }
POST   /integrations/:id/csv/export     CSV-Export ausführen und herunterladen
                                         oder in konfigurierte SFTP-Ablage schreiben

# Integration Credentials
GET    /integrations/:id/credentials    Alle Credentials einer Integration
POST   /integrations/:id/credentials    Neue Credentials anlegen
PATCH  /integrations/:id/credentials/:cid  Credentials bearbeiten
DELETE /integrations/:id/credentials/:cid  Credentials löschen
POST   /integrations/:id/credentials/:cid/verify  Verbindung testen

# Schedules
GET    /integrations/:id/schedules      Alle Schedules einer Integration
POST   /integrations/:id/schedules      Neuen Schedule anlegen
PATCH  /integrations/:id/schedules/:sid Schedule bearbeiten / pausieren
DELETE /integrations/:id/schedules/:sid Schedule löschen
POST   /integrations/:id/schedules/:sid/run  Schedule manuell ausführen
```

---

## 18. Testing Strategy

### Prinzip: Test nach Feature, vor Live-Testing

Tests werden nach jeder Feature-Phase geschrieben, bevor echtes Live-Testing oder
Datenbank-Befüllung beginnt. Das ist besonders wichtig da der Code vollständig
von AI Coding Agents generiert wird — kein manueller Code-Review ersetzt Tests.

### Test-Pyramide

```
         [E2E / Playwright]
        Kritische User Journeys
       ─────────────────────────
      [Integration Tests / Vitest]
     API Routes, Webhook Handler
    ───────────────────────────────
   [Unit Tests / Vitest]
  Rule Engine, Connectors, Schemas
```

### Backend: Unit Tests (Vitest)

**Was wird unit-getestet:**
- Rule Engine: alle Condition Types, Operatoren, Edge Cases (NULL expiry, zero stock)
- Notification Template Engine: `{{variable}}`-Substitution, fehlende Variablen
- Integration Connectors: `parseWebhook()`, `fetchStockLevels()` mit Mock-Responses
- External Reference Matching: Barcode-Match, SKU-Match, kein Match
- CSV Mapper: Spalten-Mapping, fehlende Pflichtfelder, ungültige Werte
- Shared Zod Schemas: valide und invalide Inputs

**Coverage-Ziele:**
| Modul | Mindestziel |
|-------|-------------|
| Rule Engine | 90% |
| Notification Templates | 85% |
| Integration Connectors | 80% |
| External Reference Matching | 85% |
| Shared Schemas | 95% |

### Backend: Integration Tests (Vitest + Fastify inject)

**Ansatz:** Fastify `app.inject()` für HTTP-Tests ohne echten Server.
Datenbank wird mit `prisma.$transaction` + Rollback gemockt oder via
In-Memory-Prisma-Mock (kein echtes Supabase in CI).

**Was wird getestet:**
- Alle API-Endpunkte: Happy Path + Fehlerszenarien
- Tenant-Isolation: Stellt sicher dass Tenant A nie Daten von Tenant B sieht
- Authentifizierung: Abgelehnte Requests ohne / mit ungültigem JWT
- Role Authorization: Nicht-Admins können keine Admin-Endpoints aufrufen
- Rate Limiting: Überschreitung des Limits löst 429 aus
- Webhook Signature Verification: Ungültige Signaturen werden abgelehnt

**Coverage-Ziel: 80% aller Route Handler**

### Frontend: Component Tests (Vitest + React Testing Library)

**Was wird getestet:**
- Kritische UI-Komponenten: DataTable, StockAdjustModal, RuleBuilder
- Form-Validierung: Zod-Schema + React Hook Form Verhalten
- TanStack Query Hooks: Mock-API-Responses, Loading/Error-States
- Auth Flow: Login, Register, Redirect-Logik

**Coverage-Ziel: 70% der Komponenten in `components/`**

### E2E Tests: Playwright

**Kritische User Journeys (must-have):**
1. Registrierung → Email-Bestätigung → Onboarding → Dashboard
2. Produkt anlegen → CSV Import → Stock sichtbar im Dashboard
3. Regel anlegen → Stock-Level unterschreiten → Alert ausgelöst → Email erhalten
4. Integration verbinden → Auto-Matching → Produkt verknüpft
5. User einladen → Role ändern → Berechtigungen greifen

**Umgebung:** Staging-Environment (`staging.stocknify.app`)
**Wann:** Nach Deploy auf Staging, vor Deploy auf Production

### CI/CD Integration

Die Tests sind **bereits in der CI-Pipeline verankert** (`ci.yml` hat einen `Test`-Step).
Aktuell läuft `vitest run --passWithNoTests` — schlägt nicht fehl wenn keine Tests
existieren. Sobald echte Tests vorhanden sind, wird `--passWithNoTests` entfernt.

**Geplante CI-Erweiterungen wenn Tests vorhanden:**
```yaml
- name: Test with coverage
  run: pnpm turbo test -- --coverage

- name: Upload coverage report
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info

- name: E2E Tests (Staging)
  run: pnpm playwright test
  env:
    BASE_URL: https://staging.stocknify.app
```

**Merge-Blockierung:** CI blockiert Merges auf `main` wenn Tests fehlschlagen.
Das gilt ab dem Zeitpunkt wo erste echte Tests existieren.

### Test-Reihenfolge pro Feature-Phase

```
Feature entwickeln (Claude Code)
    ↓
Codex Adversarial Review
    ↓
Fixes implementieren
    ↓
Tests schreiben (eigener Claude Code Prompt pro Phase)
    ↓
CI grün
    ↓
Manuelle Verifikation / Live-Test
    ↓
Deploy Production
```

---

## 19. Partner & Reseller Program

### Concept

Any person or company can become a partner — fulfillers, ERP providers, agencies,
freelancers, or even merchants themselves (e.g. a merchant with subsidiaries).
Partners bring tenants to Stocknify and receive either a commission or act as
reseller who collects payment from their customers themselves.

### Two Billing Modes (can coexist per partner)

| Mode | Who pays Stocknify | Partner role |
|------|-------------------|-------------|
| `partner_pays` | Partner pays Stocknify monthly (aggregated) | Reseller: bills their customers independently |
| `direct_pays` | Merchant pays Stocknify directly | Affiliate: receives commission/provision from Stocknify |

A single partner can have both types of customers simultaneously — no restriction.

### Tenant Plan for Partner Customers

- Partner customers always start on the **Growth plan** (or equivalent mid-tier)
- They never get the Trial or Starter plan
- Discount is applied on top of the Growth plan price
- Exact conditions are negotiated bilaterally per partner contract

### Onboarding Directions

**Top-down (Partner invites Tenant):**
1. Partner creates an invite in the Partner Dashboard
2. Invite link is sent to the Merchant
3. Merchant registers via invite link → automatically assigned to Partner
4. Billing mode is set at invite time

**Bottom-up (Merchant self-registers with Referral Code):**
1. Partner has a unique `referral_code`
2. Merchant registers independently and enters the referral code
3. Tenant is automatically assigned to Partner
4. Default billing mode from Partner settings is applied (can be overridden manually)

### Partner Dashboard

- Partner sees all their tenants (both billing modes)
- Columns: Tenant name, plan, billing mode, signup date, monthly revenue
- Cannot access tenant data (stock levels, rules, etc.)
- Can see commission/payout summary for `direct_pays` customers

### Database Schema

```sql
-- Partners (resellers, affiliates, agencies, fulfillers, anyone)
partners
  id UUID PK
  name TEXT NOT NULL
  slug TEXT UNIQUE NOT NULL
  type TEXT NOT NULL DEFAULT 'other'    -- 'fulfiller' | 'erp' | 'agency' | 'freelancer' | 'merchant' | 'other'
  contact_name TEXT
  contact_email TEXT NOT NULL
  status TEXT NOT NULL DEFAULT 'active' -- 'active' | 'suspended' | 'churned'
  referral_code TEXT UNIQUE NOT NULL    -- unique code for bottom-up self-signup
  -- Default billing behavior (can be overridden per tenant)
  default_billing_mode TEXT DEFAULT 'direct_pays'  -- 'partner_pays' | 'direct_pays'
  -- Discount defaults (two separate rates, one per billing mode)
  partner_pays_discount_percent INT DEFAULT 0   -- discount when partner collects payment
  direct_pays_discount_percent INT DEFAULT 0    -- discount/commission when Stocknify collects
  -- Default plan for partner customers
  default_plan TEXT DEFAULT 'growth'    -- partner customers start here, never trial/starter
  -- Stripe entities
  stripe_customer_id TEXT              -- Stripe Customer für gesammelte Abrechnung (partner_pays)
  stripe_coupon_id_partner_pays TEXT   -- Stripe Coupon wenn Partner selbst abrechnet
  stripe_coupon_id_direct_pays TEXT    -- Stripe Coupon wenn Merchant direkt zahlt (Affiliate-Rabatt)
  -- Internal contract notes (never shown to partner)
  contract_notes TEXT
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

-- Users who can access the partner dashboard
partner_users
  id UUID PK
  partner_id UUID FK -> partners
  user_id UUID FK -> users
  role TEXT NOT NULL DEFAULT 'viewer'   -- 'admin' | 'viewer'
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

-- tenants table additions:
--   partner_id UUID FK -> partners (nullable)
--   billing_mode TEXT                  -- 'direct' | 'via_partner' (overrides partner default if needed)
--   discount_percent INT DEFAULT 0     -- individual discount, overrides partner default
--   referral_code TEXT                 -- which referral code was used at self-signup
--   onboarding_source TEXT             -- 'self_signup' | 'partner_invite' | 'referral'
```

### Discount Hierarchy

```
1. tenant.discount_percent           (individual override — highest priority)
2. partner.partner_pays_discount_percent OR partner.direct_pays_discount_percent
   (based on tenant.billing_mode)
3. 0% (no discount)                  (fallback)
```

### API Endpoints (planned)

```
# Partner management (Stocknify internal admin only)
GET    /admin/partners
POST   /admin/partners
PATCH  /admin/partners/:id

# Partner dashboard (authenticated as partner_user)
GET    /partner/tenants             → all tenants for this partner
GET    /partner/tenants/:id         → tenant detail (no stock data)
GET    /partner/payouts             → commission/payout summary
POST   /partner/invites             → create tenant invite link
GET    /partner/invites             → list pending invites

# Self-signup with referral code (extends existing auth webhook)
# POST /auth/webhook already handles this via user_metadata.referral_code
```

### Future: Provisioning System

- Automated monthly commission calculation for `direct_pays` partners
- Stripe payouts to partner bank accounts
- Commission tiers based on tenant count or revenue
- Not in MVP — first version: manual calculation + bank transfer

---

## 20. Vibe Coding Ablauf

### Prinzip

Jeder Entwicklungsschritt folgt einem festen Ablauf mit vollständiger
Dokumentation in Notion und im Repository. Kein Schritt wird übersprungen.

### Dateien und Ordnerstruktur

```
prompts/
  TEMPLATE_RESULT.md          — Vorlage für Result-Files
  TEMPLATE_CODEX_REVIEW.md    — Vorlage für Codex-Review-Prompts
  TEMPLATE_REVIEW_RESULT.md   — Vorlage für Review-Result-Files
  PROMPT_[NAME].md             — Prompt-Dateien (gitignored)
  results/
    RESULT_[NAME].md           — Ergebnisse nach Prompt-Ausführung (gitignored)
    REVIEW_[NAME].md           — Ergebnisse nach Codex-Review (gitignored)
```

### Vollständiger Ablauf pro Feature-Phase

```
Schritt 1: Prompt vorbereiten
  ─ Claude (Chat) erstellt PROMPT_[NAME].md
  ─ Notion: Task-Status → "📋 Geplant"

Schritt 2: Claude Code führt Prompt aus
  ─ Eingabe: "Read PROJECT.md and prompts/PROMPT_[NAME].md, then execute."
  ─ Am Ende schreibt Claude Code: prompts/results/RESULT_[NAME].md
    (nach TEMPLATE_RESULT.md)

Schritt 3: Claude Code committed
  ─ Claude Code committed alle Änderungen mit aussagekräftigem Commit-Message
  ─ NICHT pushen bis Review durch

Schritt 4: Codex Review vorbereiten
  ─ Claude (Chat) liest RESULT_[NAME].md
  ─ Extrahiert den Review-Fokus als Focus-Text (3-5 konkrete Punkte)

Schritt 5: Codex Review ausführen
  ─ Eingabe in Claude Code:
    /codex:adversarial-review --base HEAD~1 [Focus-Text aus Result-File]
  ─ Beispiel:
    /codex:adversarial-review --base HEAD~1 challenge the RLS policies for nullable tenantId,
    polymorphic relation integrity, and the admin context access pattern for partners
  ─ Am Ende schreibt Codex: prompts/results/REVIEW_[NAME].md
    (nach TEMPLATE_REVIEW_RESULT.md)
  ─ Hinweis: /codex:adversarial-review reviewt den letzten Commit (HEAD~1 = Diff)
    und ist steuerbar durch Focus-Text hinter den Flags

Schritt 6: Fixes implementieren (falls nötig)
  ─ Claude (Chat) liest REVIEW_[NAME].md
  ─ Erstellt PROMPT_[NAME]_FIXES.md
  ─ Claude Code führt Fixes aus und committed
  ─ Schreibt RESULT_[NAME]_FIXES.md

Schritt 7: Push + CI
  ─ Claude Code pusht NICHT automatisch
  ─ Du führst den Push manuell aus: git push
  ─ Erst nach abgeschlossenem Review und deiner Freigabe
  ─ CI läuft durch — muss grün sein

Schritt 8: Product Review (auf Production)
  ─ Du schaust dir das Feature auf app.stocknify.app an
  ─ Feedback kommt zurück zu mir
  ─ Sofort fixen: klare Bugs, falsche Logik, kaputte UX
  ─ Backlog: Erweiterungen, Nice-to-haves, neue Ideen
  ─ Erst nach deinem OK weiter zu Schritt 9

Schritt 9: Notion aktualisieren
  ─ Claude (Chat) liest beide Result-Files
  ─ Trägt Prompt in ⚡ Vibe Coding Prompts Datenbank ein
  ─ Aktualisiert Task-Status im 🗂️ Projektplan
  ─ Verknüpft Tasks mit Prompt-Eintrag
```

### Konventionen für Result-Files

- Immer nach `TEMPLATE_RESULT.md` strukturieren
- "Abweichungen vom Spec" ist Pflicht — "Keine" ist eine valide Antwort
- "Review-Fokus für Codex" muss konkret sein — keine generischen Aussagen
- Task-Namen müssen exakt den Notion-Task-Titeln entsprechen

### Notion Datenbanken

- **⚡ Vibe Coding Prompts** (`67ef51b2`) — ein Eintrag pro Prompt
- **🗂️ Projektplan & Roadmap** (`f48883d0`) — Tasks mit Status und Prompt-Verknüpfung

---

## 22. Job Queue, Incidents, Health & Super-Admin

### 22.1 Job Queue Architecture (BullMQ)

BullMQ ist bereits im Stack. Was hier definiert wird ist die Struktur
für fehlertolerante Jobs mit strukturiertem Error-Handling.

**Prinzipien:**
- Jeder Job-Typ ist eine eigene Klasse mit `execute()` Methode
- Jobs wrappen ihre Arbeit vollständig in try/catch
- Erwartete Fehler (z.B. API nicht erreichbar) → `AppError` mit lesbarer Meldung
- Unerwartete Fehler (Exceptions) → Sentry + generischer Incident
- Retry-Logik: 3 Versuche, exponential backoff (1s → 10s → 100s)
- Nach 3 Fehlschlägen: Job landet in Dead Letter Queue + Incident wird erstellt

**Job-Typen:**

```typescript
// Alle Jobs implementieren dieses Interface
interface BaseJob<T> {
  readonly name: string;
  execute(data: T, job: Job): Promise<void>;
}

// Erwartete Fehler — erzeugen Incidents mit lesbarer Meldung
class AppError extends Error {
  constructor(
    message: string,           // technische Meldung (für Logs)
    readonly userMessage: string, // lesbare Meldung (für Incident)
    readonly severity: 'info' | 'warning' | 'error' | 'critical',
    readonly code: string,      // maschinenlesbar z.B. 'SHOPIFY_API_TIMEOUT'
  ) { super(message); }
}
```

**BullMQ Queue-Konfiguration:**
```typescript
// Globale Retry-Strategie
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 100 },   // letzte 100 erfolgreiche Jobs behalten
  removeOnFail: false,                 // fehlgeschlagene Jobs behalten (für Debugging)
};

// Queues
const QUEUES = {
  SYNC_STOCK:         'sync-stock',
  EVALUATE_RULES:     'evaluate-rules',
  SEND_NOTIFICATION:  'send-notification',
  SCHEDULED_IMPORT:   'scheduled-import',
  SCHEDULED_EXPORT:   'scheduled-export',
};
```

**Job → Incident Flow:**
```
Job schlägt fehl
  → AppError (erwartet): Incident mit userMessage + severity aus Error
  → Exception (unerwartet): Sentry capture + Incident mit generischer Meldung
  → Nach 3 Versuchen: Job in Dead Letter Queue, Incident status = 'open'
  → Zukünftig: Incident kann Notification triggern (via bestehendem Notification System)
```

---

### 22.2 Incidents

Incidents sind strukturierte Fehlermeldungen die aus Jobs oder App-Code entstehen.
Sie sind die einzige Fehlerschnittstelle zwischen dem System und dem Merchant.

**Sichtbarkeit:**
- Merchant sieht nur seine eigenen Incidents
- Nur Incidents mit `is_user_visible = true` werden im Merchant-Dashboard angezeigt
- Super-Admin sieht alle Incidents aller Tenants

```sql
incidents
  id UUID PK
  tenant_id UUID FK -> tenants
  -- Quelle
  source_type TEXT NOT NULL         -- 'job' | 'api' | 'webhook' | 'rule_engine' | 'system'
  source_id TEXT                    -- Job-ID, Route, etc.
  integration_id UUID FK -> integrations (nullable)
  -- Klassifizierung
  severity TEXT NOT NULL DEFAULT 'error'  -- 'info' | 'warning' | 'error' | 'critical'
  code TEXT NOT NULL                -- maschinenlesbar, z.B. 'SHOPIFY_API_TIMEOUT'
  -- Meldungen
  title TEXT NOT NULL               -- kurze lesbare Zusammenfassung
  user_message TEXT                 -- lesbare Beschreibung für den Merchant (nullable)
  technical_message TEXT            -- technische Details (nur für Admin sichtbar)
  is_user_visible BOOLEAN NOT NULL DEFAULT false  -- ob Merchant es sieht
  -- Status
  status TEXT NOT NULL DEFAULT 'open'  -- 'open' | 'acknowledged' | 'resolved'
  acknowledged_by UUID FK -> users (nullable)
  acknowledged_at TIMESTAMPTZ
  resolved_at TIMESTAMPTZ
  -- Kontext
  context JSONB DEFAULT '{}'        -- zusätzliche Daten (job payload, stack trace, etc.)
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
```

**Incident-Typen (Beispiele):**

| Code | Severity | User Message |
|------|----------|--------------|
| `SHOPIFY_API_TIMEOUT` | warning | "Shopify konnte nicht erreicht werden. Wir versuchen es erneut." |
| `CSV_INVALID_COLUMNS` | error | "Die CSV-Datei enthält unbekannte Spalten. Bitte Mapping prüfen." |
| `SYNC_FAILED_PERMANENTLY` | critical | "Synchronisation dauerhaft fehlgeschlagen. Bitte Integration prüfen." |
| `INTEGRATION_AUTH_FAILED` | error | "Zugangsdaten ungültig. Bitte Integration neu verbinden." |
| `UNEXPECTED_ERROR` | error | "Ein unerwarteter Fehler ist aufgetreten. Unser Team wurde informiert." |

**API Endpoints:**
```
GET    /incidents                   Alle Incidents des Tenants (paginiert)
GET    /incidents/:id               Incident Detail
PATCH  /incidents/:id/acknowledge   Incident als bekannt markieren
PATCH  /incidents/:id/resolve       Incident als gelöst markieren

# Admin-only
GET    /admin/incidents             Alle Incidents aller Tenants
GET    /admin/incidents/:id
```

**Zukünftig (Phase 4+):** Incidents können Notifications triggern über das
bestehende Notification-System — z.B. Email wenn ein Incident `critical` ist.

---

### 22.3 Integration Health & Heartbeat

Pro Integration wird nach jedem Sync-Job der Health-Status aktualisiert.
Der Status ist im Dashboard als Indikator sichtbar.

**Health-Status wird auf der `integrations` Tabelle erweitert:**

```sql
-- Neue Felder auf integrations (via Migration):
  health_status TEXT NOT NULL DEFAULT 'unknown'
    -- 'healthy' | 'degraded' | 'failing' | 'paused' | 'unknown'
  last_successful_sync_at TIMESTAMPTZ
  last_error_at TIMESTAMPTZ
  consecutive_failures INT NOT NULL DEFAULT 0
```

**Health-Status-Logik:**

```
nach jedem Sync-Job:
  Erfolg:
    → consecutive_failures = 0
    → last_successful_sync_at = now()
    → health_status = 'healthy'
  Fehler:
    → consecutive_failures += 1
    → last_error_at = now()
    → 1-2 Fehler: health_status = 'degraded'
    → 3+ Fehler: health_status = 'failing'
    → Incident erstellen (falls noch kein offener Incident für diese Integration)
```

**API Endpoint:**
```
GET /integrations/:id/health    Aktueller Health-Status + letzte Sync-Historie
```

---

### 22.4 Super-Admin

**Zugang:** `app.stocknify.app/admin` — nur für User mit `is_super_admin = true`

**Schema-Erweiterung auf `users`:**
```sql
-- Neues Feld auf users:
  is_super_admin BOOLEAN NOT NULL DEFAULT false
```

Nur direkt in der Datenbank setzbar — kein API-Endpoint zum Self-Promote.

**Impersonation (Tenant-Wechsel):**
- Mechanismus: `X-Impersonate-Tenant-ID` HTTP-Header
- Nur Super-Admins können diesen Header nutzen
- Middleware prüft: `if (header present && !isSuperAdmin) → 403`
- Wenn Header gesetzt: Tenant-Kontext wird auf den angegebenen Tenant gesetzt
- Komplett transparent — kein Audit Log, kein Hinweis für den Tenant
- Super-Admin bleibt mit seinem eigenen JWT eingeloggt

```typescript
// Middleware pseudocode
async function superAdminMiddleware(request, reply) {
  const impersonateTenantId = request.headers['x-impersonate-tenant-id'];
  if (impersonateTenantId) {
    if (!request.user.isSuperAdmin) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
    }
    // Override tenant context for this request
    request.tenantId = impersonateTenantId;
    await db.$executeRaw`SELECT set_config('app.current_tenant_id', ${impersonateTenantId}, true)`;
  }
}
```

**Admin-Dashboard (`/admin`):**

| Bereich | Inhalt |
|---------|--------|
| Tenants | Alle Tenants, Plan, Status, Erstelldatum, Suche |
| Partner | Alle Partner, Kunden-Anzahl, Billing-Mode |
| Incidents | Alle offenen Incidents, Filter nach Severity/Tenant |
| Impersonation | Tenant auswählen → als dieser Tenant agieren |

**API Endpoints (Super-Admin only):**
```
GET    /admin/tenants              Alle Tenants
GET    /admin/tenants/:id          Tenant Detail
PATCH  /admin/tenants/:id          Tenant bearbeiten (Plan, Status)
GET    /admin/partners             Alle Partner
POST   /admin/partners             Partner anlegen
PATCH  /admin/partners/:id         Partner bearbeiten
GET    /admin/incidents            Alle Incidents
PATCH  /admin/incidents/:id        Incident verwalten
```

---

## 23. Known Constraints & Open Decisions

### Open
- [ ] PROJECT.md in modulare Docs-Files aufteilen wenn ~100 KB erreicht (aktuell 56 KB)
      Geplante Struktur: docs/PROJECT.md (Index) + SCHEMA.md + INTEGRATIONS.md + RULES.md + TESTING.md + VIBE_CODING.md
- [ ] Magento connector priority?
- [ ] Stock history aggregation strategy for older data?
- [ ] Public API + API keys for enterprise customers (Phase 2)
- [ ] Add `deletedAt TIMESTAMPTZ` to `users` table (currently hard-deleted)
- [ ] Add `deletedAt TIMESTAMPTZ` to `stock_type_definitions` table (currently hard-deleted)
- [ ] GET /stock: replace in-memory grouping with DB-level pagination at scale (current cap: 10k rows, TODO comment in code)
- [x] Configure Supabase webhook: Database → Webhooks → auth-user-created → POST /auth/webhook ✅
- [ ] Auth-Middleware: Fallback auf user_metadata ist theoretisch spoofbar — App-Middleware sollte nur app_metadata akzeptieren und Requests ohne authoritative Claims ablehnen. Akzeptabel für MVP weil Auth-Webhook app_metadata immer setzt und PATCH /users nur harmlose Felder (fullName, locale) updaten kann.
- [ ] unique-notification-templates.sql: wrap in BEGIN/COMMIT für vollständige Atomizität (aktuell 4 unabhängige DDL-Statements)
- [ ] unique-notification-templates.sql: CREATE UNIQUE INDEX IF NOT EXISTS prüft nur Name, nicht Definition — akzeptabel für MVP single-operator deploy
- [ ] pg_get_constraintdef string comparison im DO block fragil bei Postgres-Version-Skew — akzeptabel, da Supabase-Version stabil
- [ ] IntegrationAttributeValue ON DELETE RESTRICT: App-Layer muss Values vor Definition löschen — kein Code nötig bis Phase 3A Attribut-APIs existieren

### Intentional MVP Constraints
- EUR only (no multi-currency)
- No forecasting / predictive analytics (Phase 3)
- No mobile app (responsive web is sufficient for MVP)
- No offline mode
- Max sync frequency: 5 min (Growth), 1 min (Enterprise)

---

*Last updated: 2026-04-17*
*Version: 0.5.0 — Schema v3 (Partner, Credentials, Schedules, i18n, External References) + Schema v4 (Incidents, Integration Health, Super-Admin) + CI/CD vollautomatisiert + Job Queue, Incidents, Health & Super-Admin Architektur dokumentiert*
