import type { EffectFrame, GameState, PendingDecision, PlayerState } from '@pgr/protocol';

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
      if (player.signals.length < 2) return 'done';
      const decision: PendingDecision = {
        id: `${frame.id}:reorder:${frame.actionIndex}`,
        frameId: frame.id,
        playerId: frame.controllerId,
        kind: 'order-cards',
        purpose: 'action',
        prompt: '请按从下到上的顺序排列信号球',
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
  return 'done';
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
