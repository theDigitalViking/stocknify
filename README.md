# Stocknify

Multi-tenant SaaS inventory monitoring for e-commerce merchants.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Fastify 4, TypeScript, Prisma, BullMQ |
| Database | PostgreSQL 16 (Supabase), Row-Level Security |
| Auth | Supabase Auth |
| Queue | Redis (Upstash) + BullMQ |
| Hosting | Vercel (web) · Hetzner via Kamal (API) |

## Local Development

### Prerequisites

- Node.js 20 LTS (`nvm use`)
- pnpm 9 (`corepack enable`)
- Docker Desktop

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill out environment variables
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
# Edit both files with your Supabase/Stripe/etc credentials

# 3. Start infrastructure (Postgres + Redis)
docker compose up -d postgres redis

# 4. Run database migrations
pnpm db:migrate

# 5. Start all services
pnpm dev
```

The web app runs at http://localhost:3000 and the API at http://localhost:3001.

## Monorepo Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm build` | Build all apps |
| `pnpm typecheck` | Type check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run all tests |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Project Structure

See [PROJECT.md](./PROJECT.md) for the full architecture specification.
