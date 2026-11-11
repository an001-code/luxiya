import { useState } from 'react';
import { getCardDefinition } from '@pgr/cards';
import type { LegalAction, PlayerView } from '@pgr/protocol';
import { BattleDialog } from './BattleDialog.js';
import { BattleCardArt } from './BattleCardArt.js';

export function OrderCardsDialog({ decision, onCommand }: {
  decision: NonNullable<PlayerView['pendingDecision']>;
  onCommand: (action: LegalAction) => void;
}) {
  const [order, setOrder] = useState(() => decision.options.flatMap((option) => option.instanceId ? [option.instanceId] : []));
  const [dragged, setDragged] = useState<string | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const move = (id: string, destination: number) => setOrder((current) => {
    const from = current.indexOf(id);
    if (from < 0 || destination < 0 || destination >= current.length) return current;
    const next = [...current];
    next.splice(from, 1);
    next.splice(destination, 0, id);
    return next;
  });
  const selected = decision.options.find((option) => option.instanceId === inspected);
  return <BattleDialog title={decision.prompt}>
    <p className="battle-dialog-hint">拖动卡牌调整顺序，或使用前移、后移按钮。序号即确认后的排列顺序。</p>
    <section data-effect-decision={decision.id}>
      {order.length ? <ol className="ordered-card-list">{order.map((id, index) => {
        const option = decision.options.find((entry) => entry.instanceId === id)!;
        return <li key={id} draggable onDragStart={(event) => { setDragged(id); event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => setDragged(null)} onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); const source = dragged ?? event.dataTransfer.getData('text/plain'); if (source) move(source, index); setDragged(null); }}>
          <span className="order-position">{index + 1}</span>
          <button className="ordered-card-face" data-decision-option={option.id} onClick={() => setInspected(id)} aria-label={`查看 ${option.label}`}><BattleCardArt cardId={option.cardId ?? null} /><strong>{option.label}</strong></button>
          <div className="order-controls"><button aria-label={`将 ${option.label} 前移`} disabled={index === 0} onClick={() => move(id, index - 1)}>← 前移</button><button aria-label={`将 ${option.label} 后移`} disabled={index === order.length - 1} onClick={() => move(id, index + 1)}>后移 →</button></div>
        </li>;
      })}</ol> : <p>当前没有需要排列的卡牌。</p>}
      <p className="order-announcement" aria-live="polite">当前顺序：{order.map((id) => decision.options.find((option) => option.instanceId === id)?.label).join(' → ') || '空'}</p>
      {selected?.cardId && <OrderCardDetails cardId={selected.cardId} />}
    </section>
    <footer><button className="primary-action" disabled={order.length < decision.min || order.length > decision.max} onClick={() => onCommand({ type: 'RESOLVE_EFFECT_DECISION', decisionId: decision.id, selectedInstanceIds: order })}>确认顺序</button></footer>
  </BattleDialog>;
}

function OrderCardDetails({ cardId }: { cardId: string }) {
  const definition = getCardDefinition(cardId);
  return <section className="decision-card-rules"><h3>{definition.name}</h3>{definition.text.map((line, index) => <p key={index}>{line}</p>)}</section>;
}
