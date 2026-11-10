import { describe, expect, test } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import { applyCommand, createGame, createPlayerView, sequenceRng } from '../index.js';

const makeGame = () => createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
const card = (instanceId: string, cardId: string) => ({ instanceId, cardId, face: 'up' as const, rested: false });
const opponent = (state: ReturnType<typeof makeGame>, id: string) => state.playerOrder.find((playerId) => playerId !== id)!;
const energy = (count: number, cardId = 'DEV-001') => Array.from({ length: count }, (_, index) => card(`energy-${index}`, cardId));

const passTwice = (state: ReturnType<typeof makeGame>, attackerId: string, defenderId: string, prefix: string) => {
  const first = applyCommand(state, { type: 'PASS_RESPONSE', commandId: `${prefix}-1`, playerId: defenderId, expectedVersion: state.version }, sequenceRng([0.1]));
  return applyCommand(first.state, { type: 'PASS_RESPONSE', commandId: `${prefix}-2`, playerId: attackerId, expectedVersion: first.state.version }, sequenceRng([0.1]));
};

describe('zone and ordered signal effects', () => {
  test('PR-006 pays discard, returns the chosen face-up energy, then charges the deck top rested', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.hand = [card('pr-006', 'PR-006'), card('discarded', 'DEV-001')];
    player.energy = [card('returned', 'DEV-001'), card('kept-energy', 'DEV-002'), ...energy(2).map((entry, index) => ({ ...entry, instanceId: `extra-energy-${index}` }))];
    player.deck.unshift({ ...card('charged-top', 'DEV-003'), face: 'down' });
    const played = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'play-pr-006', playerId, expectedVersion: state.version,
      instanceId: 'pr-006', fieldSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(played.state.pendingDecision?.options.map((option) => option.instanceId)).toEqual(expect.arrayContaining(['returned', 'kept-energy']));
    const resolved = applyCommand(played.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'return-energy', playerId, expectedVersion: played.state.version,
      decisionId: played.state.pendingDecision!.id, selectedInstanceIds: ['returned'],
    }, sequenceRng([0.1]));
    const finalPlayer = resolved.state.players[playerId]!;
    expect(finalPlayer.hand.map((entry) => entry.instanceId)).toContain('returned');
    expect(finalPlayer.graveyard.map((entry) => entry.instanceId)).toContain('discarded');
    expect(finalPlayer.energy).toContainEqual(expect.objectContaining({ instanceId: 'charged-top', rested: true, face: 'up' }));
  });

  test('PR-004 lets its owner reorder every signal and gains team PP with both required names', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.hand = [card('pr-004', 'PR-004')];
    player.energy = energy(5, 'DEV-004');
    player.signals = [card('s1', 'BP01-079'), card('s2', 'BP01-081'), card('s3', 'BP01-084')];
    const played = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'play-pr-004', playerId, expectedVersion: state.version,
      instanceId: 'pr-004', fieldSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(played.state.pendingDecision?.kind).toBe('order-cards');
    const reordered = applyCommand(played.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'reorder-signals', playerId, expectedVersion: played.state.version,
      decisionId: played.state.pendingDecision!.id, selectedInstanceIds: ['s3', 's1', 's2'],
    }, sequenceRng([0.1]));
    expect(reordered.state.players[playerId]!.signals.map((entry) => entry.instanceId)).toEqual(['s3', 's1', 's2']);

    const combat = makeGame();
    const attackerId = combat.activePlayerId;
    const defenderId = opponent(combat, attackerId);
    combat.phase = 'main';
    combat.cardDefinitions['DEV-001']!.name = '里';
    combat.cardDefinitions['DEV-002']!.name = '丽芙';
    combat.players[attackerId]!.field = [
      { ...card('team-attacker', 'PR-004'), enteredTurn: 0 },
      { ...card('lee', 'DEV-001'), enteredTurn: 0 },
      { ...card('liv', 'DEV-002'), enteredTurn: 0 }, null, null,
    ];
    combat.players[attackerId]!.deck.unshift({ ...card('non-signal-charge', 'DEV-001'), face: 'down' });
    combat.players[defenderId]!.field[0] = { ...card('six-thousand', 'DEV-005'), rested: true, enteredTurn: 0 };
    const declared = applyCommand(combat, {
      type: 'DECLARE_ATTACK', commandId: 'team-attack', playerId: attackerId, expectedVersion: combat.version,
      attackerSlot: 0, target: 'character', targetSlot: 0,
    }, sequenceRng([0.1]));
    expect(passTwice(declared.state, attackerId, defenderId, 'team-pass').state.players[defenderId]!.field[0]).toBeNull();
  });

  test('BP03-076 recovers exactly one blue signal to the top of the signal zone', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.hand = [card('bp03-076', 'BP03-076')];
    player.energy = energy(4);
    player.signals = [card('existing', 'BP01-079')];
    player.graveyard = [card('blue', 'BP01-081'), card('red', 'BP01-079')];
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'play-bp03-076', playerId, expectedVersion: state.version,
      instanceId: 'bp03-076', fieldSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(result.state.players[playerId]!.signals.map((entry) => entry.instanceId)).toEqual(['blue', 'existing']);
  });
});

describe('conditional signal, cost, and base-value effects', () => {
  test('BP03-077 attack selects a signal and treats it as blue until turn end', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    state.phase = 'main';
    const player = state.players[playerId]!;
    player.field[0] = { ...card('attacker', 'BP03-077'), enteredTurn: 0 };
    player.field[1] = { ...card('other-alpha', 'PR-016'), enteredTurn: 0 };
    player.signals = [card('chosen-signal', 'BP01-079'), card('other-signal', 'BP01-084')];
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'alpha-attack', playerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    expect(declared.state.pendingDecision?.targetId).toBe('blue-signal');
    const selected = applyCommand(declared.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'choose-blue-signal', playerId,
      expectedVersion: declared.state.version, decisionId: declared.state.pendingDecision!.id,
      selectedInstanceIds: ['chosen-signal'],
    }, sequenceRng([0.1]));
    expect(selected.state.continuousModifiers).toContainEqual(expect.objectContaining({
      kind: 'signal-as', targetInstanceIds: ['chosen-signal'], value: 'blue',
    }));
  });

  test('BP03-075 spends chosen blue signals for -2 cost each and still has haste', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.hand = [card('bp03-075', 'BP03-075')];
    player.signals = [card('blue-1', 'BP01-081'), card('blue-2', 'BP01-081'), card('red', 'BP01-079')];
    player.energy = energy(4);
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'discount-bp03-075', playerId, expectedVersion: state.version,
      instanceId: 'bp03-075', fieldSlot: 0,
      discountSignalIds: ['blue-1', 'blue-2'], paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(result.accepted).toBe(true);
    expect(result.state.players[playerId]!.signals.map((entry) => entry.instanceId)).toEqual(['red']);
    expect(result.state.players[playerId]!.graveyard.map((entry) => entry.instanceId)).toEqual(expect.arrayContaining(['blue-1', 'blue-2']));
    expect(createPlayerView(result.state, playerId).legalActions).toContainEqual({ type: 'DECLARE_ATTACK', attackerSlot: 0, target: 'player' });
  });

  test('BP03-009 base DP becomes one while a floating card exists in processing', () => {
    const state = makeGame();
    const attackerId = state.activePlayerId;
    const defenderId = opponent(state, attackerId);
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { ...card('floating-dp-attacker', 'BP03-009'), enteredTurn: 0 };
    state.players[attackerId]!.processing = [{ ...card('floating-card', 'DEV-001'), mode: 'floating' }];
    state.players[attackerId]!.deck.unshift({ ...card('non-signal', 'DEV-001'), face: 'down' });
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'floating-dp-attack', playerId: attackerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    const resolved = passTwice(declared.state, attackerId, defenderId, 'floating-pass');
    expect(resolved.state.players[defenderId]!.corruption).toBe(1);
  });

  test('BP01-011 draws only when corruption changed during the current turn', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.field[0] = { ...card('host', 'ST01-006'), enteredTurn: 0 };
    player.hand = [card('crown', 'BP01-011')];
    player.energy = energy(3);
    player.deck.unshift({ ...card('not-drawn', 'DEV-001'), face: 'down' });
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'crown-no-corruption', playerId, expectedVersion: state.version,
      instanceId: 'crown', targetSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(result.state.players[playerId]!.hand.map((entry) => entry.instanceId)).not.toContain('not-drawn');
  });
});
