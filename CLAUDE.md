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

- ESLint flat config imports need `.js` extensions
- Type-aware linting uses `projectService: true` + `tsconfigRootDir: import.meta.dirname`
- All workspaces require scripts: `lint`, `lint:fix`, `format`
- Pre-commit hooks block commits with violations, lint-staged processes only staged files

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
