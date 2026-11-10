import { describe, expect, test } from 'vitest';
import { developmentDeck, getCardDefinition } from '@pgr/cards';
import { applyCommand, createGame, createPlayerView, sequenceRng } from '../index.js';

const makeGame = () => createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
const card = (instanceId: string, cardId: string) => ({ instanceId, cardId, face: 'up' as const, rested: false });
const opponent = (state: ReturnType<typeof makeGame>, id: string) => state.playerOrder.find((playerId) => playerId !== id)!;
const energy = (count: number) => Array.from({ length: count }, (_, index) => card(`energy-${index}`, 'DEV-001'));

const finishResponses = (state: ReturnType<typeof makeGame>, attackerId: string, defenderId: string, prefix: string) => {
  const first = applyCommand(state, {
    type: 'PASS_RESPONSE', commandId: `${prefix}-1`, playerId: defenderId, expectedVersion: state.version,
  }, sequenceRng([0.1]));
  return applyCommand(first.state, {
    type: 'PASS_RESPONSE', commandId: `${prefix}-2`, playerId: attackerId, expectedVersion: first.state.version,
  }, sequenceRng([0.1]));
};

describe('basic current card effects', () => {
  test('migrated cards use typed graphs and ST01-005 draws before its discard choice', () => {
    for (const cardId of ['ST01-005', 'ST01-004', 'BP01-079', 'BP01-080', 'BP01-081', 'BP01-084', 'BP01-007', 'BP01-011']) {
      expect(getCardDefinition(cardId).structuredEffects?.flatMap((entry) => entry.actions).some((action) => action.kind === 'custom')).toBe(false);
    }
    expect(getCardDefinition('ST01-006').structuredEffects).toEqual([]);

    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.hand = [card('red-lotus', 'ST01-005'), card('kept', 'DEV-002')];
    player.deck.unshift({ ...card('drawn', 'DEV-003'), face: 'down' });
    player.energy = energy(3);
    const played = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'play-red-lotus', playerId, expectedVersion: state.version,
      instanceId: 'red-lotus', fieldSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));

    expect(played.state.pendingDecision?.options.map((option) => option.instanceId)).toEqual(['kept', 'drawn']);
    const discarded = applyCommand(played.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'discard-drawn', playerId,
      expectedVersion: played.state.version, decisionId: played.state.pendingDecision!.id, selectedInstanceIds: ['drawn'],
    }, sequenceRng([0.1]));
    expect(discarded.state.players[playerId]!.graveyard.map((entry) => entry.instanceId)).toContain('drawn');
  });

  test.each(['BP01-079', 'BP01-080', 'BP01-081', 'BP01-084'])('%s enters the signal zone and draws', (cardId) => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.hand = [card('signal', cardId)];
    player.deck.unshift({ ...card('drawn', 'DEV-001'), face: 'down' });
    const result = applyCommand(state, {
      type: 'PLAY_CARD', commandId: `play-${cardId}`, playerId, expectedVersion: state.version,
      instanceId: 'signal', paymentIds: [],
    }, sequenceRng([0.1]));
    expect(result.state.players[playerId]!.signals.map((entry) => entry.instanceId)).toContain('signal');
    expect(result.state.players[playerId]!.hand.map((entry) => entry.instanceId)).toContain('drawn');
  });

  test('ST01-004 performs zero attack charges', () => {
    const state = makeGame();
    const attackerId = state.activePlayerId;
    const defenderId = opponent(state, attackerId);
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { ...card('attacker', 'ST01-004'), enteredTurn: 0 };
    state.players[attackerId]!.deck.unshift({ ...card('deck-top', 'BP01-079'), face: 'down' });
    const count = state.players[attackerId]!.deck.length;
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'zero-attack', playerId: attackerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    const resolved = finishResponses(declared.state, attackerId, defenderId, 'zero-pass');
    expect(resolved.state.players[attackerId]!.deck).toHaveLength(count);
    expect(resolved.state.pendingDecision).toBeNull();
  });

  test.each([
    ['BP01-079', ['dp-plus-one', 'pp-plus-2000']],
    ['BP01-081', ['draw-one', 'pp-plus-2000']],
    ['BP01-084', ['corruption-minus-one', 'pp-plus-2000']],
  ])('%s charge exposes its two choices', (signalId, choices) => {
    const state = makeGame();
    const attackerId = state.activePlayerId;
    const defenderId = opponent(state, attackerId);
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { ...card('attacker', 'ST01-006'), enteredTurn: 0 };
    state.players[attackerId]!.deck.unshift({ ...card('charged', signalId), face: 'down' });
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: `attack-${signalId}`, playerId: attackerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    const charged = finishResponses(declared.state, attackerId, defenderId, `charge-${signalId}`);
    expect(charged.state.pendingAttack?.stage).toBe('combat');
    expect(charged.state.pendingDecision?.options.map((option) => option.id)).toEqual(choices);
  });
});

describe('instant and equipment effects', () => {
  test('BP01-007 is legal only in instant windows and grants +1500 plus +1000 per discarded card', () => {
    const state = makeGame();
    const attackerId = state.activePlayerId;
    const defenderId = opponent(state, attackerId);
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { ...card('attacker', 'ST01-006'), enteredTurn: 0 };
    const defender = state.players[defenderId]!;
    defender.field[0] = { ...card('gray-raven', 'ST01-005'), enteredTurn: 0 };
    defender.hand = [card('instant', 'BP01-007'), card('extra-1', 'DEV-001'), card('extra-2', 'DEV-002')];
    expect(createPlayerView(state, defenderId).legalActions.some((action) => action.type === 'PLAY_CARD')).toBe(false);

    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'instant-attack', playerId: attackerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    expect(createPlayerView(declared.state, defenderId).legalActions).toContainEqual({ type: 'PLAY_CARD', instanceId: 'instant' });
    const played = applyCommand(declared.state, {
      type: 'PLAY_CARD', commandId: 'play-instant', playerId: defenderId, expectedVersion: declared.state.version,
      instanceId: 'instant', paymentIds: [],
    }, sequenceRng([0.1]));
    expect(played.state.pendingDecision?.targetId).toBe('extra-discard');
    const resolved = applyCommand(played.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'extra-discard', playerId: defenderId,
      expectedVersion: played.state.version, decisionId: played.state.pendingDecision!.id, selectedInstanceIds: ['extra-1'],
    }, sequenceRng([0.1]));
    expect(resolved.state.continuousModifiers.filter((modifier) => modifier.targetInstanceIds.includes('gray-raven')).map((modifier) => modifier.value)).toEqual([1500, 1000]);
    expect(resolved.state.players[defenderId]!.graveyard.map((entry) => entry.instanceId)).toEqual(expect.arrayContaining(['instant', 'extra-1']));

    const endState = makeGame();
    const endPlayerId = endState.activePlayerId;
    endState.phase = 'main';
    endState.players[endPlayerId]!.hand = [card('end-instant', 'BP01-007')];
    endState.players[endPlayerId]!.field[0] = { ...card('end-target', 'ST01-005'), enteredTurn: 0 };
    const ended = applyCommand(endState, {
      type: 'END_PHASE', commandId: 'end-window', playerId: endPlayerId, expectedVersion: endState.version,
    }, sequenceRng([0.1]));
    expect(ended.state.phase).toBe('end');
    expect(createPlayerView(ended.state, endPlayerId).legalActions).toContainEqual({ type: 'PLAY_CARD', instanceId: 'end-instant' });
  });

  test('equipment PP contributes to combat and BP01-011 conditionally draws on entry', () => {
    const combat = makeGame();
    const attackerId = combat.activePlayerId;
    const defenderId = opponent(combat, attackerId);
    combat.phase = 'main';
    combat.players[attackerId]!.field[0] = {
      ...card('equipped', 'ST01-004'), enteredTurn: 0, attached: [card('weapon', 'BP01-023')],
    };
    combat.players[defenderId]!.field[0] = { ...card('defender', 'DEV-003'), rested: true, enteredTurn: 0 };
    const declared = applyCommand(combat, {
      type: 'DECLARE_ATTACK', commandId: 'equipment-attack', playerId: attackerId, expectedVersion: combat.version,
      attackerSlot: 0, target: 'character', targetSlot: 0,
    }, sequenceRng([0.1]));
    const fought = finishResponses(declared.state, attackerId, defenderId, 'equipment-pass');
    expect(fought.state.players[defenderId]!.field[0]).toBeNull();

    const crownState = makeGame();
    const playerId = crownState.activePlayerId;
    const player = crownState.players[playerId]!;
    crownState.phase = 'main';
    player.field[0] = { ...card('host', 'ST01-006'), enteredTurn: 0 };
    player.hand = [card('crown', 'BP01-011')];
    player.energy = energy(3);
    player.deck.unshift({ ...card('crown-draw', 'DEV-001'), face: 'down' });
    crownState.events.push({ id: 99, type: 'damage', playerId, message: 'damage', public: true, createdAtTurn: crownState.turn });
    const crown = applyCommand(crownState, {
      type: 'PLAY_CARD', commandId: 'play-crown', playerId, expectedVersion: crownState.version,
      instanceId: 'crown', targetSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(crown.state.players[playerId]!.hand.map((entry) => entry.instanceId)).toContain('crown-draw');
  });
});
