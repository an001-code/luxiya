import { cardDefinitions as builtInCardDefinitions, getCardDefinition } from '@pgr/cards';
import type {
  CardDefinition,
  CardInstance,
  DeckDefinition,
  GameCommand,
  GameEvent,
  GameResult,
  GameState,
  LegalAction,
  PlayerBoardView,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicCardView,
} from '@pgr/protocol';

export { registeredCustomEffectHandlers, validateExecutableEffect } from './effects/capabilities.js';

export type Rng = () => number;

export const sequenceRng = (values: number[]): Rng => {
  let index = 0;
  return () => {
    const value = values[index % Math.max(values.length, 1)] ?? 0.5;
    index += 1;
    return value;
  };
};

export const validateDeck = (
  deck: DeckDefinition,
  lookup: (id: string) => CardDefinition = getCardDefinition,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (deck.cards.length !== 50) errors.push('牌组必须恰好包含50张卡牌');
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) if (count > 4) errors.push(`${id} 超过同编号4张上限`);
  for (const color of ['red', 'blue', 'yellow'] as const) {
    const count = deck.cards.filter((id) => lookup(id).signal === color).length;
    if (count !== 4) errors.push(`${color}信号球必须恰好4张`);
  }
  return { valid: errors.length === 0, errors };
};

const shuffle = <T>(items: T[], rng: Rng): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

const createInstances = (deck: DeckDefinition, owner: string): CardInstance[] =>
  deck.cards.map((cardId, index) => ({
    instanceId: `${owner}-${index + 1}`,
    cardId,
    face: 'down',
    rested: false,
  }));

const drawOne = (state: GameState, player: PlayerState, rng: Rng): CardInstance | null => {
  if (player.deck.length === 0 && player.graveyard.length > 0) {
    player.deck = shuffle(player.graveyard.splice(0).map((card) => ({ ...card, face: 'down' as const, rested: false })), rng);
    player.corruption += 1;
    addEvent(state, 'deck-refresh', player.id, `${player.id} 进行了牌组更新，侵蚀+1`);
  }
  const card = player.deck.shift() ?? null;
  if (card) {
    card.face = 'up';
    player.hand.push(card);
  }
  return card;
};

const addEvent = (state: GameState, type: string, playerId: string | undefined, message: string): GameEvent => {
  const event: GameEvent = {
    id: state.events.length + 1,
    type,
    message,
    public: true,
    createdAtTurn: state.turn,
    ...(playerId ? { playerId } : {}),
  };
  state.events.push(event);
  return event;
};

export function createGame(playerIds: [PlayerId, PlayerId], deck: DeckDefinition, rng: Rng): GameState;
export function createGame(
  playerIds: [PlayerId, PlayerId],
  decks: [DeckDefinition, DeckDefinition],
  definitions: CardDefinition[],
  rng: Rng,
): GameState;
export function createGame(
  playerIds: [PlayerId, PlayerId],
  deckOrDecks: DeckDefinition | [DeckDefinition, DeckDefinition],
  definitionsOrRng: CardDefinition[] | Rng,
  suppliedRng?: Rng,
): GameState {
  const definitions = typeof definitionsOrRng === 'function' ? builtInCardDefinitions : definitionsOrRng;
  const rng = typeof definitionsOrRng === 'function' ? definitionsOrRng : suppliedRng;
  if (!rng) throw new Error('RNG is required');
  const decks: [DeckDefinition, DeckDefinition] = Array.isArray(deckOrDecks) ? deckOrDecks : [deckOrDecks, deckOrDecks];
  const definitionMap = Object.fromEntries(definitions.map((definition) => [definition.id, structuredClone(definition)]));
  const lookup = (id: string): CardDefinition => {
    const definition = definitionMap[id];
    if (!definition) throw new Error(`Unknown card: ${id}`);
    return definition;
  };
  for (const deck of decks) {
    const validation = validateDeck(deck, lookup);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
  }
  const players = Object.fromEntries(playerIds.map((id, index) => {
    const shuffled = shuffle(createInstances(decks[index]!, id), rng);
    const hand = shuffled.splice(0, 4).map((card) => ({ ...card, face: 'up' as const }));
    const energy = shuffled.splice(0, 2).map((card) => ({ ...card, face: 'up' as const }));
    const player: PlayerState = {
      id, deck: shuffled, hand, energy, graveyard: [], processing: [], field: Array(5).fill(null),
      signals: [], corruption: 0, mulliganDone: false,
    };
    return [id, player];
  })) as Record<PlayerId, PlayerState>;
  const activePlayerId = playerIds[Math.floor(rng() * 2)] ?? playerIds[0];
  const state: GameState = {
    id: `game-${Math.floor(rng() * 1_000_000).toString(36)}`,
    version: 0,
    cardDefinitions: definitionMap,
    status: 'playing',
    players,
    playerOrder: playerIds,
    activePlayerId,
    phase: 'mulligan',
    turn: 1,
    pendingAttack: null,
    winnerId: null,
    processedCommandIds: [],
    events: [],
  };
  addEvent(state, 'game-start', undefined, '对局创建，双方进行起手调度');
  return state;
}

const definitionFor = (state: GameState, cardId: string): CardDefinition => {
  const definition = state.cardDefinitions[cardId];
  if (!definition) throw new Error(`Unknown card in game snapshot: ${cardId}`);
  return definition;
};

const opponentId = (state: GameState, playerId: string): string =>
  state.playerOrder.find((id) => id !== playerId) ?? state.playerOrder[0];

const isHaste = (state: GameState, card: CardInstance): boolean => {
  const effects = definitionFor(state, card.cardId).effectIds;
  if (effects.includes('haste')) return true;
  return effects.includes('weapon_haste') && Boolean(card.attached?.some((item) => definitionFor(state, item.cardId).traits.includes('封刃太刀')));
};

const effectivePp = (state: GameState, card: CardInstance): number => (definitionFor(state, card.cardId).pp ?? 0)
  + (card.attached ?? []).reduce((sum, item) => sum + (definitionFor(state, item.cardId).pp ?? 0), 0)
  + (card.temporaryPp ?? 0);

const effectiveDp = (state: GameState, card: CardInstance): number => (definitionFor(state, card.cardId).dp ?? 0) + (card.temporaryDp ?? 0);

export const getLegalActions = (state: GameState, playerId: string): LegalAction[] => {
  if (state.status !== 'playing') return [];
  const player = state.players[playerId];
  if (!player) return [];
  if (state.phase === 'mulligan' && !player.mulliganDone) return [{ type: 'MULLIGAN', instanceIds: [] }];
  if (state.pendingAttack) {
    if (state.pendingAttack.priorityPlayerId !== playerId) return [];
    const actions: LegalAction[] = [{ type: 'PASS_RESPONSE' }];
    if (playerId !== state.activePlayerId && state.pendingAttack.blockerSlot === undefined) {
      player.field.forEach((card, blockerSlot) => {
        if (card && !card.rested) actions.push({ type: 'BLOCK', blockerSlot });
      });
    }
    for (const card of player.hand) {
      if (definitionFor(state, card.cardId).subtype === 'instant' && canPay(state, player, card.cardId)) actions.push({ type: 'PLAY_CARD', instanceId: card.instanceId });
    }
    return actions;
  }
  if (state.activePlayerId !== playerId) return [];
  if (state.phase === 'upright' || state.phase === 'draw') return [{ type: 'ADVANCE_PHASE' }];
  if (state.phase === 'energy') return [{ type: 'SET_ENERGY' }, ...player.hand.map((card) => ({ type: 'SET_ENERGY' as const, instanceId: card.instanceId }))];
  if (state.phase !== 'main') return [];
  const actions: LegalAction[] = [{ type: 'END_PHASE' }];
  for (const card of player.hand) {
    const definition = definitionFor(state, card.cardId);
    if (definition.subtype === 'instant' || !canPay(state, player, card.cardId)) continue;
    const hasEmptySlot = player.field.some((item) => item === null);
    const hasEquipmentTarget = definition.subtype === 'equipment' && player.field.some((item) => item && definitionFor(state, item.cardId).type === 'character' && !item.attached?.length);
    if ((definition.type === 'character' || definition.subtype === 'support') && !hasEmptySlot) continue;
    if (definition.subtype === 'equipment' && !hasEmptySlot && !hasEquipmentTarget) continue;
    actions.push({ type: 'PLAY_CARD', instanceId: card.instanceId });
  }
  for (let startIndex = 0; startIndex + 2 < player.signals.length; startIndex += 1) actions.push({ type: 'ELIMINATE_SIGNALS', startIndex });
  player.field.forEach((card, attackerSlot) => {
    if (!card || card.rested || (card.enteredTurn === state.turn && !isHaste(state, card))) return;
    actions.push({ type: 'DECLARE_ATTACK', attackerSlot, target: 'player' });
    const opponent = state.players[opponentId(state, playerId)]!;
    opponent.field.forEach((target, targetSlot) => {
      if (target?.rested) actions.push({ type: 'DECLARE_ATTACK', attackerSlot, target: 'character', targetSlot });
    });
  });
  return actions;
};

const publicCard = (card: CardInstance, hideIdentity = false): PublicCardView => ({
  instanceId: card.instanceId,
  cardId: hideIdentity ? null : card.cardId,
  face: card.face,
  rested: card.rested,
  ...(card.enteredTurn === undefined ? {} : { enteredTurn: card.enteredTurn }),
  ...(card.frozen === undefined ? {} : { frozen: card.frozen }),
  ...(card.temporaryPp === undefined ? {} : { temporaryPp: card.temporaryPp }),
  ...(card.temporaryDp === undefined ? {} : { temporaryDp: card.temporaryDp }),
  ...(card.attached ? { attached: card.attached.map((item) => publicCard(item, hideIdentity)) } : {}),
});

const boardView = (player: PlayerState, own: boolean): PlayerBoardView => ({
  id: player.id,
  hand: own ? player.hand.map((card) => ({ ...card })) : { count: player.hand.length },
  deck: { count: player.deck.length },
  graveyard: player.graveyard.map((card) => publicCard(card)),
  processing: player.processing.map((card) => publicCard(card)),
  field: player.field.map((card) => card ? publicCard(card) : null),
  signals: player.signals.map((card) => publicCard(card)),
  energy: player.energy.map((card) => publicCard(card, !own && card.face === 'down')),
  corruption: player.corruption,
});

export const createPlayerView = (state: GameState, playerId: PlayerId): PlayerView => {
  const self = state.players[playerId];
  if (!self) throw new Error('Player is not part of this game');
  const opponent = state.players[opponentId(state, playerId)]!;
  return {
    gameId: state.id,
    version: state.version,
    status: state.status,
    viewerId: playerId,
    self: boardView(self, true),
    opponent: boardView(opponent, false),
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    turn: state.turn,
    pendingAttack: state.pendingAttack,
    winnerId: state.winnerId,
    legalActions: getLegalActions(state, playerId),
    events: state.events.filter((event) => event.public),
  };
};

const reject = (state: GameState, code: NonNullable<GameResult['rejection']>['code'], message: string): GameResult => ({
  accepted: false,
  state,
  legalActions: [],
  emittedEvents: [],
  rejection: { code, message },
});

const canPay = (state: GameState, player: PlayerState, cardId: string): boolean => {
  const definition = definitionFor(state, cardId);
  const available = player.energy.filter((card) => !card.rested);
  if (available.length < definition.cost) return false;
  if (definition.cost === 0 || definition.attribute === 'none') return true;
  return available.some((card) => card.face === 'up' && definitionFor(state, card.cardId).attribute === definition.attribute);
};

const selectedPayment = (state: GameState, player: PlayerState, cardId: string, paymentIds: string[] | undefined): CardInstance[] | null => {
  const definition = definitionFor(state, cardId);
  const ids = paymentIds ?? [];
  if (ids.length !== definition.cost || new Set(ids).size !== ids.length) return null;
  const selected = ids.map((id) => player.energy.find((card) => card.instanceId === id && !card.rested));
  if (selected.some((card) => !card)) return null;
  const cards = selected as CardInstance[];
  if (definition.cost > 0 && definition.attribute !== 'none'
    && !cards.some((card) => card.face === 'up' && definitionFor(state, card.cardId).attribute === definition.attribute)) return null;
  return cards;
};

const pay = (player: PlayerState, selected: CardInstance[]): void => {
  for (const selectedCard of selected) {
    const index = player.energy.findIndex((card) => card.instanceId === selectedCard.instanceId);
    const card = player.energy[index]!;
    if (card.face === 'up') card.rested = true;
    else {
      player.energy.splice(index, 1);
      card.face = 'up';
      player.graveyard.push(card);
    }
  }
};

const checkDefeat = (state: GameState): void => {
  const defeated = state.playerOrder.filter((id) => {
    const player = state.players[id]!;
    return player.corruption >= 7 || (player.deck.length === 0 && player.graveyard.length === 0);
  });
  if (defeated.length === 0) return;
  state.status = 'finished';
  state.winnerId = defeated.length === 2 ? null : opponentId(state, defeated[0]!);
  addEvent(state, 'game-finished', state.winnerId ?? undefined, state.winnerId ? `${state.winnerId} 获胜` : '双方同时败北，平局');
};

const attackCharge = (state: GameState, player: PlayerState, attacker: CardInstance, rng: Rng): void => {
  if (definitionFor(state, attacker.cardId).effectIds.includes('charge_zero')) return;
  const card = player.deck.shift();
  if (!card) return;
  card.face = 'up';
  const definition = definitionFor(state, card.cardId);
  if (definition.signal) {
    player.signals.push(card);
    if (definition.effectIds.includes('charge_choice_red')) attacker.temporaryDp = (attacker.temporaryDp ?? 0) + 1;
    if (definition.effectIds.includes('charge_choice_blue')) drawOne(state, player, rng);
    if (definition.effectIds.includes('charge_choice_yellow')) {
      const opponent = state.players[opponentId(state, player.id)]!;
      if (player.corruption >= opponent.corruption && player.corruption > 0) player.corruption -= 1;
      else attacker.temporaryPp = (attacker.temporaryPp ?? 0) + 2000;
    }
  } else player.hand.push(card);
  addEvent(state, 'attack-charge', player.id, `${player.id} 执行攻击充能`);
};

const damagePlayer = (state: GameState, player: PlayerState, amount: number, rng: Rng): void => {
  for (let i = 0; i < amount; i += 1) {
    if (player.deck.length === 0 && player.graveyard.length > 0) {
      player.deck = shuffle(player.graveyard.splice(0).map((card) => ({ ...card, face: 'down' as const, rested: false })), rng);
      player.corruption += 1;
    }
    const card = player.deck.shift();
    if (card) player.energy.push({ ...card, face: 'down', rested: false });
    player.corruption += 1;
    checkDefeat(state);
    if (state.status === 'finished') break;
  }
};

const resolveAttack = (state: GameState, rng: Rng): void => {
  const pending = state.pendingAttack;
  if (!pending) return;
  const attackerPlayer = state.players[state.activePlayerId]!;
  const defenderPlayer = state.players[opponentId(state, state.activePlayerId)]!;
  const attacker = attackerPlayer.field[pending.attackerSlot];
  if (!attacker) { state.pendingAttack = null; return; }
  attackCharge(state, attackerPlayer, attacker, rng);
  const defenderSlot = pending.blockerSlot ?? (pending.target === 'character' ? pending.targetSlot : undefined);
  if (defenderSlot !== undefined) {
    const defender = defenderPlayer.field[defenderSlot];
    if (defender && effectivePp(state, attacker) >= effectivePp(state, defender)) {
      defenderPlayer.field[defenderSlot] = null;
      defenderPlayer.graveyard.push(defender);
      addEvent(state, 'character-destroyed', defenderPlayer.id, `${definitionFor(state, defender.cardId).name} 被战斗破坏`);
    }
  } else {
    const amount = effectiveDp(state, attacker);
    damagePlayer(state, defenderPlayer, amount, rng);
    addEvent(state, 'damage', defenderPlayer.id, `${defenderPlayer.id} 受到${amount}点伤害`);
  }
  state.pendingAttack = null;
};

export const applyCommand = (state: GameState, command: GameCommand, rng: Rng): GameResult => {
  if (command.expectedVersion !== state.version) return reject(state, 'STALE_VERSION', '客户端状态已过期');
  if (state.processedCommandIds.includes(command.commandId)) return reject(state, 'DUPLICATE_COMMAND', '命令已处理');
  if (state.status === 'finished') return reject(state, 'GAME_FINISHED', '对局已经结束');
  if (!state.players[command.playerId]) return reject(state, 'ILLEGAL_ACTION', '玩家不在该对局中');
  const next = structuredClone(state);
  const player = next.players[command.playerId]!;
  const emittedBefore = next.events.length;

  if (command.type === 'CONCEDE') {
    next.status = 'finished';
    next.winnerId = opponentId(next, command.playerId);
    addEvent(next, 'concede', command.playerId, `${command.playerId} 认输`);
  } else if (command.type === 'MULLIGAN' && next.phase === 'mulligan' && !player.mulliganDone) {
    const selected = player.hand.filter((card) => command.instanceIds.includes(card.instanceId));
    player.hand = player.hand.filter((card) => !command.instanceIds.includes(card.instanceId));
    for (let i = 0; i < selected.length; i += 1) drawOne(next, player, rng);
    player.deck.push(...selected.map((card) => ({ ...card, face: 'down' as const })));
    player.mulliganDone = true;
    addEvent(next, 'mulligan', player.id, `${player.id} 完成起手调度`);
    if (next.playerOrder.every((id) => next.players[id]!.mulliganDone)) next.phase = 'upright';
  } else if (command.type === 'ADVANCE_PHASE' && command.playerId === next.activePlayerId) {
    if (next.phase === 'upright') {
      for (const card of [...player.field.filter(Boolean), ...player.energy] as CardInstance[]) card.rested = false;
      next.phase = 'draw';
    } else if (next.phase === 'draw') {
      const count = next.turn === 1 ? 1 : 2;
      for (let i = 0; i < count; i += 1) drawOne(next, player, rng);
      next.phase = 'energy';
    } else return reject(state, 'ILLEGAL_ACTION', '当前阶段不能推进');
  } else if (command.type === 'SET_ENERGY' && command.playerId === next.activePlayerId && next.phase === 'energy') {
    if (command.instanceId) {
      if (player.energy.length >= 10) return reject(state, 'ILLEGAL_ACTION', '费用区已满');
      const index = player.hand.findIndex((card) => card.instanceId === command.instanceId);
      if (index < 0) return reject(state, 'ILLEGAL_ACTION', '卡牌不在手牌中');
      const [card] = player.hand.splice(index, 1);
      player.energy.push({ ...card!, face: 'up', rested: false });
    }
    next.phase = 'main';
  } else if (command.type === 'PLAY_CARD') {
    const index = player.hand.findIndex((card) => card.instanceId === command.instanceId);
    if (index < 0) return reject(state, 'ILLEGAL_ACTION', '卡牌不在手牌中');
    const card = player.hand[index]!;
    const definition = definitionFor(next, card.cardId);
    const inResponse = Boolean(next.pendingAttack && next.pendingAttack.priorityPlayerId === command.playerId && definition.subtype === 'instant');
    if (!inResponse && (next.phase !== 'main' || next.activePlayerId !== command.playerId || definition.subtype === 'instant')) return reject(state, 'NOT_YOUR_ACTION', '当前不能使用该卡牌');
    if (!canPay(next, player, card.cardId)) return reject(state, 'ILLEGAL_ACTION', '费用或属性条件不满足');
    const payment = selectedPayment(next, player, card.cardId, command.paymentIds);
    if (!payment) return reject(state, 'ILLEGAL_ACTION', '请选择符合费用和属性要求的费用牌');
    pay(player, payment);
    player.hand.splice(index, 1);
    card.face = 'up';
    if (definition.signal) {
      player.signals.push(card);
      drawOne(next, player, rng);
    } else if (definition.type === 'character' || definition.subtype === 'support') {
      const slot = command.fieldSlot ?? player.field.findIndex((item) => item === null);
      if (slot < 0 || slot >= 5 || player.field[slot]) return reject(state, 'ILLEGAL_ACTION', '没有合法战场卡位');
      player.field[slot] = { ...card, enteredTurn: next.turn };
    } else if (definition.subtype === 'equipment' && command.targetSlot !== undefined && command.targetSlot >= 0 && player.field[command.targetSlot]) {
      const target = player.field[command.targetSlot]!;
      if (target.attached?.length) return reject(state, 'ILLEGAL_ACTION', '该角色已经装备了道具');
      target.attached = [card];
    } else if (definition.subtype === 'equipment') {
      const slot = command.fieldSlot ?? player.field.findIndex((item) => item === null);
      if (slot < 0 || slot >= 5 || player.field[slot]) return reject(state, 'ILLEGAL_ACTION', '没有合法装备位置');
      player.field[slot] = { ...card, enteredTurn: next.turn };
    } else player.graveyard.push(card);
    if (definition.effectIds.includes('enter_draw_discard')) {
      drawOne(next, player, rng);
      const discarded = player.hand.pop();
      if (discarded) player.graveyard.push(discarded);
    }
    if (definition.effectIds.includes('enter_swap_energy')) {
      const energyIndex = player.energy.findIndex((item) => item.face === 'up');
      if (energyIndex >= 0 && player.deck.length > 0) {
        const [returned] = player.energy.splice(energyIndex, 1);
        player.hand.push({ ...returned!, face: 'up', rested: false });
        const charged = player.deck.shift()!;
        player.energy.push({ ...charged, face: 'up', rested: true });
      }
    }
    if (definition.effectIds.includes('enter_recover_blue')) {
      const graveIndex = player.graveyard.findIndex((item) => definitionFor(next, item.cardId).signal === 'blue');
      if (graveIndex >= 0) player.signals.push(...player.graveyard.splice(graveIndex, 1));
    }
    if (definition.effectIds.includes('corruption_draw') && next.events.some((event) => event.createdAtTurn === next.turn && event.playerId === player.id && (event.type === 'damage' || event.type === 'deck-refresh'))) {
      drawOne(next, player, rng);
    }
    addEvent(next, 'play-card', player.id, `${player.id} 使用了《${definition.name}》`);
    if (next.pendingAttack) {
      next.pendingAttack.priorityPlayerId = opponentId(next, command.playerId);
      next.pendingAttack.consecutivePasses = 0;
    }
  } else if (command.type === 'ELIMINATE_SIGNALS' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    if (command.startIndex < 0 || command.startIndex + 2 >= player.signals.length) return reject(state, 'ILLEGAL_ACTION', '必须消除三张相邻信号球');
    const removed = player.signals.splice(command.startIndex, 3);
    player.graveyard.push(...removed);
    drawOne(next, player, rng);
    addEvent(next, 'signals-eliminated', player.id, `${player.id} 消除三张相邻信号球并抽1张牌`);
  } else if (command.type === 'DECLARE_ATTACK' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    const attacker = player.field[command.attackerSlot];
    if (!attacker || attacker.rested || (attacker.enteredTurn === next.turn && !isHaste(next, attacker))) return reject(state, 'ILLEGAL_ACTION', '该角色不能攻击');
    if (command.target === 'character') {
      const target = next.players[opponentId(next, player.id)]!.field[command.targetSlot ?? -1];
      if (!target?.rested) return reject(state, 'ILLEGAL_ACTION', '只能攻击横置角色');
    }
    attacker.rested = true;
    next.pendingAttack = {
      attackerSlot: command.attackerSlot,
      target: command.target,
      ...(command.targetSlot === undefined ? {} : { targetSlot: command.targetSlot }),
      priorityPlayerId: opponentId(next, player.id),
      consecutivePasses: 0,
    };
    addEvent(next, 'attack-declared', player.id, `${player.id} 宣言攻击`);
  } else if (command.type === 'BLOCK' && next.pendingAttack?.priorityPlayerId === command.playerId && command.playerId !== next.activePlayerId) {
    const blocker = player.field[command.blockerSlot];
    if (!blocker || blocker.rested) return reject(state, 'ILLEGAL_ACTION', '该角色不能阻挡');
    blocker.rested = true;
    next.pendingAttack.blockerSlot = command.blockerSlot;
    next.pendingAttack.priorityPlayerId = next.activePlayerId;
    next.pendingAttack.consecutivePasses = 0;
    addEvent(next, 'block', player.id, `${player.id} 进行了阻挡`);
  } else if (command.type === 'PASS_RESPONSE' && next.pendingAttack?.priorityPlayerId === command.playerId) {
    next.pendingAttack.consecutivePasses += 1;
    next.pendingAttack.priorityPlayerId = opponentId(next, command.playerId);
    if (next.pendingAttack.consecutivePasses >= 2) resolveAttack(next, rng);
  } else if (command.type === 'END_PHASE' && next.phase === 'main' && next.activePlayerId === command.playerId && !next.pendingAttack) {
    for (let i = player.energy.length - 1; i >= 0; i -= 1) {
      if (player.energy[i]!.face === 'down') player.graveyard.push(...player.energy.splice(i, 1));
    }
    while (player.hand.length > 7) player.graveyard.push(player.hand.pop()!);
    for (const card of player.field) if (card) { delete card.temporaryPp; delete card.temporaryDp; }
    next.activePlayerId = opponentId(next, command.playerId);
    next.phase = 'upright';
    next.turn += 1;
    addEvent(next, 'turn-ended', command.playerId, `${command.playerId} 结束回合`);
  } else {
    return reject(state, 'ILLEGAL_ACTION', '该操作当前不可执行');
  }

  next.version += 1;
  next.processedCommandIds.push(command.commandId);
  checkDefeat(next);
  return {
    accepted: true,
    state: next,
    legalActions: getLegalActions(next, command.playerId),
    emittedEvents: next.events.slice(emittedBefore),
  };
};

export type { GameCommand, GameResult, GameState, PlayerView } from '@pgr/protocol';
