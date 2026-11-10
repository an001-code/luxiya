import { describe, expect, test } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import type { StructuredEffect } from '@pgr/protocol';
import {
  applyCommand,
  continueEffectResolution,
  createGame,
  enqueueEffects,
  sequenceRng,
} from '../index.js';

const effect = (overrides: Partial<StructuredEffect>): StructuredEffect => ({
  id: 'test-effect', ability: 'automatic', conditions: [], costs: [], targets: [], actions: [],
  ...overrides,
});

const setup = () => {
  const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
  const controllerId = state.activePlayerId;
  const player = state.players[controllerId]!;
  player.hand = [
    { instanceId: 'hand-1', cardId: 'DEV-001', face: 'up', rested: false },
    { instanceId: 'hand-2', cardId: 'DEV-002', face: 'up', rested: false },
  ];
  player.field = [
    { instanceId: 'source', cardId: 'DEV-003', face: 'up', rested: false },
    null, null, null, null,
  ];
  return { state, controllerId, player };
};

describe('common structured effect interpreter', () => {
  test('executes draw and corruption actions in order and removes the completed frame', () => {
    const { state, controllerId, player } = setup();
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [effect({
      actions: [
        { kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 2 } },
        { kind: 'modify-corruption', player: 'self', operation: 'add', value: { kind: 'fixed', value: 2 } },
        { kind: 'modify-corruption', player: 'self', operation: 'subtract', value: { kind: 'fixed', value: 1 } },
      ],
    })]);
    continueEffectResolution(state, sequenceRng([0.1]));

    expect(player.hand).toHaveLength(4);
    expect(player.corruption).toBe(1);
    expect(state.effectStack).toEqual([]);
  });

  test('executes chosen discard, rest/upright, movement, and temporary stat/signal modifiers', () => {
    const { state, controllerId, player } = setup();
    state.phase = 'main';
    player.signals = [{ instanceId: 'signal', cardId: 'BP01-079', face: 'up', rested: false }];
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [effect({
      targets: [
        { id: 'discarded', kind: 'cards', player: 'self', zone: 'hand', min: 1, max: 1 },
        { id: 'character', kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1 },
        { id: 'signal', kind: 'cards', player: 'self', zone: 'signals', min: 1, max: 1 },
      ],
      actions: [
        { kind: 'discard', targetId: 'discarded' },
        { kind: 'rest', targetId: 'character' },
        { kind: 'upright', targetId: 'character' },
        { kind: 'modify-stat', targetId: 'character', stat: 'pp', operation: 'add', value: { kind: 'fixed', value: 1000 }, duration: { kind: 'turn' } },
        { kind: 'signal-as', targetId: 'signal', color: 'blue', count: 2, duration: { kind: 'turn' } },
      ],
    })]);
    continueEffectResolution(state, sequenceRng([0.1]));
    expect(state.pendingDecision?.targetId).toBe('discarded');

    const result = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'choose-discard', playerId: controllerId,
      expectedVersion: state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['hand-1'],
    }, sequenceRng([0.1]));

    expect(result.accepted).toBe(true);
    expect(result.state.players[controllerId]!.graveyard.map((card) => card.instanceId)).toContain('hand-1');
    expect(result.state.players[controllerId]!.field[0]?.rested).toBe(false);
    expect(result.state.continuousModifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'stat', targetInstanceIds: ['source'], value: 1000 }),
      expect.objectContaining({ kind: 'signal-as', targetInstanceIds: ['signal'], value: 'blue' }),
    ]));
    expect(result.state.effectStack).toEqual([]);

    const opened = applyCommand(result.state, {
      type: 'END_PHASE', commandId: 'end-modifier-turn', playerId: controllerId,
      expectedVersion: result.state.version,
    }, sequenceRng([0.1]));
    const opponentId = result.state.playerOrder.find((id) => id !== controllerId)!;
    const firstPass = applyCommand(opened.state, {
      type: 'PASS_RESPONSE', commandId: 'modifier-end-pass-1', playerId: controllerId,
      expectedVersion: opened.state.version,
    }, sequenceRng([0.1]));
    const ended = applyCommand(firstPass.state, {
      type: 'PASS_RESPONSE', commandId: 'modifier-end-pass-2', playerId: opponentId,
      expectedVersion: firstPass.state.version,
    }, sequenceRng([0.1]));
    expect(ended.state.continuousModifiers).toEqual([]);
  });

  test('moves a selected card between zones', () => {
    const { state, controllerId, player } = setup();
    player.hand = [{ instanceId: 'only-card', cardId: 'DEV-001', face: 'up', rested: false }];
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [effect({
      targets: [{ id: 'moved', kind: 'cards', player: 'self', zone: 'hand', min: 1, max: 1 }],
      actions: [{ kind: 'move-card', targetId: 'moved', to: 'graveyard' }],
    })]);
    continueEffectResolution(state, sequenceRng([0.1]));

    expect(player.hand).toEqual([]);
    expect(player.graveyard.at(-1)?.instanceId).toBe('only-card');
  });

  test('skips a mandatory effect with no legal target but resolves an up-to target as empty', () => {
    const { state, controllerId, player } = setup();
    player.field = [null, null, null, null, null];
    const handBefore = player.hand.length;
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [effect({
      id: 'mandatory-empty',
      targets: [{ id: 'missing', kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1 }],
      actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
    })]);
    continueEffectResolution(state, sequenceRng([0.1]));
    expect(player.hand).toHaveLength(handBefore);

    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [effect({
      id: 'up-to-empty',
      targets: [{ id: 'optional-targets', kind: 'cards', player: 'self', zone: 'field', min: 0, max: 2 }],
      actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
    })]);
    continueEffectResolution(state, sequenceRng([0.1]));
    expect(player.hand).toHaveLength(handBefore + 1);
  });
});

describe('atomic effect costs', () => {
  const costlyEffect = (optional = false): StructuredEffect => effect({
    id: optional ? 'optional-cost' : 'compound-cost', optional,
    costs: [
      { kind: 'discard', player: 'self', amount: { kind: 'fixed', value: 1 } },
      { kind: 'rest', target: 'source' },
    ],
    actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
  });

  test('changes nothing when any part of a compound cost is unaffordable', () => {
    const { state, controllerId, player } = setup();
    player.field[0]!.rested = true;
    const before = structuredClone(player);
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [costlyEffect()]);
    continueEffectResolution(state, sequenceRng([0.1]));

    expect(player).toEqual(before);
    expect(state.pendingDecision).toBeNull();
    expect(state.effectStack).toEqual([]);
  });

  test('a cancelled optional cost changes nothing', () => {
    const { state, controllerId, player } = setup();
    const before = structuredClone(player);
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [costlyEffect(true)]);
    continueEffectResolution(state, sequenceRng([0.1]));
    const result = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'cancel-cost', playerId: controllerId,
      expectedVersion: state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: [],
    }, sequenceRng([0.1]));

    expect(result.state.players[controllerId]).toEqual(before);
    expect(result.state.effectStack).toEqual([]);
  });

  test('pays discard plus rest completely before executing the action', () => {
    const { state, controllerId } = setup();
    enqueueEffects(state, { controllerId, sourceInstanceId: 'source' }, [costlyEffect()]);
    continueEffectResolution(state, sequenceRng([0.1]));
    const result = applyCommand(state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'pay-cost', playerId: controllerId,
      expectedVersion: state.version, decisionId: state.pendingDecision!.id, selectedInstanceIds: ['hand-1'],
    }, sequenceRng([0.1]));
    const player = result.state.players[controllerId]!;

    expect(result.accepted).toBe(true);
    expect(player.field[0]?.rested).toBe(true);
    expect(player.graveyard.map((card) => card.instanceId)).toContain('hand-1');
    expect(player.hand).toHaveLength(2);
    expect(result.state.effectStack).toEqual([]);
  });
});
