import type { CardInstance, EffectFrame, GameState, PendingDecision, PlayerId, PlayerState } from '@pgr/protocol';

const cardOptions = (state: GameState, cards: CardInstance[]) => cards.map((card) => ({
  id: card.instanceId,
  instanceId: card.instanceId,
  cardId: card.cardId,
  label: state.cardDefinitions[card.cardId]?.name ?? card.cardId,
}));

const waitForCards = (
  state: GameState,
  frame: EffectFrame,
  id: string,
  prompt: string,
  cards: CardInstance[],
  min: number,
  max: number,
  kind: PendingDecision['kind'] = 'select-cards',
): 'waiting' => {
  state.pendingDecision = {
    id: `${frame.id}:${id}`,
    frameId: frame.id,
    playerId: frame.controllerId,
    kind,
    purpose: 'action',
    prompt,
    min,
    max,
    targetId: id,
    options: cardOptions(state, cards),
  };
  frame.status = 'waiting-for-decision';
  return 'waiting';
};

export const executeCurrentCardCustomAction = (
  state: GameState,
  frame: EffectFrame,
  handlerId: string,
): 'done' | 'waiting' => {
  const player = state.players[frame.controllerId]!;
  if (handlerId === 'charge_top_rested') {
    const card = player.deck.shift();
    if (card) player.energy.push({ ...card, face: 'up', rested: true });
    return 'done';
  }
  if (handlerId === 'reorder_signals') {
    const targetId = `action:${frame.actionIndex}`;
    const selected = frame.selectedTargets[targetId];
    if (!selected) {
      const decision: PendingDecision = {
        id: `${frame.id}:reorder:${frame.actionIndex}`,
        frameId: frame.id,
        playerId: frame.controllerId,
        kind: 'order-cards',
        purpose: 'action',
        prompt: player.signals.length ? '排列信号球（从前到后）' : '信号球区为空，确认后继续',
        min: player.signals.length,
        max: player.signals.length,
        targetId,
        options: player.signals.map((card) => ({
          id: card.instanceId,
          instanceId: card.instanceId,
          cardId: card.cardId,
          label: state.cardDefinitions[card.cardId]?.name ?? card.cardId,
        })),
      };
      state.pendingDecision = decision;
      frame.status = 'waiting-for-decision';
      return 'waiting';
    }
    const byId = new Map(player.signals.map((card) => [card.instanceId, card]));
    player.signals = selected.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
    return 'done';
  }
  if (handlerId === 'search_top_five_gray_raven') {
    const poolKey = `search:${frame.actionIndex}:pool`;
    const pickKey = `search:${frame.actionIndex}:pick`;
    const playedKey = `search:${frame.actionIndex}:played`;
    const orderKey = `search:${frame.actionIndex}:order`;
    if (!frame.selectedTargets[poolKey]) {
      const revealed = player.deck.splice(0, 5).map((card) => ({ ...card, face: 'up' as const, mode: 'revealed' as const }));
      player.processing.push(...revealed);
      frame.selectedTargets[poolKey] = revealed.map((card) => card.instanceId);
    }
    const pool = frame.selectedTargets[poolKey]!.flatMap((id) => player.processing.find((card) => card.instanceId === id) ?? []);
    if (!frame.selectedTargets[pickKey]) {
      const candidates = pool.filter((card) => {
        const definition = state.cardDefinitions[card.cardId];
        return definition?.type === 'character' && definition.cost <= 3 && definition.traits.includes('灰鸦小队');
      });
      if (candidates.length > 0) return waitForCards(state, frame, pickKey, '选择 1 张费用 3 以下的灰鸦小队角色出场', candidates, 1, 1);
      frame.selectedTargets[pickKey] = [];
    }
    if (!frame.selectedTargets[playedKey]) {
      const chosenId = frame.selectedTargets[pickKey]![0];
      if (chosenId) {
        const processingIndex = player.processing.findIndex((card) => card.instanceId === chosenId);
        const slot = player.field.findIndex((card) => card === null);
        if (processingIndex >= 0 && slot >= 0) {
          const [chosen] = player.processing.splice(processingIndex, 1);
          delete chosen!.mode;
          player.field[slot] = { ...chosen!, enteredTurn: state.turn };
        }
      }
      frame.selectedTargets[playedKey] = ['done'];
    }
    const remaining = frame.selectedTargets[poolKey]!.flatMap((id) => player.processing.find((card) => card.instanceId === id) ?? []);
    if (!frame.selectedTargets[orderKey] && remaining.length > 1) {
      return waitForCards(state, frame, orderKey, '排列其余卡牌放到牌组底', remaining, remaining.length, remaining.length, 'order-cards');
    }
    const orderedIds = frame.selectedTargets[orderKey] ?? remaining.map((card) => card.instanceId);
    for (const id of orderedIds) {
      const index = player.processing.findIndex((card) => card.instanceId === id);
      if (index >= 0) {
        const [remainingCard] = player.processing.splice(index, 1);
        delete remainingCard!.mode;
        player.deck.push({ ...remainingCard!, face: 'down' });
      }
    }
    return 'done';
  }
  if (handlerId === 'lucia_blue_activated') {
    const signalKey = `lucia:${frame.actionIndex}:signals`;
    const paidKey = `lucia:${frame.actionIndex}:paid`;
    const returnKey = `lucia:${frame.actionIndex}:return`;
    const returnedKey = `lucia:${frame.actionIndex}:returned`;
    const playKey = `lucia:${frame.actionIndex}:play`;
    if (!frame.selectedTargets[signalKey]) {
      const blue = player.signals.filter((card) => state.cardDefinitions[card.cardId]?.signal === 'blue'
        || state.continuousModifiers.some((modifier) => modifier.kind === 'signal-as' && modifier.value === 'blue' && modifier.targetInstanceIds.includes(card.instanceId)));
      return waitForCards(state, frame, signalKey, '选择 3 张相邻蓝色信号球', blue, 3, 3);
    }
    if (!frame.selectedTargets[paidKey]) {
      const indexes = frame.selectedTargets[signalKey]!.map((id) => player.signals.findIndex((card) => card.instanceId === id)).sort((a, b) => a - b);
      if (indexes.some((index) => index < 0) || indexes[2]! - indexes[0]! !== 2) return 'done';
      for (const id of frame.selectedTargets[signalKey]!) {
        const index = player.signals.findIndex((card) => card.instanceId === id);
        player.graveyard.push(...player.signals.splice(index, 1));
      }
      frame.selectedTargets[paidKey] = ['done'];
    }
    if (!frame.selectedTargets[returnKey]) {
      const fieldCards = player.field.filter((card): card is CardInstance => card !== null);
      return waitForCards(state, frame, returnKey, '选择我方战场 1 张角色返回手牌', fieldCards, 1, 1);
    }
    if (!frame.selectedTargets[returnedKey]) {
      const returnedId = frame.selectedTargets[returnKey]![0];
      const slot = player.field.findIndex((card) => card?.instanceId === returnedId);
      if (slot >= 0) {
        const returned = player.field[slot]!;
        player.field[slot] = null;
        player.hand.push({ ...returned, face: 'up', rested: false });
      }
      frame.selectedTargets[returnedKey] = ['done'];
    }
    if (!frame.selectedTargets[playKey]) {
      const candidates = player.hand.filter((card) => {
        const definition = state.cardDefinitions[card.cardId];
        return definition?.type === 'character' && definition.cost <= 4 && definition.traits.includes('灰鸦小队');
      });
      return waitForCards(state, frame, playKey, '选择 1 张费用 4 以下的灰鸦小队角色出场', candidates, 1, 1);
    }
    const chosenId = frame.selectedTargets[playKey]![0];
    const handIndex = player.hand.findIndex((card) => card.instanceId === chosenId);
    const slot = player.field.findIndex((card) => card === null);
    if (handIndex >= 0 && slot >= 0) {
      const [chosen] = player.hand.splice(handIndex, 1);
      player.field[slot] = { ...chosen!, enteredTurn: state.turn };
    }
    return 'done';
  }
  if (handlerId === 'triple_signal') {
    const targetIds = frame.selectedTargets.tripled ?? [];
    state.continuousModifiers.push({
      id: `${frame.id}:triple-signal`, sourceInstanceId: frame.sourceInstanceId, controllerId: frame.controllerId,
      kind: 'signal-as', targetInstanceIds: [...targetIds], value: 'same-color', count: 3,
      duration: { kind: 'turn' }, createdTurn: state.turn,
    });
    return 'done';
  }
  return 'done';
};

export const applyQuProcessingReplacement = (state: GameState, playerId: PlayerId, instanceId: string): boolean => {
  const player = state.players[playerId];
  if (!player) return false;
  const index = player.processing.findIndex((card) => card.instanceId === instanceId && card.cardId === 'BP01-037');
  if (index < 0 || player.energy.length >= 10) return false;
  const [card] = player.processing.splice(index, 1);
  player.energy.push({ ...card!, face: 'up', rested: true });
  return true;
};

export const conditionalTeamPpBonus = (state: GameState, player: PlayerState, cardId: string): number => {
  if (cardId !== 'PR-004') return 0;
  const names = player.field.flatMap((card) => card ? [state.cardDefinitions[card.cardId]?.name ?? ''] : []);
  return names.some((name) => name.includes('里')) && names.some((name) => name.includes('丽芙')) ? 1000 : 0;
};

export const conditionalFloatingDp = (state: GameState, player: PlayerState, cardId: string, baseDp: number): number => {
  if (cardId !== 'BP03-009') return baseDp;
  return player.processing.some((card) => card.mode === 'floating') ? 1 : baseDp;
};

export const blueDiscountSignals = (state: GameState, player: PlayerState): string[] => player.signals
  .filter((card) => state.cardDefinitions[card.cardId]?.signal === 'blue')
  .map((card) => card.instanceId);
