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

- MUST hoist drizzle-orm to workspace root: `pnpm add -w drizzle-orm` (peer dependency resolution)
- Use `pnpm exec drizzle-kit generate` NOT npm scripts (proper resolution)
- Error "Please install latest version" = peer dependency issue, not version mismatch
- Both `@treksistem/db` + `drizzle-orm` deps required in consumers
- Migration gen needs CLOUDFLARE_ACCOUNT_ID/D1_DATABASE_ID/D1_TOKEN

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

## User & Role Model (@treksistem/db schema)

**Tables**: `users` (identity) + `user_roles` (RBAC assignments)
**Public IDs**: `UserId` branded type, database UNIQUE constraint + index
**Roles**: `MASTER_ADMIN|PARTNER_ADMIN|DRIVER` enum, contextId for partner scope
**Relations**: Drizzle full relations API for type-safe joins
**Constraints**: Composite unique (userId,role,contextId), CASCADE delete user_roles

## OAuth Authentication System (@treksistem/db + apps/api + apps/web)

**Architecture**: Production Google OAuth 2.0 + JWT + RBAC + security monitoring
**Database**: Enhanced users (emailVerified, lastActivity), session_revocations (JTI blacklist), audit_logs (security events)
**Security Stack**: IP filter → Security headers → Request validation → Rate limiting (10 auth/min IP, 5 failures/hour email, 100/min global) → CSRF → Monitoring

**Backend (apps/api):**
- JWT Service: hono/jwt (4hr expiry, JTI tracking, revocation), interface: `sign() → {token,expiresAt,jti}`, `verify() → UserSession`, `revoke(jti)`, `isRevoked(jti)`
- Auth Service: Google OAuth2Client verification, atomic user+role+audit creation, rate limit checking
- Security Middleware: Origin validation + CSRF tokens, security headers (CSP,HSTS), multi-tier rate limiting
- Monitoring: In-memory metrics (1000 limit) + database backup, all auth events logged with context

**Frontend (apps/web):**
- Auth Context: login/logout/refresh, HttpOnly cookies (XSS protection), auto-refresh (check 5min, refresh if <30min expiry)
- Security Utils: Device fingerprinting (Canvas+WebGL+Audio→64char hash), secure storage (XOR+integrity), CSRF management
- API Client: Automatic auth headers, standardized error classes (APIError, AuthenticationError, AuthorizationError, RateLimitError)

**Critical Patterns:**
- Security-first: Apply middleware BEFORE business logic, fail secure defaults
- Atomic operations: User creation must be batch (user+role+audit), prevent partial state
- Error consistency: `{error:"code", details:"message"}` format across all endpoints
- Defense in depth: Multiple security layers, not single mechanism reliance
- Audit everything: Log both success/failure events with full context (IP,userAgent,fingerprint)

**Environment Setup:**
- Secrets: JWT_SECRET (32+ chars), GOOGLE_CLIENT_ID, CSRF_SECRET (optional)
- Database: Run drizzle-kit push after schema changes, update wrangler.toml D1 IDs
- Frontend: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID

**Tech Debt Priority:**
- High: Replace XOR encryption with crypto library, add refresh tokens, Redis/KV rate limiting
- Medium: MFA prep, role management UI, advanced fingerprinting
- Low: Additional OAuth providers, enterprise SSO, analytics dashboard

## Testing Framework (Vitest + TypeScript)

**Stack**: Vitest v3.2.4 + better-sqlite3 in-memory + comprehensive Google OAuth mocking
**Commands**: `pnpm test:oauth`, `pnpm test:coverage`, `./scripts/run-oauth-verification.sh`
**Coverage**: 50/50 automated tests passing, production-ready validation
**Database**: Complete schema recreation with `test/database/test-db-setup.ts`

**Critical Test Patterns:**
- IP variation: Different IPs for concurrent/load testing (avoid rate limits)
- Timing delays: `setTimeout(1ms)` for timestamp uniqueness in session tests
- Mock isolation: Reset mocks between tests for clean state
- Batch operations: Test atomic user+role+audit creation
- Security scenarios: Token manipulation, rate limiting, CSRF attacks

**Environment**: NODE_ENV=test, JWT_SECRET/GOOGLE_CLIENT_ID/CSRF_SECRET for testing

## RBAC System Implementation (50/50 tests passing, production-ready)

**Architecture**: JWT+RBAC with branded types (`UserId`,`PartnerId`), middleware factories (`createJWTMiddleware`,`requireRole`,`requireContext`), security stack ordering (Security→JWT→RBAC→Business)

**Database Schema**: Enhanced user_roles with `grantedAt`,`grantedBy` audit fields, session_revocations with JTI blacklist, audit_logs for security events. Schema-test alignment CRITICAL - test DB must exactly match production.

**Security Patterns**: 
- Middleware ordering ENFORCED: Security→JWT→RBAC→Business
- Fail-safe defaults: Token considered revoked on DB error
- Multi-tier rate limiting: IP(100/min), Auth(10/min), Email(5failures/hour)
- Master admin bypass: Global context access always
- Error format: `{error:"code", details:"message"}` ALL endpoints

**Critical Constraints**:
- contextId as string (Partner publicId), not integer
- Atomic operations: User+role+audit creation in transaction
- Schema alignment: Test database MUST match production exactly
- grantedAt,grantedBy required in ALL role operations
- Import type vs runtime: Distinguish clearly (`createDb` runtime, types type-only)

**Test Patterns**: 
- IP variation for concurrent tests (avoid rate limits)
- `setTimeout(1ms)` for timestamp uniqueness
- Mock isolation between tests
- Schema evolution requires test+auth service+migration coordination

**Performance**: JWT verification <10ms, indexed auth queries (email,googleId,jti,publicId), in-memory rate limiting (migrate to KV)

**Tech Debt**: High=KV rate limiting+crypto library+refresh tokens, Medium=MFA prep+role UI
