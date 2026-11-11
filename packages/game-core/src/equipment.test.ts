import { expect, test } from 'vitest';
import { developmentDeck } from '@pgr/cards';
import { applyCommand, createGame, createPlayerView, sequenceRng } from './index.js';

const setup = () => {
  const state = createGame(['p1', 'p2'], developmentDeck, sequenceRng([0.1]));
  state.phase = 'main';
  const player = state.players[state.activePlayerId]!;
  player.field = [
    { instanceId: 'weapon', cardId: 'BP01-023', face: 'up', rested: false },
    { instanceId: 'host', cardId: 'PR-016', face: 'up', rested: false, enteredTurn: state.turn }, null, null, null,
  ];
  return { state, player };
};

test('field equipment attaches to a chosen character without paying its play cost again', () => {
  const { state, player } = setup();
  player.energy = [];
  expect(createPlayerView(state, player.id).legalActions).toContainEqual({ type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1 });
  const result = applyCommand(state, { type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1,
    playerId: player.id, commandId: 'equip', expectedVersion: state.version }, sequenceRng([0.1]));
  expect(result.accepted).toBe(true);
  expect(result.state.players[player.id]!.field[0]).toBeNull();
  expect(result.state.players[player.id]!.field[1]?.attached?.[0]?.instanceId).toBe('weapon');
  expect(createPlayerView(result.state, player.id).legalActions).toContainEqual({ type: 'DECLARE_ATTACK', attackerSlot: 1, target: 'player' });
  expect(state.players[player.id]!.field[0]?.instanceId).toBe('weapon');
});

test.each(['occupied', 'equipment-target', 'wrong-player', 'response'] as const)('rejects illegal field equipment: %s', (kind) => {
  const { state, player } = setup();
  if (kind === 'occupied') player.field[1]!.attached = [{ instanceId: 'old', cardId: 'BP01-023', face: 'up', rested: false }];
  if (kind === 'equipment-target') player.field[1]!.cardId = 'BP01-023';
  if (kind === 'response') state.priorityWindow = { kind: 'end-phase', priorityPlayerId: player.id, consecutivePasses: 0 };
  const result = applyCommand(state, { type: 'EQUIP_CARD', sourceSlot: 0, targetSlot: 1,
    playerId: kind === 'wrong-player' ? state.playerOrder.find((id) => id !== player.id)! : player.id,
    commandId: 'invalid', expectedVersion: state.version }, sequenceRng([0.1]));
  expect(result.accepted).toBe(false);
  expect(result.state).toBe(state);
});
