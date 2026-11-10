# Existing Card Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every effect on the 20 cards in `卡牌.md` executable and publishable, and replace raw effect IDs in the administrator screen with a visual effect builder.

**Architecture:** Add typed effect nodes and authoritative pending decisions to the shared protocol, then execute common nodes through a deterministic interpreter and reserve custom handlers for genuinely card-specific mechanics. Migrate the 20 built-in cards to executable definitions while preserving uploaded images, and let administrators construct the same definitions with guided controls and a save-and-publish workflow.

**Tech Stack:** TypeScript, React, Fastify, Socket.IO, MySQL, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-card-effect-engine-editor-design.md`

## Global Constraints

- The server remains the only authority for game state and legal actions.
- Do not parse natural-language rules text and do not execute administrator-supplied scripts.
- A card may publish only when every structured node is executable; an empty/no-op handler is not executable.
- Preserve uploaded images, card status, timestamps, and administrator-maintained base fields during built-in effect migration.
- All effect resolution must remain deterministic for the same state, command, and RNG seed.
- Hidden hand, deck order, and face-down energy identities must never enter an opponent's `PlayerView` or decision payload.
- Complete the 20 existing cards before starting the separate remaining-keywords plan.

## Review Focus

- A stale or replayed decision ID must be rejected without mutating state; Task 2 adds the rejection test.
- Optional costs must not partially pay when the player cancels or cannot complete every cost; Task 3 adds atomic-cost tests.
- Effect choices involving a private zone must expose only the owning player's legal choices; Task 3 adds filtered-view tests.
- A built-in card with an uploaded image and administrator-edited rules text must retain both after effect-schema migration; Task 7 adds the repository test.
- “Save and publish” must not call publish when saving the image or effect graph fails; Task 8 adds the browser/API test.

---

### Task 1: Typed effect protocol and executable validation

**Files:**
- Create: `packages/protocol/src/effects.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/game-core/src/effects/capabilities.ts`
- Create: `packages/game-core/src/effects/capabilities.test.ts`
- Modify: `apps/server/src/cards/schema.ts`
- Modify: `apps/server/src/cards/service.ts`
- Modify: `apps/server/src/cards/cards.test.ts`

**Interfaces:**
- Produces: discriminated unions `EffectTrigger`, `EffectCondition`, `EffectCost`, `EffectTarget`, `EffectAction`, `EffectDuration`, and the revised `StructuredEffect`.
- Produces: `validateExecutableEffect(effect: StructuredEffect): string[]` from `@pgr/game-core`.
- Consumes: existing card draft APIs and `CardValidationError` publication errors.

- [ ] **Step 1: Write failing protocol and publication tests**

Add tests proving a typed “enter → self player → draw 1” effect is accepted, an unknown action is rejected by Zod, and an effect with `action.kind: 'custom'` is rejected unless its `customHandlerId` is registered. Assert publication errors include the structured effect ID.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- packages/game-core/src/effects/capabilities.test.ts apps/server/src/cards/cards.test.ts`

Expected: FAIL because typed nodes and `validateExecutableEffect` do not exist.

- [ ] **Step 3: Implement typed nodes and capability validation**

Define exact node kinds needed by the current cards: event/zone/card comparisons, fixed and counted values, discard/rest/pay-energy/eliminate-signal costs, player/card/zone targets, and draw/discard/modify/move/rest/freeze/corruption/signal-as/search/play/equip/custom actions. Update Zod with matching discriminated unions and make publication validation call `validateExecutableEffect` instead of checking every effect ID against a flat set.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- packages/game-core/src/effects/capabilities.test.ts apps/server/src/cards/cards.test.ts`

Expected: both files pass with no warnings.

- [ ] **Step 5: Commit**

```powershell
git add packages/protocol packages/game-core/src/effects apps/server/src/cards
git commit -m "feat: define executable card effect nodes"
```

### Task 2: Effect stack, pending decisions, and legal commands

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/game-core/src/effects/state.ts`
- Create: `packages/game-core/src/effects/state.test.ts`
- Modify: `packages/game-core/src/index.ts`
- Modify: `apps/web/src/Battlefield.tsx`
- Modify: `apps/web/src/battlefield.test.tsx`

**Interfaces:**
- Consumes: typed effect nodes from Task 1.
- Produces: `EffectFrame`, `PendingDecision`, `ContinuousModifier`, `AbilityUsageRecord` in `GameState`.
- Produces: `RESOLVE_EFFECT_DECISION` command with `decisionId`, `optionId?`, and `selectedInstanceIds`.
- Produces: filtered `PlayerDecisionView` in `PlayerView` and legal decision actions from `getLegalActions`.

- [ ] **Step 1: Write failing state-machine tests**

Test that an effect requiring a target pauses on a decision owned by one player, rejects the opponent, rejects a stale/replayed `decisionId` without changing state, and resumes the frame after a valid selection. Add a view test proving opponent hand/deck identities are absent from decision choices.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- packages/game-core/src/effects/state.test.ts apps/web/src/battlefield.test.tsx`

Expected: FAIL because `PendingDecision` and decision rendering do not exist.

- [ ] **Step 3: Implement the effect state machine and minimal decision panel**

Add empty effect state to `createGame`, including card-mode state needed to represent a constructed floating card, serialize only the current viewer's decision, and make unresolved decisions the only legal actions for their owner. Render a battlefield decision panel that sends `RESOLVE_EFFECT_DECISION`; do not yet add card-specific resolution.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- packages/game-core/src/effects/state.test.ts apps/web/src/battlefield.test.tsx`

Expected: tests pass, including immutable rejection assertions.

- [ ] **Step 5: Commit**

```powershell
git add packages/protocol packages/game-core apps/web/src/Battlefield.tsx apps/web/src/battlefield.test.tsx
git commit -m "feat: add authoritative effect decisions"
```

### Task 3: Common effect interpreter and atomic costs

**Files:**
- Create: `packages/game-core/src/effects/selectors.ts`
- Create: `packages/game-core/src/effects/interpreter.ts`
- Create: `packages/game-core/src/effects/interpreter.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Consumes: `EffectFrame`, `PendingDecision`, and typed nodes from Tasks 1–2.
- Produces: `enqueueEffects(state, source, effects): void` and `continueEffectResolution(state, rng): void`.
- Produces: pure selector functions that return legal instance IDs without leaking private-zone contents.

- [ ] **Step 1: Write failing primitive-effect tests**

Cover draw, chosen discard, PP/DP modification until end of turn, rest/upright, zone movement, corruption change, signal color override, and ordered multi-action resolution. Cover mandatory versus “up to” targets and an empty legal-target set.

- [ ] **Step 2: Write failing atomic-cost tests**

Assert a compound cost changes nothing when any part is unaffordable; a cancelled optional cost changes nothing; and a completed discard-plus-rest cost is fully paid before its action executes.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm.cmd test -- packages/game-core/src/effects/interpreter.test.ts`

Expected: FAIL because interpreter modules do not exist.

- [ ] **Step 4: Implement selectors, cost preflight/payment, and action execution**

Execute all common nodes through one ordered frame. Create decisions only when more than one legal choice exists or an effect is optional. Store temporary modifiers with explicit expiry and clear them in the correct turn/attack lifecycle.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm.cmd test -- packages/game-core/src/effects/interpreter.test.ts packages/game-core/src/effects/state.test.ts`

Expected: all effect state and interpreter tests pass.

```powershell
git add packages/game-core/src/effects packages/game-core/src/index.ts
git commit -m "feat: execute common structured card effects"
```

### Task 4: First card batch — draw, charge, signals, instant boost, and equipment PP

**Files:**
- Create: `packages/cards/src/current-card-effects.ts`
- Modify: `packages/cards/src/index.ts`
- Create: `packages/game-core/src/effects/current-cards-basic.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Consumes: common interpreter from Task 3.
- Produces: executable structured definitions for `ST01-005`, `ST01-006`, `ST01-004`, `BP01-079`, `BP01-080`, `BP01-081`, `BP01-084`, `BP01-007`, `BP01-011`, and the generic equipment PP portion of `BP01-023`.

- [ ] **Step 1: Write one failing behavior test per card/effect family**

Assert: red lotus draws then lets its owner choose a discard; charge-zero performs no attack charge; each signal enters the signal zone and draws; red/blue/yellow charge decisions expose their two correct options; `BP01-007` is legal only during the attack free-timing response or the end-phase instant window, selects a Gray Raven target, grants +1500 PP, and grants +1000 per explicitly discarded extra card; equipped PP contributes to combat.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- packages/game-core/src/effects/current-cards-basic.test.ts`

Expected: FAIL on the first unimplemented effect, including `instant_pp_boost`.

- [ ] **Step 3: Replace generic custom placeholders with typed graphs**

Wire card-use and attack-charge events into `enqueueEffects`, and add the alternating end-phase instant window required by the comprehensive rules. Remove the corresponding `effectIds.includes(...)` branches only after equivalent typed behavior is green.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- packages/game-core/src/effects/current-cards-basic.test.ts packages/game-core/src/game.test.ts`

Expected: basic-card tests and existing game tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/cards packages/game-core
git commit -m "feat: execute basic current card effects"
```

### Task 5: Second card batch — zone, signal, and conditional continuous effects

**Files:**
- Modify: `packages/cards/src/current-card-effects.ts`
- Create: `packages/game-core/src/effects/current-cards-zones.test.ts`
- Create: `packages/game-core/src/effects/current-card-handlers.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Consumes: typed graphs and custom-handler hook from prior tasks.
- Produces: executable behavior for `PR-006`, `PR-004`, `BP03-077`, `BP03-076`, `BP03-075`, `BP03-009`, and the corruption-draw portion of `BP01-011`.

- [ ] **Step 1: Write failing per-card tests**

Assert exact target filters and ordering for swapping a face-up energy, reordering signals, treating one chosen signal as blue through turn end, recovering a blue signal to the top, choosing one or more blue signals for -2 cost each, setting base DP to 1 while a floating card exists, conditional team PP, and drawing on entry only if corruption changed this turn.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- packages/game-core/src/effects/current-cards-zones.test.ts`

Expected: FAIL for missing handlers/condition evaluation.

- [ ] **Step 3: Implement only the custom operations not expressible as common nodes**

Keep target selection and zone movement in the interpreter; custom handlers may compute reorder permutations, dynamic play-cost reduction, and base-value replacement. Record corruption events in turn history.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- packages/game-core/src/effects/current-cards-zones.test.ts packages/game-core/src/game.test.ts`

Expected: zone-card tests and regressions pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/cards packages/game-core
git commit -m "feat: execute zone and signal card effects"
```

### Task 6: Final card batch — evolution, replacement, leave triggers, and activated support

**Files:**
- Modify: `packages/cards/src/current-card-effects.ts`
- Modify: `packages/game-core/src/effects/current-card-handlers.ts`
- Create: `packages/game-core/src/effects/current-cards-complex.test.ts`
- Modify: `packages/game-core/src/index.ts`

**Interfaces:**
- Produces: executable behavior for `ST01-001`, `PR-016`, `BP01-037`, `BP01-023`, and `BP01-012`.
- Completes: all card effects described in `卡牌.md`.

- [ ] **Step 1: Write failing evolution and search tests**

Assert evolution eligibility, cost 2, stacking over the chosen Lucia, haste on entry, top-five reveal/search/play, remaining-card bottom ordering, blue-signal activated ability, and cleanup of cards underneath when the evolved card leaves.

- [ ] **Step 2: Write failing trigger/replacement/equipment/support tests**

Assert sealed-blade haste and leave recovery, `BP01-037` use condition/triple signal/replacement into rested energy, `BP01-023` attack ability and blocker restriction, and `BP01-012` atomic discard-two-character plus rest to recover a signal.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm.cmd test -- packages/game-core/src/effects/current-cards-complex.test.ts`

Expected: FAIL for missing complex mechanisms.

- [ ] **Step 4: Implement custom handlers and lifecycle hooks**

Implement each named mechanism without widening into unused keywords. Add direct constructed-state coverage for the 〈曲〉 replacement path even though no current card creates that trigger naturally.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm.cmd test -- packages/game-core/src/effects/current-cards-complex.test.ts packages/game-core/src/effects/current-cards-basic.test.ts packages/game-core/src/effects/current-cards-zones.test.ts packages/game-core/src/game.test.ts`

Expected: all 20-card effect suites pass.

```powershell
git add packages/cards packages/game-core
git commit -m "feat: complete current card effect handling"
```

### Task 7: Built-in effect migration and publication readiness

**Files:**
- Modify: `apps/server/src/persistence/migrations.ts`
- Modify: `apps/server/src/persistence/types.ts`
- Modify: `apps/server/src/persistence/mysql-repository.ts`
- Modify: `apps/server/src/persistence/memory-repository.ts`
- Modify: `apps/server/src/seed-cards.ts`
- Modify: `apps/server/src/cards/cards.test.ts`
- Modify: `apps/server/src/persistence/repository.test.ts`

**Interfaces:**
- Produces: `effectSchemaVersion` on stored cards and an idempotent current-card effect sync.
- Consumes: final executable definitions from Task 6 and validation from Task 1.

- [ ] **Step 1: Write failing migration tests**

Seed an old built-in card with a PNG, published status, edited rules text, timestamps, and schema version 0. Run sync and assert image bytes, status, text, and timestamps are unchanged while effect nodes/version update. Assert a non-built-in administrator card is untouched and a second sync is idempotent.

- [ ] **Step 2: Write failing publication matrix test**

For every non-development definition from `卡牌.md`, attach a valid PNG and assert `CardService.publish(id)` succeeds with no missing-handler error.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm.cmd test -- apps/server/src/cards/cards.test.ts apps/server/src/persistence/repository.test.ts`

Expected: FAIL because effect schema version and safe sync do not exist.

- [ ] **Step 4: Implement migration, repository mapping, and sync**

Add the column idempotently, default legacy rows to 0, and update only the effect-owned fields of known built-in IDs. Keep development cards as drafts unless independently publishable.

- [ ] **Step 5: Verify GREEN, run real MySQL sync, and commit**

Run: `npm.cmd test -- apps/server/src/cards/cards.test.ts apps/server/src/persistence/repository.test.ts`

Run: `npm.cmd run db:seed-cards -w @pgr/server`

Expected: tests pass and the command reports effect definitions synchronized without printing credentials.

```powershell
git add apps/server/src/persistence apps/server/src/seed-cards.ts apps/server/src/cards/cards.test.ts
git commit -m "feat: migrate executable built-in card effects"
```

### Task 8: Visual effect builder and save-and-publish workflow

**Files:**
- Create: `apps/web/src/effects/EffectBuilder.tsx`
- Create: `apps/web/src/effects/effect-templates.ts`
- Create: `apps/web/src/effects/effect-summary.ts`
- Create: `apps/web/src/effects/EffectBuilder.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `apps/web/src/AdminCardEditor.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/card-platform.test.tsx`

**Interfaces:**
- Consumes: typed `StructuredEffect` from Task 1.
- Produces: `EffectBuilder({ effects, onChange })`, common templates, and `summarizeEffect(effect): string`.
- Produces: administrator `onSaveAndPublish(input, existingId): Promise<void>` flow.

- [ ] **Step 1: Add the browser-like component test environment and write failing builder tests**

Add Testing Library, user-event, and jsdom to the Web test workspace and scope jsdom to the effect-builder component test. Assert selecting “出场能力 → 我方玩家 → 抽牌 → 1” emits the exact typed effect and Chinese summary. Assert adding a second chosen-discard action preserves order, irrelevant fields disappear when action kind changes, and unsupported/incomplete nodes display a blocking status.

- [ ] **Step 2: Write failing save-and-publish test**

Assert the workflow PUTs/POSTs the image and effect graph first, uses the returned card ID, then publishes. Assert save failure prevents the publish request and keeps the editor on the failing ability.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm.cmd test -- apps/web/src/effects/EffectBuilder.test.tsx apps/web/src/card-platform.test.tsx apps/web/src/api.test.ts`

Expected: FAIL because visual controls and workflow do not exist.

- [ ] **Step 4: Implement guided builder and replace raw effect-ID editing**

Use card panels for ability, trigger, conditions, costs, targets, ordered actions, and duration. Keep JSON in a collapsed developer-only advanced section. Add templates for the common effects used by the 20 current cards and show server validation details next to the relevant effect ID.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm.cmd test -- apps/web/src/effects/EffectBuilder.test.tsx apps/web/src/card-platform.test.tsx apps/web/src/api.test.ts`

Expected: Web effect-builder tests pass.

```powershell
git add apps/web/src apps/web/package.json package-lock.json vitest.config.ts
git commit -m "feat: add visual card effect builder"
```

### Task 9: End-to-end card publication and live effect resolution

**Files:**
- Modify: `tests/e2e/card-platform.spec.ts`
- Modify: `README.md`
- Modify: `开发记录.md`

**Interfaces:**
- Consumes: the completed engine, migration, and visual editor.
- Produces: browser-level evidence that a current card can be uploaded, published, decked, and resolved.

- [ ] **Step 1: Extend the E2E test with the real `BP01-007` flow**

Use the visual builder/current seeded definition, upload a valid image, click “保存并发布”, assert the card enters the public library, build a legal deck containing it, open an attack response window, play it, choose a Gray Raven target, choose extra discarded cards, and assert both clients show the same PP and event log.

- [ ] **Step 2: Add 1920×1080 and 1280×720 visual assertions**

Capture the effect builder with at least two ordered actions, scroll to save-and-publish, and assert the target/choice panel does not overlap battlefield zones.

- [ ] **Step 3: Run the complete verification matrix**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e`

Expected: every command exits 0; Vitest and Playwright report zero failures.

- [ ] **Step 4: Inspect screenshots and append the development log**

Record card batches, RED→GREEN evidence, real MySQL migration result, known limitations, and the next plan for remaining comprehensive-rule keywords. Do not claim those remaining keywords are implemented.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/card-platform.spec.ts README.md 开发记录.md
git commit -m "test: verify executable current card effects"
```
