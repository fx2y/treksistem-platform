# CLAUDE.md

# 1. Architecture
## 1.1 Monorepo (PNPM workspaces)
- apps/api: Cloudflare Worker (Hono.js v4+)  
- apps/web: Next.js 15.3 + App Router + Turbopack
- packages/db: Drizzle ORM v0.44.2 + D1
- packages/types: Shared TypeScript interfaces
- packages/utils: Branded types + utilities
- packages/ui: shadcn/ui components
- packages/eslint-config-custom: ESLint v9 flat config
- packages/tsconfig: Shared TS configs

## 1.2 Tooling Constraints
- All packages: `"type": "module"` (REQUIRED)
- ESLint imports: `.js` extensions (`@treksistem/eslint-config-custom/next.js`)
- Scripts: `lint`, `lint:fix`, `format` in all workspaces
- Husky v9 + lint-staged v15 pre-commit hooks
- Next.js ESLint: Remove `@next/next/no-duplicate-head` (v9 incompatible)

# 2. Type System
## 2.1 Branded Types (CRITICAL)
- **Single Source**: @treksistem/utils owns ALL branded types
- **Re-exports**: Other packages re-export from utils
- **Format**: `{prefix}_{21-char-nanoid}` (nanoid v5.x)
- **Types**: UserId, PartnerId, VehicleTypeId, PayloadTypeId, FacilityId
- **Build Order**: utils→types→db→api
- **Dependencies**: API+DB packages MUST depend on @treksistem/types

## 2.2 Patterns
- Symbol branding prevents conflicts
- Runtime regex + compile-time validation
- String parsing: `indexOf()/slice()` NOT `split()` 
- Array allocation: `new Array<T>(count)`

# 3. Database
## 3.1 Setup
- Drizzle ORM + Kit (exact versions critical)
- Factory: `createDb(d1: D1Database)`
- Commands: `pnpm exec drizzle-kit generate/push`
- Hoisting: `pnpm add -w drizzle-orm` (peer dependency)

## 3.2 Schema Patterns
### User/Role Model
- Tables: users + user_roles (RBAC)
- Roles: MASTER_ADMIN|PARTNER_ADMIN|DRIVER
- Constraints: Composite unique (userId,role,contextId)

### Master Data Schema
- Tables: masterVehicleTypes, masterPayloadTypes, masterFacilities
- Partner Scoping: `partnerId` nullable (null=global)
- **Universal Query**: `WHERE (partnerId IS NULL OR partnerId = ?)`
- JSON storage: capabilities/requirements arrays
- Audit: createdBy,updatedBy,timestamps (user publicId refs)
- Indexes: partnerId,isActive,displayOrder,name

### Security Tables
- session_revocations: JTI blacklist
- audit_logs: Security events + context

# 4. Security
## 4.1 Auth Stack
- Google OAuth 2.0 + JWT (hono/jwt, 4hr expiry)
- HttpOnly cookies + auto-refresh (5min check, <30min refresh)
- JWT Service: `sign()→{token,expiresAt,jti}`, `verify()→UserSession`, `revoke(jti)`

## 4.2 RBAC (CRITICAL)
- **Middleware Order**: Security→JWT→RBAC→Business (NEVER change)
- Factories: `createJWTMiddleware()`, `requireRole()`, `createMasterDataMiddlewareStack()`
- Master Admin: Bypasses ALL partner restrictions
- Error Format: `{error:"code", details:"message"}` ALL endpoints

## 4.3 Rate Limiting
- Multi-tier: IP(100/min), Auth(10/min), Email(5failures/hour)
- In-memory (migrate to KV)
- Headers: CSP,HSTS + CSRF tokens
- Fingerprinting: Canvas+WebGL+Audio→64char hash

# 5. API
## 5.1 Framework
- Hono.js v4+ Module Worker (`export default app`)
- Base: ALL routes `/api/v1` prefix
- Config: wrangler.toml compatibility_date >=2024-12-01
- ESLint: Lint only `src/`, ignore `.wrangler/`

## 5.2 Service Patterns
- Factory: `create*Service(deps)` dependency injection
- Errors: Custom classes → HTTP exceptions
- Transform: Separate DB→API functions
- Monitoring: All services integrate monitoring

## 5.3 Master Data API
- Routes: `/api/v1/master-data/{type}` full CRUD
- Combined: `GET /api/v1/master-data` all types
- Service: `createMasterDataService(d1,monitoring)`
- CRUD: get→getById→create→update→delete
- **Pattern Replication**: Copy vehicle types exactly
- Transform: `transformDb*` functions
- Audit: `recordAuditEvent(op,user,table,id,partner,changes)`
- Partner Logic: Extract from user roles, validate ownership

# 6. Frontend
## 6.1 Next.js
- v15.3 + App Router + Turbopack (NOT `experimental.turbo`)
- Env: `NEXT_PUBLIC_API_URL`, `NEXT_EXPERIMENTAL_TURBOPACK=true`
- UI: Tailwind + shadcn/ui (components.json configured)
- Auth Context: login/logout/refresh + auto-headers

## 6.2 Security
- Device fingerprinting + XOR storage (upgrade to crypto)
- CSRF management + HttpOnly cookies

# 7. Testing
## 7.1 Framework
- Vitest v3.2.4 + better-sqlite3 in-memory
- Commands: `pnpm test:oauth`, `pnpm test:coverage`
- 50/50 OAuth + 19/19 master data validation tests
- DB: Complete schema recreation in `test/database/test-db-setup.ts`

## 7.2 Patterns
- IP variation (avoid rate limits)
- `setTimeout(1ms)` timestamp uniqueness
- Mock isolation between tests
- Type-first: Test interfaces before runtime
- Incremental: Types→Schema→Services→Routes→Integration
- Schema alignment: Test DB = production exactly

# 8. Development
## 8.1 Package Placement
1. Types → packages/types
2. Schema → packages/db  
3. UI → packages/ui
4. API → apps/api
5. Frontend → apps/web

## 8.2 Dependencies
- Workspace: Always verify cross-package imports
- Build Order: utils→types→db→api
- Resolution: `workspace:*` monorepo packages

## 8.3 CI/CD
- PR validation + main deploy
- Caching: `~/.pnpm-store` + `.next/cache`
- TS Project Refs: `composite:true` + `noEmit:false`
- Scripts: All packages need lint/test/build

# 9. Critical Constraints
## 9.1 Universal Patterns
- **Security Order**: Security→JWT→RBAC→Business (NEVER change)
- **Error Format**: `{error:"code", details:"message"}` ALL endpoints
- **Partner Query**: `WHERE (partnerId IS NULL OR partnerId = ?)` ALL master data
- **Audit**: ALL CRUD operations log events
- **Replication**: Copy existing patterns exactly

## 9.2 Architecture Rules
- Branded types: @treksistem/utils single source
- Middleware: Factory pattern for reusable stacks
- Services: Explicit dependency injection
- Master Admin: Check before partner restrictions
- Operations: User+role+audit atomic transactions

## 9.3 Tech Debt
- High: KV rate limiting, crypto library, refresh tokens
- Medium: MFA prep, role management UI
- Immediate: Workspace dependency verification

# 10. Debugging
- TS Errors: Package path conflicts, branded type mismatches
- Build: Verify workspace deps, check build order
- Types: Symbol vs string branding conflicts
- Schema: Test DB must match production exactly