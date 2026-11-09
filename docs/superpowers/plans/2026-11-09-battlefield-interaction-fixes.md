# Battlefield Interaction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正信号球容量、公开卡牌详情、费用选择、双方处理区和科幻战场背景。

**Architecture:** 保持服务端权威：客户端仅选择费用实例并随 `PLAY_CARD` 提交，规则引擎负责验证并结算。公开卡牌点击由战场组件统一处理，隐藏牌仍不泄露身份；视觉修改保持在独立背景层和现有战场组件内。

**Tech Stack:** TypeScript、React、Vitest、Playwright、CSS

**Spec:** 用户于 2026-11-09 提出的四项战场界面修订。

## Global Constraints

- 信号球区至少展示 12 个有序槽位，不为规则引擎增加 12 张上限。
- 除对方手牌外，所有可见区域卡牌均可点击查看；暗费不得泄露隐藏身份。
- 费用必须由玩家显式选择，并由服务端校验数量、状态和属性条件。
- 中央同时展示对手处理区与我方处理区。
- 背景保持独立可替换层，并在暗色遮罩下清晰可辨。

## Review Focus

- 选择未横置明费时只横置所选卡，未选费用保持原状。
- 选择暗费时该卡进入墓地，且不能借用未选明费满足属性条件。
- 调度点击同时保留调度选择和详情查看。
- 对方暗费点击只显示隐藏提示，不暴露 `cardId`。
- 1280×720 下 12 个信号球槽与中央处理区不重叠。

---

### Task 1: 选择式费用协议与规则

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/game-core/src/index.ts`
- Test: `packages/game-core/src/game.test.ts`

- [x] 添加失败测试，证明只结算 `paymentIds` 指定的费用，并拒绝数量或属性不合法的选择。
- [x] 为 `PLAY_CARD` 增加 `paymentIds`，实现选择校验与明暗费用结算。
- [x] 运行规则测试并确认通过。

### Task 2: 全区域详情与战场结构

**Files:**
- Modify: `apps/web/src/Battlefield.tsx`
- Modify: `apps/web/src/battlefield.test.tsx`

- [x] 添加失败测试，覆盖双方 12 个信号球槽、双方处理区和公开卡牌按钮。
- [x] 统一公开区域选卡逻辑，并实现费用选择与确认交互。
- [x] 运行 Web 单元测试并确认通过。

### Task 3: 科幻竞技场视觉与验收

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `开发记录.md`

- [x] 增强独立背景层的透视网格、能量核心和阵营分界。
- [x] 运行测试、类型检查、Lint、构建和双浏览器 E2E。
- [x] 检查 1920×1080 与 1280×720 截图并追加开发记录。

