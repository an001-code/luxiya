import { describe, expect, test } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import type { StructuredEffect } from '@pgr/protocol';
import {
  applyCommand, createGame, createPlayerView, getLegalActions, sequenceRng, startEffectResolution,
} from '../index.js';

const targetEffect: StructuredEffect = {
  id: 'test-target-effect', ability: 'enter', conditions: [], costs: [],
  targets: [{
    id: 'character', kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1,
    filter: { types: ['character'] },
  }],
  actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
};

const gameWaitingForTarget = () => {
  const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
  const controllerId = state.activePlayerId;
  const controller = state.players[controllerId]!;
  controller.field[0] = { instanceId: 'target-1', cardId: 'DEV-001', face: 'up', rested: false };
  controller.field[1] = { instanceId: 'target-2', cardId: 'DEV-002', face: 'up', rested: false };
  return startEffectResolution(state, { controllerId, sourceInstanceId: 'target-1', effect: targetEffect });
};

describe('authoritative effect decisions', () => {
  test('pauses a targeted effect and exposes only a decision action to its controller', () => {
    const state = gameWaitingForTarget();
    const controllerId = state.activePlayerId;
    const opponentId = state.playerOrder.find((id) => id !== controllerId)!;
    expect(state.pendingDecision).toMatchObject({
      playerId: controllerId, kind: 'select-cards', targetId: 'character', min: 1, max: 1,
    });
    expect(state.pendingDecision?.options.map((option) => option.instanceId)).toEqual(['target-1', 'target-2']);
    expect(getLegalActions(state, controllerId)).toEqual([{
      type: 'RESOLVE_EFFECT_DECISION', decisionId: state.pendingDecision!.id, selectedInstanceIds: [],
    }]);
    expect(getLegalActions(state, opponentId)).toEqual([]);
  });

  test('rejects the opponent without mutating the waiting state', () => {
    const state = gameWaitingForTarget();
    const opponentId = state.playerOrder.find((id) => id !== state.pendingDecision!.playerId)!;
    const result = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'opponent-decision', playerId: opponentId,
      expectedVersion: state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['target-1'],
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe('NOT_YOUR_ACTION');
    expect(result.state).toBe(state);
  });

  test('rejects stale and replayed decision ids immutably', () => {
    const state = gameWaitingForTarget();
    const playerId = state.pendingDecision!.playerId;
    const stale = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'stale-decision', playerId,
      expectedVersion: state.version + 1, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['target-1'],
    }, sequenceRng([0.1]));
    expect(stale.accepted).toBe(false);
    expect(stale.state).toBe(state);

    const accepted = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'valid-decision', playerId,
      expectedVersion: state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['target-1'],
    }, sequenceRng([0.1]));
    const replay = applyCommand(accepted.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'replayed-decision', playerId,
      expectedVersion: accepted.state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['target-1'],
    }, sequenceRng([0.1]));
    expect(replay.accepted).toBe(false);
    expect(replay.state).toBe(accepted.state);
  });

  test('stores a valid selection and resumes the suspended frame', () => {
    const state = gameWaitingForTarget();
    const result = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'resolve-target', playerId: state.pendingDecision!.playerId,
      expectedVersion: state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['target-2'],
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(true);
    expect(result.state.pendingDecision).toBeNull();
    expect(result.state.effectStack.at(-1)).toMatchObject({
      status: 'resolving', selectedTargets: { character: ['target-2'] },
    });
  });

  test('serializes a decision only for its owner and never leaks it to the opponent', () => {
    const state = gameWaitingForTarget();
    const ownerId = state.pendingDecision!.playerId;
    const opponentId = state.playerOrder.find((id) => id !== ownerId)!;
    expect(createPlayerView(state, ownerId).pendingDecision?.options).toEqual([
      expect.objectContaining({ instanceId: 'target-1' }),
      expect.objectContaining({ instanceId: 'target-2' }),
    ]);
    expect(createPlayerView(state, opponentId).pendingDecision).toBeNull();

    const hiddenTargetEffect: StructuredEffect = {
      ...targetEffect,
      id: 'hidden-target-effect',
      targets: [{ id: 'secret', kind: 'cards', player: 'opponent', zone: 'hand', min: 1, max: 1 }],
    };
    const hiddenState = startEffectResolution(createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1])), {
      controllerId: ownerId,
      sourceInstanceId: 'source',
      effect: hiddenTargetEffect,
    });
    const hiddenOptions = createPlayerView(hiddenState, ownerId).pendingDecision?.options ?? [];
    expect(hiddenOptions.every((option) => option.cardId === null && option.label === '隐藏卡牌')).toBe(true);
  });
});
