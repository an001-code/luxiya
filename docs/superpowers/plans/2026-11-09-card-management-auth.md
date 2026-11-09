# Card Management, Deck Builder, and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MySQL-backed accounts, admin card import, public card browsing, player deck editing, and custom-deck room play to the existing card battle MVP.

**Architecture:** Fastify depends on repository interfaces with MySQL and in-memory implementations. Authentication uses hashed opaque sessions in an HTTP-only cookie. Published card definitions and valid decks are snapshotted into `GameState` at match creation so the deterministic engine never depends on mutable database state.

**Tech Stack:** TypeScript, Fastify, React 19, Vite, Zod, `mysql2/promise`, Node.js crypto, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-card-management-auth-design.md`

## Global Constraints

- Node.js 22 and npm workspaces remain the required runtime and package manager.
- MySQL is the only persistent database; tests must not require a running local MySQL instance.
- The bootstrap administrator is named `Anonce`; no plaintext password may appear in tracked files or logs.
- Draft decks may be incomplete; active decks require exactly 50 cards, at most 4 copies per card, and exactly 4 red, 4 blue, and 4 yellow signal cards.
- Only published cards with executable effect coverage may enter player decks.
- Existing guest room and battle tests remain green while authenticated custom decks are introduced.

## Review Focus

- Usernames that differ only by case must conflict rather than create separate accounts; Task 2 covers this.
- An expired, malformed, or database-missing session must behave as logged out and clear the cookie; Task 2 covers this.
- Oversized or incorrectly declared card images must be rejected before database writes; Task 3 covers this.
- Concurrent deck edits must not leave an active invalid deck; Task 4 covers this in a repository transaction test.
- A published card edited after match start must not alter that match's definitions; Task 5 covers this with a game snapshot test.

---

### Task 1: Persistent domain and MySQL foundation

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Create: `apps/server/src/persistence/types.ts`
- Create: `apps/server/src/persistence/memory-repository.ts`
- Create: `apps/server/src/persistence/mysql-repository.ts`
- Create: `apps/server/src/persistence/migrations.ts`
- Create: `apps/server/src/persistence/repository.test.ts`
- Modify: `apps/server/package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `AppRepository`, `UserRecord`, `SessionRecord`, `StoredCard`, `StoredDeck`, `createMemoryRepository()`, `createMySqlRepository(config)` and `migrateDatabase(connection)`.
- Consumes: existing `CardDefinition` and `DeckDefinition`.

- [ ] Write repository contract tests for case-insensitive users, sessions, card image round trips, deck replacement, and transaction rollback.
- [ ] Run `npm.cmd test -- apps/server/src/persistence/repository.test.ts`; expect failure because persistence modules do not exist.
- [ ] Add protocol persistence DTOs and the in-memory repository, then run the target test; expect pass for the memory contract.
- [ ] Install `mysql2`, add the MySQL implementation and idempotent schema migration with parameterized SQL.
- [ ] Run `npm.cmd test -- apps/server/src/persistence/repository.test.ts` and `npm.cmd run typecheck`; expect pass.
- [ ] Commit `feat: add card platform persistence foundation` and append verification to `开发记录.md`.

### Task 2: Authentication and administrator bootstrap

**Files:**
- Create: `apps/server/src/auth/password.ts`
- Create: `apps/server/src/auth/service.ts`
- Create: `apps/server/src/auth/routes.ts`
- Create: `apps/server/src/auth/auth.test.ts`
- Create: `apps/server/src/bootstrap-admin.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/package.json`

**Interfaces:**
- Consumes: `AppRepository` user/session methods from Task 1.
- Produces: `AuthService`, `registerAuthRoutes(app, authService)`, `requireUser(request)` and the `db:bootstrap-admin` script.

- [ ] Write failing injected HTTP tests for register, login, logout, `/me`, duplicate-case usernames, expired sessions, admin role, and non-admin rejection.
- [ ] Run the auth test; expect 404 routes or missing module failures.
- [ ] Implement scrypt password hashing, SHA-256 session storage, cookie parsing/serialization, auth routes, and role guards.
- [ ] Add the environment-only `Anonce` bootstrap command; test it with a fake repository and assert plaintext never enters stored records.
- [ ] Run the auth tests and full unit suite; expect pass.
- [ ] Commit `feat: add account sessions and admin bootstrap` and append verification to `开发记录.md`.

### Task 3: Admin card import and publication

**Files:**
- Create: `apps/server/src/cards/schema.ts`
- Create: `apps/server/src/cards/service.ts`
- Create: `apps/server/src/cards/routes.ts`
- Create: `apps/server/src/cards/cards.test.ts`
- Create: `apps/server/src/cards/effect-handlers.ts`
- Create: `apps/server/src/seed-cards.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/cards/src/index.ts`
- Modify: `apps/server/src/server.ts`

**Interfaces:**
- Consumes: repository card methods and admin guard.
- Produces: `CardInput`, `StructuredEffect`, `CardService`, public/admin card routes, `/api/cards/:id/image`, and idempotent built-in-card seeding.

- [ ] Write failing tests for draft creation, 8 MiB image/type checks, duplicate IDs, draft visibility, publication coverage failures, handler validation, and published listing.
- [ ] Run the card tests; expect missing routes/services.
- [ ] Implement schemas, effect templates, handler registry, service and routes with atomic writes.
- [ ] Add a seed command that converts the current static registry into published records without overwriting administrator edits.
- [ ] Run card tests, typecheck and full suite; expect pass.
- [ ] Commit `feat: add structured card import and publishing` and append verification to `开发记录.md`.

### Task 4: Player card library and deck services

**Files:**
- Create: `apps/server/src/decks/service.ts`
- Create: `apps/server/src/decks/routes.ts`
- Create: `apps/server/src/decks/decks.test.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `apps/server/src/server.ts`

**Interfaces:**
- Consumes: authenticated user, published cards and deck repository methods.
- Produces: deck CRUD routes, `validateDeck(deck, cardLookup)` and atomic activation.

- [ ] Write failing tests for incomplete draft saves, exact 50-card validation, four-copy limit, 4/4/4 signals, unpublished cards, ownership and one-active-deck semantics.
- [ ] Run deck tests; expect missing service/routes and old global lookup signature.
- [ ] Implement catalog-aware validation, deck service and authenticated routes.
- [ ] Run target tests and the full unit suite; expect pass.
- [ ] Commit `feat: add player deck drafts and validation` and append verification to `开发记录.md`.

### Task 5: Deterministic custom-deck matches

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `packages/game-core/src/game.test.ts`
- Modify: `apps/server/src/room-manager.ts`
- Modify: `apps/server/src/room-manager.test.ts`
- Modify: `apps/server/src/server.ts`

**Interfaces:**
- Consumes: two valid active deck snapshots and published card catalogs.
- Produces: `createGame(playerIds, decks, definitions, rng)` with definitions snapshotted in state, plus authenticated room create/join selection.

- [ ] Write failing tests proving players may use different decks, match definitions survive later catalog edits, and invalid/missing active decks cannot ready.
- [ ] Run game and room tests; expect signature and behavior failures.
- [ ] Refactor all card definition access through the state snapshot and load selected decks before room readiness.
- [ ] Run game, room and full unit suites; expect pass.
- [ ] Commit `feat: use custom decks in deterministic matches` and append verification to `开发记录.md`.

### Task 6: Login, card library, deck editor, and admin UI

**Files:**
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/AuthScreen.tsx`
- Create: `apps/web/src/CardLibrary.tsx`
- Create: `apps/web/src/DeckEditor.tsx`
- Create: `apps/web/src/AdminCardEditor.tsx`
- Create: `apps/web/src/card-platform.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/Battlefield.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: Tasks 2–5 HTTP DTOs.
- Produces: authenticated top navigation, card filtering/detail, deck construction/activation, administrator structured card editor, and selected-deck room entry.

- [ ] Write failing component tests for login gating, role-based admin navigation, published-card filtering, deck counts/validation, image preview, structured effect editing and room deck selection.
- [ ] Run component tests; expect missing components.
- [ ] Implement the four approved screens using the tactical-terminal tokens from the spec, with keyboard focus and 1280 px desktop support.
- [ ] Replace battlefield static definition reads with match-view definitions where needed.
- [ ] Run component tests, typecheck, lint and build; expect pass.
- [ ] Commit `feat: add card platform and deck builder UI` and append verification to `开发记录.md`.

### Task 7: MySQL setup, browser acceptance, and handoff

**Files:**
- Modify: `tests/e2e/two-player.spec.ts`
- Create: `tests/e2e/card-platform.spec.ts`
- Modify: `README.md`
- Modify: `开发记录.md`

**Interfaces:**
- Consumes: complete application from Tasks 1–6.
- Produces: documented local database setup and end-to-end acceptance evidence.

- [ ] Add Playwright coverage for registration/login, admin draft/import/publish, card browsing, draft deck editing, valid deck activation, two accounts entering a room with different decks, and victory.
- [ ] Run E2E and inspect 1920×1080 plus 1280×720 screenshots; expect no overlap and all core controls accessible.
- [ ] Document MySQL creation, migration, built-in card seeding, secure administrator bootstrap, development startup and password rotation.
- [ ] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `npm.cmd run test:e2e`; expect all pass.
- [ ] Commit `test: verify persistent card platform flow` and append final verification, known limitations and next steps to `开发记录.md`.
