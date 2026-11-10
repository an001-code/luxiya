import type {
  CardDefinition,
  CardInstance,
  EffectCardFilter,
  EffectPlayer,
  EffectTarget,
  EffectZone,
  GameState,
  PlayerId,
} from '@pgr/protocol';

export interface LocatedCard {
  card: CardInstance;
  playerId: PlayerId;
  zone: EffectZone;
  index: number;
}

export const opponentOf = (state: GameState, playerId: PlayerId): PlayerId =>
  state.playerOrder.find((id) => id !== playerId) ?? state.playerOrder[0];

export const effectPlayerId = (state: GameState, controllerId: PlayerId, player: EffectPlayer): PlayerId =>
  player === 'self' ? controllerId : opponentOf(state, controllerId);

export const cardsInZone = (state: GameState, playerId: PlayerId, zone: EffectZone): CardInstance[] => {
  const player = state.players[playerId]!;
  if (zone === 'field') return player.field.filter((card): card is CardInstance => card !== null);
  return player[zone];
};

export const matchesCardFilter = (
  card: CardInstance,
  definition: CardDefinition,
  filter?: EffectCardFilter,
): boolean => {
  if (!filter) return true;
  if (filter.types && !filter.types.includes(definition.type)) return false;
  if (filter.subtypes && (!definition.subtype || !filter.subtypes.includes(definition.subtype))) return false;
  if (filter.names && !filter.names.includes(definition.name)) return false;
  if (filter.traits && !filter.traits.some((trait) => definition.traits.includes(trait))) return false;
  if (filter.attributes && !filter.attributes.includes(definition.attribute)) return false;
  if (filter.signals && (!definition.signal || !filter.signals.includes(definition.signal))) return false;
  if (filter.minCost !== undefined && definition.cost < filter.minCost) return false;
  if (filter.maxCost !== undefined && definition.cost > filter.maxCost) return false;
  if (filter.minPp !== undefined && (definition.pp ?? 0) < filter.minPp) return false;
  if (filter.maxPp !== undefined && (definition.pp ?? 0) > filter.maxPp) return false;
  if (filter.rested !== undefined && card.rested !== filter.rested) return false;
  if (filter.face !== undefined && card.face !== filter.face) return false;
  return true;
};

export const selectCardInstanceIds = (
  state: GameState,
  controllerId: PlayerId,
  target: Extract<EffectTarget, { kind: 'cards' }>,
): string[] => {
  const playerId = effectPlayerId(state, controllerId, target.player);
  return cardsInZone(state, playerId, target.zone)
    .filter((card) => {
      const definition = state.cardDefinitions[card.cardId];
      return Boolean(definition && matchesCardFilter(card, definition, target.filter));
    })
    .map((card) => card.instanceId);
};

export const locateCard = (state: GameState, instanceId: string): LocatedCard | null => {
  const zones: EffectZone[] = ['deck', 'hand', 'graveyard', 'processing', 'field', 'signals', 'energy'];
  for (const playerId of state.playerOrder) {
    for (const zone of zones) {
      const cards = cardsInZone(state, playerId, zone);
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      if (index >= 0) return { card: cards[index]!, playerId, zone, index };
    }
  }
  return null;
};

export const removeLocatedCard = (state: GameState, located: LocatedCard): CardInstance | null => {
  const player = state.players[located.playerId]!;
  if (located.zone === 'field') {
    const slot = player.field.findIndex((card) => card?.instanceId === located.card.instanceId);
    if (slot < 0) return null;
    const card = player.field[slot];
    player.field[slot] = null;
    return card ?? null;
  }
  const zone = player[located.zone];
  const index = zone.findIndex((card) => card.instanceId === located.card.instanceId);
  if (index < 0) return null;
  return zone.splice(index, 1)[0] ?? null;
};
