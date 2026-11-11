import { useState } from 'react';
import { getCardDefinition } from '@pgr/cards';
import { cardImageUrl } from './api.js';

export function BattleCardArt({ cardId }: { cardId: string | null }) {
  const [fallback, setFallback] = useState(0);
  if (!cardId) return <span className="battle-card-back" aria-label="隐藏卡牌">◆</span>;
  const definition = getCardDefinition(cardId);
  const source = fallback === 0 ? cardImageUrl(cardId) : definition.artPath;
  return fallback < 2 && source ? <img className="battle-card-image" src={source} alt={definition.name} draggable={false} onError={() => setFallback((value) => value + 1)} />
    : <span className="battle-art-placeholder">{definition.name.slice(0, 1)}</span>;
}
