# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a PNPM-based monorepo for the Treksistem MVP platform with the following structure:

- **apps/api** - Backend API (Cloudflare Worker)
- **apps/web** - Frontend web application (Next.js)
- **packages/db** - Shared database client, schema, and migrations for D1
- **packages/ui** - Shared UI components
- **packages/types** - Shared TypeScript types
- **packages/eslint-config-custom** - Custom ESLint configuration
- **packages/tsconfig** - Shared TypeScript configurations

## Development Setup

**Prerequisites:**

- Node.js >=18.0.0
- PNPM >=9.0.0

**Package Manager:**

```bash
pnpm install          # Install all dependencies
```

## Key Technical Details

- **Workspace Structure**: Uses PNPM workspaces with packages in `apps/*` and `packages/*`
- **Dependency Management**: Centralized catalog with TypeScript ^5.0.0 and @types/node ^20.0.0
- **Target Platforms**: Cloudflare Workers (API) + Next.js (Web)
- **Database**: Cloudflare D1 (SQLite-compatible)

## Development Status

**Modern Tooling Stack Configured:**

- ESLint v9 flat config + TypeScript-ESLint v8 unified
- Prettier v3 + lint-staged v15 + Husky v9 pre-commit hooks
- All packages have `"type": "module"` (REQUIRED for flat config)
- Shared configs: `@treksistem/tsconfig` (base/nextjs/node), `@treksistem/eslint-config-custom` (base/react/next)

**Critical Constraints:**

- ESLint flat config imports need `.js` extensions (workspace packages: `@treksistem/eslint-config-custom/next.js`)
- Type-aware linting uses `projectService: true` + `tsconfigRootDir: import.meta.dirname`
- All workspaces require scripts: `lint`, `lint:fix`, `format`
- Pre-commit hooks block commits with violations, lint-staged processes only staged files
- Next.js ESLint plugin incompatible with ESLint v9 - remove problematic rules, builds work regardless

## Working with the Monorepo

When adding new functionality:

1. Shared types go in `packages/types`
2. Database schema/migrations go in `packages/db`
3. Reusable UI components go in `packages/ui`
4. API endpoints go in `apps/api`
5. Frontend pages/components go in `apps/web`

Use PNPM workspace commands to work across packages:

```bash
pnpm --filter @treksistem/api [command]    # Run command in API package
pnpm --filter @treksistem/web [command]    # Run command in web package
```

## API Implementation (apps/api)

**Framework**: Hono.js v4+ (lightweight, 402K+ ops/sec, <100KB bundle)
**Pattern**: Module Worker (`export default app` NOT Service Worker)
**Base Path**: ALL routes MUST use `/api/v1` prefix
**Config**: wrangler.toml uses `treksistem-api-mvp`, compatibility_date >=2024-12-01

**ESLint Constraints**: Lint only `src/` to avoid config conflicts, ignore `.wrangler/`, `dist/`
**TypeScript**: Include `@cloudflare/workers-types`, exclude config files from project
**Testing**: `wrangler dev` + curl validation for both 200/404 responses

## Frontend Implementation (apps/web)

**Framework**: Next.js 15.3 + App Router + Turbopack (973ms startup, 0ms compile)
**Config**: Use `turbopack` NOT `experimental.turbo` (deprecated), remove `swcMinify`
**Environment**: `NEXT_PUBLIC_API_URL` for backend connectivity, `NEXT_EXPERIMENTAL_TURBOPACK=true`
**UI Stack**: Tailwind CSS + shadcn/ui (components.json configured, @/\* aliases)
**API Integration**: Client-side fetch to `/api/v1/ping` with loading/error states
**Dependencies**: Explicit `@tailwindcss/typography` install required

## CI/CD Pipeline (.github/workflows/)

**Setup**: PR validation (ci.yml) + main deploy (deploy.yml)
**Caching**: `~/.pnpm-store` + `apps/web/.next/cache` with lockfile+source hash keys
**Commands**: `pnpm lint/test/build` + `pnpm --filter @treksistem/web type-check`

**Critical Fixes Applied:**

- TypeScript project refs: `composite:true` + `noEmit:false` in packages/ui,types/tsconfig.json
- ESLint imports: `.js` extensions required (`@treksistem/eslint-config-custom/base.js`)
- Next.js ESLint: Disable `@next/next/no-duplicate-head` (ESLint v9 incompatible)
- Script standardization: All packages need `lint/test/build` scripts (placeholders OK)
- Next.js deploy: `output:'export'` + `trailingSlash:true` for Cloudflare Pages

**Current Status**: Frontend auto-deploys, API manual. Missing: test framework, branch protection, CF secrets.

## Database Layer (@treksistem/db)

**ORM**: Drizzle ORM v0.44.2 + Kit v0.31.2 (exact versions critical)
**Driver**: sqlite (local) + d1-http (prod), D1Database binding in wrangler.toml
**Interface**: `createDb(d1: D1Database)` factory, schema re-exports, NO direct connections
**Migrations**: ONLY drizzle-kit CLI (never manual wrangler d1 execute)
**Config**: drizzle.config.ts sqlite dialect, empty schema needs `export {}`
**Integration**: Hono `{ Bindings: { DB: D1Database } }`, endpoints `/ping` + `/db-health`

**Critical Constraints:**

- Run drizzle-kit from package dir (NOT workspace filters)
- Both `@treksistem/db` + `drizzle-orm` deps required in consumers
- Migration gen needs CLOUDFLARE_ACCOUNT_ID/D1_DATABASE_ID/D1_TOKEN
- Version compatibility strict but undocumented - test early

## Secure Public Identifiers (@treksistem/utils)

**Architecture**: nanoid v5.x (ESM-only, 124 bytes, 4.7M ops/sec) + branded TypeScript types
**Format**: `{prefix}_{21-char-nanoid}` - URL-safe, non-sequential, cryptographically secure
**Validation**: Runtime regex + compile-time template literals. Prefix: 2-10 lowercase alphanumeric
**Performance**: Module-level pre-computation, pre-compiled regex, Workers singleton pattern
**Integration**: Dual DB schema (internal id + public_id), transform functions for API boundaries

**Critical Patterns:**

- String parsing: Use `indexOf()/slice()` NOT `split()` (handles embedded delimiters)
- Array allocation: `new Array<T>(count)` for TypeScript inference
- No console in libraries: Use silent fallbacks
- Test constraints match code: Validate test data against actual limits
- Monorepo builds: Filter packages with required scripts or add placeholders
