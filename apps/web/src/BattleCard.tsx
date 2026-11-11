import { getCardDefinition } from '@pgr/cards';
import type { CardInstance, PublicCardView } from '@pgr/protocol';
import { BattleCardArt } from './BattleCardArt.js';
export type ViewCard = PublicCardView | CardInstance;
export const cardName = (card: ViewCard): string => card.cardId ? getCardDefinition(card.cardId).name : '隐藏费用牌';
export function MiniCard({ card, selected, legal, onClick }: { card: ViewCard; selected?: boolean; legal?: boolean; onClick?: () => void }) {
  const definition = card.cardId ? getCardDefinition(card.cardId) : null;
  const pp = 'effectivePp' in card && card.effectivePp !== undefined ? card.effectivePp : definition?.pp;
  const dp = 'effectiveDp' in card && card.effectiveDp !== undefined ? card.effectiveDp : definition?.dp;
  return <button data-card-view={card.instanceId} className={`mini-card ${selected ? 'selected' : ''} ${legal ? 'legal' : ''} ${card.rested ? 'rested' : ''}`} onClick={onClick} disabled={!onClick} title={cardName(card)}>
    <span className="card-cost">{definition?.cost ?? '?'}</span><span className="card-art"><BattleCardArt key={card.cardId} cardId={card.cardId} /></span>
    <strong>{definition?.name ?? '隐藏卡牌'}</strong>{definition?.type === 'character' && <small>PP {pp} · DP {dp}</small>}
  </button>;
}
