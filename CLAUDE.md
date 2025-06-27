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
- **Types**: UserId, PartnerId, VehicleTypeId, PayloadTypeId, FacilityId, ServiceId
- **Build Order**: utils→types→db→api
- **Dependencies**: API+DB packages MUST depend on @treksistem/types
- **Casting**: Explicit `as UserId` at service boundaries only

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
### Partners Entity
- Tables: partners (business entity with subscriptions)
- Fields: publicId(PartnerId), ownerUserId, businessType(UMKM|CORPORATION|INDIVIDUAL), subscriptionTier(BASIC|PREMIUM|ENTERPRISE)
- Locations: `text().$type<number>()` (lat/lng as numbers stored as text)
- Audit: createdBy,updatedBy,timestamps + atomic role assignment
- Indexes: email,registrationNumber,subscriptionTier,ownerId

### User/Role Model
- Tables: users + user_roles (RBAC)
- Roles: MASTER_ADMIN|PARTNER_ADMIN|DRIVER
- Constraints: Composite unique (userId,role,contextId)
- Multi-tenant: Partner contextId for scoped permissions

### Master Data Schema
- Tables: masterVehicleTypes, masterPayloadTypes, masterFacilities
- Partner Scoping: `partnerId` nullable (null=global)
- **Universal Query**: `WHERE (partnerId IS NULL OR partnerId = ?)`
- JSON storage: capabilities/requirements arrays
- Audit: createdBy,updatedBy,timestamps (user publicId refs)
- Indexes: partnerId,isActive,displayOrder,name

### Services Schema
- Table: services (partner-scoped ONLY, never global)
- Fields: publicId(ServiceId), partnerId(NOT NULL), name, config(JSON), isActive
- Config: JSON + ServiceConfigSchema validation (businessModel, vehicleTypeIds[], operationalRange)
- Indexes: publicId, partnerId+isActive, name
- Constraints: FK to partners.publicId
- Pattern: Follow master-data exactly (migration + schema.ts + relations)

### Security Tables
- session_revocations: JTI blacklist
- audit_logs: Security events + context

## 3.3 Drizzle Integration
- Import table refs explicitly: `users`, `partners`, `userRoles`
- Query pattern: `eq(users.publicId, value)` NOT `eq(db.users.publicId, value)`
- Relations: Bidirectional for type inference
- Type helpers: `Partner`, `NewPartner` for services
- Atomic transactions: `db.batch()` for multi-table operations

# 4. Security
## 4.1 Auth Stack
- Google OAuth 2.0 + JWT (hono/jwt, 4hr expiry)
- HttpOnly cookies + auto-refresh (5min check, <30min refresh)
- JWT Service: `sign()→{token,expiresAt,jti}`, `verify()→UserSession`, `revoke(jti)`

## 4.2 RBAC (CRITICAL)
- **Middleware Order**: Security→JWT→RBAC→Business (NEVER change)
- Factories: `createJWTMiddleware()`, `requireRole()`, `requirePartnerAccess()`
- Master Admin: Bypasses ALL partner restrictions (check first)
- Partner Admin: Restricted to own partner context
- Error Format: `{error:"code", details:"message"}` ALL endpoints
- Permission validation: Partner ID format before RBAC checks

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
- **Context**: Pass complete UserSession objects, NEVER reconstruct auth
- Errors: Custom classes → HTTP exceptions
- Transform: Separate DB→API functions
- Monitoring: All services integrate monitoring
- Testing: Mock dependencies at injection points

## 5.3 Partner Management API
- Routes: `/api/v1/partners` full CRUD + subscription management
- Service: `createPartnerService(d1,monitoring)`
- Methods: createPartner(userSession,data), updatePartner(userSession,id,data)
- Business validation: Email/registration uniqueness before DB
- Multi-tenant: User can own multiple partners
- Atomic: Partner creation + role assignment in single transaction

## 5.4 Master Data API
- Routes: `/api/v1/master-data/{type}` full CRUD
- Combined: `GET /api/v1/master-data` all types
- Service: `createMasterDataService(d1,monitoring)`
- CRUD: get→getById→create→update→delete
- **Pattern Replication**: Copy vehicle types exactly
- Transform: `transformDb*` functions
- Audit: `recordAuditEvent(op,user,table,id,partner,changes)`
- Partner Logic: Extract from user roles, validate ownership

## 5.5 Service Management API
- Routes: `/api/v1/services/{id}`, `/api/v1/partners/{id}/services` full CRUD
- Service: `createServiceService(d1,monitoring)`
- Schema: services table (partner-scoped, NEVER global)
- Config: JSON column + Zod validation (ServiceConfigSchema)
- Pattern: **EXACT** master-data replication (service.service.ts template)
- Context: Complete UserSession passing (NEVER reconstruct auth)
- Errors: ServiceError hierarchy → HTTP status mapping
- Middleware: createServiceMiddlewareStack() (Security→JWT→RBAC→Business)
- Audit: ALL operations + structured events
- Authorization: Master admin bypass + partner isolation at multiple layers

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
- DB: Complete schema recreation in `test/database/test-db-setup.ts`

## 7.2 Database Testing
- D1Database vs better-sqlite3: Mock D1Database interface
- Atomic transactions: `(testDb as any).batch = async (stmts) => { for(const s of stmts) await s; }`
- Schema alignment: Test DB = production exactly
- User factory: `createTestUser()` returns `{id,publicId,session}` with roles

## 7.3 Service Testing
- Context: Pass UserSession objects, not user IDs
- Mocking: Mock at dependency injection boundaries
- Isolation: Mock monitoring/external services with minimal interface
- RBAC: Test both authorized and unauthorized access patterns

## 7.4 Type System Testing
- Type guards: `error instanceof Error ? error.message : String(error)`
- Hono validators: `c.req.valid('json' as never)` for type inference issues
- JWT types: `sign(payload as any, secret)` for UserSession/JWTPayload mismatch

## 7.5 Patterns
- IP variation (avoid rate limits)
- `setTimeout(1ms)` timestamp uniqueness
- Mock isolation between tests
- Type-first: Test interfaces before runtime
- Incremental: Types→Schema→Services→Routes→Integration
- Factory Functions: createTestUser(), createTestPartner(), createTestMasterData()
- Schema Parity: Test DB = production exactly (migrations + indexes + FKs)
- UserSession Factory: Complete role/context manipulation for service tests

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
- **Service Query**: `WHERE partnerId = ?` ALL services (never global)
- **Service Context**: UserSession objects passed to services, NEVER reconstructed
- **Audit**: ALL CRUD operations log events
- **Replication**: Copy existing patterns exactly (master-data → services)
- **JSON Config**: TEXT column + Zod schema validation at API layer

## 9.2 Architecture Rules
- Branded types: @treksistem/utils single source
- Middleware: Factory pattern for reusable stacks (createServiceMiddlewareStack)
- Services: Explicit dependency injection with complete context
- Master Admin: Check before partner restrictions (all authorization middleware)
- Operations: User+role+audit atomic transactions (db.batch)
- Testing: Mock at injection points, not internal calls
- Pattern Template: Use master-data.service.ts as exact template
- Error Hierarchy: Custom classes → HTTP status (ServiceError → 4xx/5xx)
- Authorization: Multi-layer (middleware format + service ownership + DB constraints)

## 9.3 Tech Debt
- High: KV rate limiting, crypto library, refresh tokens
- Medium: MFA prep, role management UI
- Immediate: Workspace dependency verification

# 10. Debugging
## 10.1 Common Issues
- TS Errors: Package path conflicts, branded type mismatches
- Build: Verify workspace deps, check build order
- Types: Symbol vs string branding conflicts
- Schema: Test DB must match production exactly
- "this.client.prepare not function": D1Database interface mismatch
- "SQLite3 can only bind...": Branded type casting needed
- "never type": Hono zValidator inference failure

## 10.2 Debugging Process
- Fix architecture issues first (service dependency injection)
- Resolve TypeScript compilation errors (branded types, Hono types)
- Fix database integration (D1Database mocking, atomic transactions)
- Update test infrastructure (UserSession parameters, service mocking)
- Validate functionality (RBAC enforcement, business rules)
- Incremental: One error category at a time

## 10.3 Service Architecture Anti-Patterns
- **NEVER**: Reconstruct UserSession from userId in services
- **ALWAYS**: Pass complete UserSession from route handlers
- **TESTING**: Mock at dependency boundaries, not method calls
- **CONTEXT**: Services own business logic, routes own auth context
- **NEVER**: Define branded types outside @treksistem/utils
- **NEVER**: Partner-scoped services as global (unlike master data)
- **NEVER**: JSON config without Zod validation
- **NEVER**: Skip middleware ordering (Security→JWT→RBAC→Business)
- **NEVER**: Single-layer authorization (always multi-layer defense)
- **ALWAYS**: Follow utils→types→db→api dependency chain
- **ALWAYS**: Use master-data patterns as template for new entities
- **ALWAYS**: db.batch() for multi-table atomic operations
- **ALWAYS**: Comprehensive audit logging (recordAuditEvent)
- **ALWAYS**: Test schema = production schema exactly