import { useEffect, useRef, useState } from 'react';
import type { CardInstance, PlayerView } from '@pgr/protocol';
import { BattleCardArt } from './BattleCardArt.js';

interface Motion { id: string; side: 'self' | 'opponent'; kind: 'draw' | 'discard'; count: number; cardId?: string }
const count = (hand: PlayerView['self']['hand']) => Array.isArray(hand) ? hand.length : hand.count;

export function BattleMotion({ view }: { view: PlayerView }) {
  const previous = useRef<PlayerView | null>(null);
  const [motions, setMotions] = useState<Motion[]>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    const next: Motion[] = [];
    if (!before || before.gameId !== view.gameId) {
      if (count(view.self.hand)) next.push({ id: `${view.gameId}-opening`, side: 'self', kind: 'draw', count: count(view.self.hand) });
    } else if (before.version !== view.version) {
      for (const side of ['self', 'opponent'] as const) {
        const old = before[side]; const current = view[side];
        const added = side === 'self'
          ? (current.hand as CardInstance[]).filter((card) => !(old.hand as CardInstance[]).some((entry) => entry.instanceId === card.instanceId)).length
          : Math.max(0, count(current.hand) - count(old.hand));
        if (added) next.push({ id: `${view.version}-${side}-draw`, side, kind: 'draw', count: added });
        const publicBefore = [...old.graveyard, ...old.processing, ...old.energy, ...old.signals, ...old.field.filter(Boolean)];
        const discarded = current.graveyard.filter((card) => !publicBefore.some((entry) => entry?.instanceId === card.instanceId)
          && (side === 'opponent' || (old.hand as CardInstance[]).some((entry) => entry.instanceId === card.instanceId)));
        if (discarded.length) next.push({ id: `${view.version}-${side}-discard`, side, kind: 'discard', count: discarded.length, ...(discarded[0]?.cardId ? { cardId: discarded[0].cardId } : {}) });
      }
    }
    if (!next.length) return;
    setMotions(next);
  }, [view.gameId, view.version]);
  useEffect(() => {
    if (!motions.length) return;
    const timer = setTimeout(() => setMotions([]), 1600);
    return () => clearTimeout(timer);
  }, [motions]);
  return <div className="battle-motion-layer" aria-live="polite" aria-atomic="true">{motions.map((motion) => <div key={motion.id} className={`card-motion ${motion.side} ${motion.kind}`} data-card-motion={motion.kind}>
    <span className="motion-ghost"><BattleCardArt key={motion.cardId ?? 'hidden'} cardId={motion.cardId ?? null} /></span>
    <strong>{motion.side === 'self' ? '我方' : '对手'}{motion.kind === 'draw' ? '抽牌' : '弃牌'} ×{motion.count}</strong>
  </div>)}</div>;
}
