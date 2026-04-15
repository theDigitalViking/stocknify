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

Plan limits enforced server-side via middleware. No client-side-only gating.

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
- Unit tests: rule engine, notification templates, integration parsers
- Integration tests: API endpoints, webhook handlers
- E2E tests: registration, integration setup, alert triggered (Playwright)
- Test framework: Vitest (backend)
- Minimum coverage: 70% for critical services

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

## 14. Known Constraints & Open Decisions

### Open
- [ ] White-label offering for fulfillers?
- [ ] Magento connector priority?
- [ ] Stock history aggregation strategy for older data?
- [ ] Public API + API keys for enterprise customers (Phase 2)

### Intentional MVP Constraints
- EUR only (no multi-currency)
- No forecasting / predictive analytics (Phase 3)
- No mobile app (responsive web is sufficient for MVP)
- No offline mode
- Max sync frequency: 5 min (Growth), 1 min (Enterprise)

---

*Last updated: 2026-04-15*
*Version: 0.3.0 — Finalized architecture decisions: transparent variants, deferred bundle logic, COALESCE unique index, retention policy with user control, DB-level rule check constraints*
