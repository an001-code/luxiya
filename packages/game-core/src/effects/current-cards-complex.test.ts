import { describe, expect, test } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import { applyCommand, applyQuProcessingReplacement, createGame, createPlayerView, sequenceRng } from '../index.js';

const makeGame = () => createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
const card = (instanceId: string, cardId: string) => ({ instanceId, cardId, face: 'up' as const, rested: false });
const opponent = (state: ReturnType<typeof makeGame>, id: string) => state.playerOrder.find((playerId) => playerId !== id)!;
const energy = (count: number, cardId = 'DEV-001') => Array.from({ length: count }, (_, index) => card(`energy-${index}`, cardId));
const passTwice = (state: ReturnType<typeof makeGame>, attackerId: string, defenderId: string, prefix: string) => {
  const first = applyCommand(state, { type: 'PASS_RESPONSE', commandId: `${prefix}-1`, playerId: defenderId, expectedVersion: state.version }, sequenceRng([0.1]));
  return applyCommand(first.state, { type: 'PASS_RESPONSE', commandId: `${prefix}-2`, playerId: attackerId, expectedVersion: first.state.version }, sequenceRng([0.1]));
};

describe('ST01-001 evolution and abilities', () => {
  test('evolves for two, stacks over Lucia, searches top five, orders the rest, and has haste', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.field[0] = { ...card('lucia-base', 'ST01-004'), enteredTurn: 0 };
    player.hand = [card('evolution', 'ST01-001'), card('discard-cost', 'DEV-001')];
    player.energy = energy(2);
    player.deck = [
      { ...card('search-hit', 'ST01-004'), face: 'down' },
      { ...card('bottom-1', 'DEV-005'), face: 'down' },
      { ...card('bottom-2', 'DEV-006'), face: 'down' },
      { ...card('bottom-3', 'DEV-005'), face: 'down' },
      { ...card('bottom-4', 'DEV-006'), face: 'down' },
      ...player.deck,
    ];
    const evolved = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'evolve-lucia', playerId, expectedVersion: state.version,
      instanceId: 'evolution', evolutionTargetSlot: 0, paymentIds: player.energy.map((entry) => entry.instanceId),
    }, sequenceRng([0.1]));
    expect(evolved.state.players[playerId]!.field[0]).toMatchObject({ cardId: 'ST01-001', evolved: true });
    expect(evolved.state.players[playerId]!.field[0]?.underneath?.map((entry) => entry.instanceId)).toEqual(['lucia-base']);
    expect(evolved.state.pendingDecision?.options.map((option) => option.instanceId)).toContain('search-hit');

    const picked = applyCommand(evolved.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'pick-search-hit', playerId, expectedVersion: evolved.state.version,
      decisionId: evolved.state.pendingDecision!.id, selectedInstanceIds: ['search-hit'],
    }, sequenceRng([0.1]));
    expect(picked.state.pendingDecision?.kind).toBe('order-cards');
    const ordered = applyCommand(picked.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'order-search-rest', playerId, expectedVersion: picked.state.version,
      decisionId: picked.state.pendingDecision!.id, selectedInstanceIds: ['bottom-4', 'bottom-3', 'bottom-2', 'bottom-1'],
    }, sequenceRng([0.1]));
    expect(ordered.state.players[playerId]!.field.some((entry) => entry?.instanceId === 'search-hit')).toBe(true);
    expect(ordered.state.players[playerId]!.deck.slice(-4).map((entry) => entry.instanceId)).toEqual(['bottom-4', 'bottom-3', 'bottom-2', 'bottom-1']);
    expect(createPlayerView(ordered.state, playerId).legalActions).toContainEqual({ type: 'DECLARE_ATTACK', attackerSlot: 0, target: 'player' });
  });

  test('activated blue ability pays three adjacent blue signals, returns a character, then plays an eligible hand character', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.field[0] = { ...card('lucia-evolved', 'ST01-001'), enteredTurn: 0 };
    player.field[1] = { ...card('returned-character', 'ST01-004'), enteredTurn: 0 };
    player.hand = [card('played-character', 'ST01-005')];
    player.signals = [card('blue-1', 'BP01-081'), card('blue-2', 'BP01-081'), card('blue-3', 'BP01-081')];
    const ability = createPlayerView(state, playerId).legalActions.find((action) => action.type === 'ACTIVATE_ABILITY' && action.sourceInstanceId === 'lucia-evolved');
    expect(ability).toBeTruthy();
    const started = applyCommand(state, { ...ability!, commandId: 'activate-lucia', playerId, expectedVersion: state.version }, sequenceRng([0.1]));
    const paid = applyCommand(started.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'pay-blue', playerId, expectedVersion: started.state.version,
      decisionId: started.state.pendingDecision!.id, selectedInstanceIds: ['blue-1', 'blue-2', 'blue-3'],
    }, sequenceRng([0.1]));
    const returned = applyCommand(paid.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'return-character', playerId, expectedVersion: paid.state.version,
      decisionId: paid.state.pendingDecision!.id, selectedInstanceIds: ['returned-character'],
    }, sequenceRng([0.1]));
    const played = applyCommand(returned.state, {
      type: 'RESOLVE_EFFECT_DECISION', commandId: 'play-character', playerId, expectedVersion: returned.state.version,
      decisionId: returned.state.pendingDecision!.id, selectedInstanceIds: ['played-character'],
    }, sequenceRng([0.1]));
    expect(played.state.players[playerId]!.signals).toEqual([]);
    expect(played.state.players[playerId]!.graveyard.map((entry) => entry.instanceId)).toEqual(expect.arrayContaining(['blue-1', 'blue-2', 'blue-3']));
    expect(played.state.players[playerId]!.field.some((entry) => entry?.instanceId === 'played-character')).toBe(true);
    expect(played.state.players[playerId]!.hand.map((entry) => entry.instanceId)).toContain('returned-character');
  });
});

describe('leave, replacement, equipment, and support effects', () => {
  test('sealed blade grants haste and is recovered when PR-016 leaves after eliminating a signal', () => {
    const state = makeGame();
    const defenderId = state.activePlayerId;
    const attackerId = opponent(state, defenderId);
    state.activePlayerId = attackerId;
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { ...card('destroyer', 'DEV-006'), enteredTurn: 0 };
    state.players[attackerId]!.deck.unshift({ ...card('non-signal', 'DEV-001'), face: 'down' });
    state.players[defenderId]!.field[0] = {
      ...card('pr-016', 'PR-016'), rested: true, enteredTurn: state.turn,
      attached: [card('sealed-blade', 'BP01-023')],
    };
    state.players[defenderId]!.signals = [card('signal-cost', 'BP01-079')];
    state.activePlayerId = defenderId;
    state.players[defenderId]!.field[0]!.rested = false;
    expect(createPlayerView(state, defenderId).legalActions).toContainEqual({ type: 'DECLARE_ATTACK', attackerSlot: 0, target: 'player' });
    state.activePlayerId = attackerId;
    state.players[defenderId]!.field[0]!.rested = true;
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'destroy-pr-016', playerId: attackerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'character', targetSlot: 0,
    }, sequenceRng([0.1]));
    const resolved = passTwice(declared.state, attackerId, defenderId, 'destroy-pass');
    expect(resolved.state.players[defenderId]!.field[0]?.instanceId).toBe('sealed-blade');
    expect(resolved.state.players[defenderId]!.graveyard.map((entry) => entry.instanceId)).toEqual(expect.arrayContaining(['pr-016', 'signal-cost']));
  });

  test('BP01-037 requires Qu, triples a chosen signal, and supports its processing replacement', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    state.cardDefinitions['DEV-001']!.name = '曲';
    player.field[0] = { ...card('qu', 'DEV-001'), enteredTurn: 0 };
    player.hand = [card('tactic', 'BP01-037')];
    player.energy = energy(1);
    player.signals = [card('tripled-signal', 'BP01-079')];
    const played = applyCommand(state, {
      type: 'PLAY_CARD', commandId: 'play-triple', playerId, expectedVersion: state.version,
      instanceId: 'tactic', paymentIds: ['energy-0'],
    }, sequenceRng([0.1]));
    expect(played.state.continuousModifiers).toContainEqual(expect.objectContaining({
      kind: 'signal-as', targetInstanceIds: ['tripled-signal'], count: 3,
    }));

    const replacement = makeGame();
    const replacementPlayer = replacement.players[replacement.activePlayerId]!;
    replacementPlayer.processing = [card('replacement-card', 'BP01-037')];
    expect(applyQuProcessingReplacement(replacement, replacementPlayer.id, 'replacement-card')).toBe(true);
    expect(replacementPlayer.energy).toContainEqual(expect.objectContaining({ instanceId: 'replacement-card', rested: true }));
  });

  test('BP01-023 rests another card and prevents PP 4000 or lower blockers once per turn', () => {
    const state = makeGame();
    const attackerId = state.activePlayerId;
    const defenderId = opponent(state, attackerId);
    state.phase = 'main';
    state.players[attackerId]!.field[0] = { ...card('pr-016', 'PR-016'), enteredTurn: 0, attached: [card('blade', 'BP01-023')] };
    state.players[attackerId]!.field[1] = { ...card('rest-cost', 'DEV-001'), enteredTurn: 0 };
    state.players[defenderId]!.field[0] = { ...card('pp-4000', 'DEV-003'), enteredTurn: 0 };
    state.players[defenderId]!.field[1] = { ...card('pp-5000', 'DEV-004'), enteredTurn: 0 };
    const declared = applyCommand(state, {
      type: 'DECLARE_ATTACK', commandId: 'sealed-blade-attack', playerId: attackerId, expectedVersion: state.version,
      attackerSlot: 0, target: 'player',
    }, sequenceRng([0.1]));
    expect(declared.state.players[attackerId]!.field[1]?.rested).toBe(true);
    expect(createPlayerView(declared.state, defenderId).legalActions).not.toContainEqual({ type: 'BLOCK', blockerSlot: 0 });
    expect(createPlayerView(declared.state, defenderId).legalActions).toContainEqual({ type: 'BLOCK', blockerSlot: 1 });
  });

  test('BP01-012 atomically discards two characters, rests, and recovers a signal', () => {
    const state = makeGame();
    const playerId = state.activePlayerId;
    const player = state.players[playerId]!;
    state.phase = 'main';
    player.field[0] = { ...card('support', 'BP01-012'), enteredTurn: 0 };
    player.hand = [card('character-1', 'DEV-001'), card('character-2', 'DEV-002')];
    player.graveyard = [card('recovered-signal', 'BP01-081')];
    const ability = createPlayerView(state, playerId).legalActions.find((action) => action.type === 'ACTIVATE_ABILITY' && action.sourceInstanceId === 'support');
    const result = applyCommand(state, { ...ability!, commandId: 'activate-support', playerId, expectedVersion: state.version }, sequenceRng([0.1]));
    expect(result.state.players[playerId]!.field[0]?.rested).toBe(true);
    expect(result.state.players[playerId]!.hand).toEqual([]);
    expect(result.state.players[playerId]!.graveyard.map((entry) => entry.instanceId)).toEqual(expect.arrayContaining(['character-1', 'character-2']));
    expect(result.state.players[playerId]!.signals[0]?.instanceId).toBe('recovered-signal');
  });
});
