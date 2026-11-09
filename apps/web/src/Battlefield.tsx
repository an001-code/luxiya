import { useMemo, useState } from 'react';
import { getCardDefinition } from '@pgr/cards';
import type { CardInstance, LegalAction, PlayerBoardView, PlayerView, PublicCardView } from '@pgr/protocol';

interface BattlefieldProps {
  view: PlayerView;
  onCommand: (action: LegalAction) => void;
}

const phaseNames = { mulligan: '起手调度', upright: '竖直阶段', draw: '抽牌阶段', energy: '费用填充', main: '主要阶段', end: '结束阶段' };

const cardName = (card: PublicCardView | CardInstance): string => card.cardId ? getCardDefinition(card.cardId).name : '暗费';

function MiniCard({ card, selected, legal, onClick }: { card: PublicCardView | CardInstance; selected?: boolean; legal?: boolean; onClick?: () => void }) {
  const definition = card.cardId ? getCardDefinition(card.cardId) : null;
  return (
    <button className={`mini-card ${selected ? 'selected' : ''} ${legal ? 'legal' : ''} ${card.rested ? 'rested' : ''}`} onClick={onClick} disabled={!onClick} title={cardName(card)}>
      <span className="card-cost">{definition?.cost ?? '?'}</span>
      <span className="card-art">{definition ? definition.name.slice(0, 1) : '◆'}</span>
      <strong>{definition?.name ?? '隐藏卡牌'}</strong>
      {definition?.type === 'character' && <small>PP {definition.pp} · DP {definition.dp}</small>}
    </button>
  );
}

function ResourcePanel({ board, side, onEliminate }: { board: PlayerBoardView; side: 'opponent' | 'self'; onEliminate?: () => void }) {
  const title = side === 'self' ? '我方' : '对手';
  return (
    <section className={`resource-panel ${side}`}>
      <header><strong>{title}资源</strong><span>侵蚀 {board.corruption}/7</span></header>
      <h3>{title}信号球区</h3>
      <div className="signal-grid">
        {Array.from({ length: 6 }, (_, index) => {
          const card = board.signals[index];
          const signal = card?.cardId ? getCardDefinition(card.cardId).signal : null;
          return <div className={`signal-slot ${signal ?? ''}`} key={index} data-signal-slot={index}>{card ? signal?.slice(0, 1).toUpperCase() : index + 1}</div>;
        })}
      </div>
      {onEliminate && <button className="eliminate-signals" onClick={onEliminate}>三消前3张 · 抽1张</button>}
      <h3>{title}费用区 {board.energy.length}/10</h3>
      <div className="energy-grid">
        {Array.from({ length: 10 }, (_, index) => {
          const card = board.energy[index];
          return <div className={`energy-slot ${card?.rested ? 'rested' : ''} ${card?.face === 'down' ? 'facedown' : ''}`} key={index} data-energy-slot={index}>{card ? (card.cardId ? getCardDefinition(card.cardId).attribute.slice(0, 2) : '暗') : '+'}</div>;
        })}
      </div>
    </section>
  );
}

function FieldRow({ board, side, onCard }: { board: PlayerBoardView; side: 'opponent' | 'self'; onCard?: (index: number, card: PublicCardView) => void }) {
  return (
    <div className={`field-row ${side}`}>
      <div className="deck-pile"><span>牌组</span><strong>{board.deck.count}</strong></div>
      {board.field.map((card, index) => (
        <div className="field-slot" data-field-slot={`${side}-${index}`} key={index}>
          {card ? <MiniCard card={card} {...(onCard ? { onClick: () => onCard(index, card) } : {})} /> : <span>A{index + 1}</span>}
        </div>
      ))}
      <div className="grave-pile"><span>墓地</span><strong>{board.graveyard.length}</strong></div>
    </div>
  );
}

export function Battlefield({ view, onCommand }: BattlefieldProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mulliganIds, setMulliganIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'detail' | 'log' | 'grave'>('detail');
  const selected = useMemo(() => {
    const cards = view.self.hand as CardInstance[];
    return cards.find((card) => card.instanceId === selectedId)
      ?? view.self.field.find((card) => card?.instanceId === selectedId)
      ?? view.self.graveyard.find((card) => card.instanceId === selectedId)
      ?? null;
  }, [selectedId, view]);
  const playableIds = new Set(view.legalActions.filter((action): action is Extract<LegalAction, { type: 'PLAY_CARD' }> => action.type === 'PLAY_CARD').map((action) => action.instanceId));
  const isMine = view.activePlayerId === view.viewerId;

  const primaryAction = () => {
    if (view.phase === 'mulligan') onCommand({ type: 'MULLIGAN', instanceIds: mulliganIds });
    else if (view.pendingAttack) onCommand({ type: 'PASS_RESPONSE' });
    else if (view.phase === 'upright' || view.phase === 'draw') onCommand({ type: 'ADVANCE_PHASE' });
    else if (view.phase === 'energy') onCommand(selectedId ? { type: 'SET_ENERGY', instanceId: selectedId } : { type: 'SET_ENERGY' });
    else if (view.phase === 'main') onCommand({ type: 'END_PHASE' });
  };

  const actionLabel = view.phase === 'mulligan' ? `确认调度 (${mulliganIds.length})` : view.pendingAttack ? '不响应' : view.phase === 'energy' ? (selectedId ? '放置为费用' : '跳过填充') : view.phase === 'main' ? '结束阶段' : '推进阶段';

  return (
    <main className="battlefield-shell">
      <div className="arena-backdrop" />
      {view.status === 'finished' && <div className="result-overlay"><section><small>对局结束</small><h1>{view.winnerId === view.viewerId ? '胜利' : view.winnerId ? '败北' : '平局'}</h1><p>本局记录已保留在右侧回合记录中。</p></section></div>}
      <aside className="resource-rail"><ResourcePanel board={view.opponent} side="opponent" /><ResourcePanel board={view.self} side="self" {...(view.legalActions.some((action) => action.type === 'ELIMINATE_SIGNALS') ? { onEliminate: () => onCommand(view.legalActions.find((action): action is Extract<LegalAction, { type: 'ELIMINATE_SIGNALS' }> => action.type === 'ELIMINATE_SIGNALS')!) } : {})} /></aside>
      <section className="battle-center">
        <div className="opponent-hand"><span>对手手牌</span><strong>{'count' in view.opponent.hand ? view.opponent.hand.count : view.opponent.hand.length}</strong><div className="card-backs">{Array.from({ length: Math.min(7, 'count' in view.opponent.hand ? view.opponent.hand.count : 0) }, (_, index) => <i key={index} />)}</div></div>
        <FieldRow board={view.opponent} side="opponent" />
        <section className="action-console">
          <div><small>第 {view.turn} 回合</small><strong>{isMine ? '我方行动' : '对手行动'} · {phaseNames[view.phase]}</strong></div>
          <div className="current-action"><span>当前行动</span><b>{view.pendingAttack ? '攻击响应窗口' : '等待指令'}</b></div>
          <div className="response-stack"><span>响应堆栈</span><b>{view.pendingAttack ? '可响应' : '空'}</b></div>
          <button className="primary-action" onClick={primaryAction} disabled={!view.legalActions.some((action) => ['MULLIGAN', 'PASS_RESPONSE', 'ADVANCE_PHASE', 'SET_ENERGY', 'END_PHASE'].includes(action.type))}>{actionLabel}</button>
        </section>
        <FieldRow board={view.self} side="self" onCard={(index, card) => {
          setSelectedId(card.instanceId);
          const attack = view.legalActions.find((action): action is Extract<LegalAction, { type: 'DECLARE_ATTACK' }> => action.type === 'DECLARE_ATTACK' && action.attackerSlot === index && action.target === 'player');
          const block = view.legalActions.find((action): action is Extract<LegalAction, { type: 'BLOCK' }> => action.type === 'BLOCK' && action.blockerSlot === index);
          if (block) onCommand(block); else if (attack) onCommand(attack);
        }} />
        <div className="hand-zone">
          <span className="hand-count">手牌 {Array.isArray(view.self.hand) ? view.self.hand.length : 0}</span>
          <div className="hand-cards">
            {(view.self.hand as CardInstance[]).map((card) => <MiniCard key={card.instanceId} card={card} selected={view.phase === 'mulligan' ? mulliganIds.includes(card.instanceId) : selectedId === card.instanceId} legal={playableIds.has(card.instanceId)} onClick={() => {
              if (view.phase === 'mulligan') setMulliganIds((ids) => ids.includes(card.instanceId) ? ids.filter((id) => id !== card.instanceId) : [...ids, card.instanceId]);
              else setSelectedId(card.instanceId);
            }} />)}
          </div>
          {selectedId && playableIds.has(selectedId) && <button className="play-card" onClick={() => {
            const handCard = (view.self.hand as CardInstance[]).find((card) => card.instanceId === selectedId);
            const definition = handCard ? getCardDefinition(handCard.cardId) : null;
            if (definition?.subtype === 'equipment') {
              const targetSlot = view.self.field.findIndex((card) => card?.cardId && getCardDefinition(card.cardId).type === 'character');
              if (targetSlot >= 0) onCommand({ type: 'PLAY_CARD', instanceId: selectedId, targetSlot });
              else onCommand({ type: 'PLAY_CARD', instanceId: selectedId, fieldSlot: view.self.field.findIndex((card) => card === null) });
            } else {
              onCommand({ type: 'PLAY_CARD', instanceId: selectedId, fieldSlot: view.self.field.findIndex((card) => card === null) });
            }
          }}>使用卡牌</button>}
        </div>
      </section>
      <aside className="inspector">
        <nav>
          <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>卡牌详情</button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>回合记录</button>
          <button className={tab === 'grave' ? 'active' : ''} onClick={() => setTab('grave')}>墓地</button>
        </nav>
        {tab === 'detail' && <div className="detail-panel">{selected?.cardId ? <><div className="detail-art">{cardName(selected).slice(0, 1)}</div><h2>{cardName(selected)}</h2><div className="tags"><span>费用 {getCardDefinition(selected.cardId).cost}</span><span>{getCardDefinition(selected.cardId).attribute}</span></div>{getCardDefinition(selected.cardId).text.map((line) => <p key={line}>{line}</p>)}</> : <p className="empty-copy">选择一张卡牌查看详情</p>}</div>}
        {tab === 'log' && <ol className="turn-log">{[...view.events].reverse().map((event) => <li key={event.id}><small>回合 {event.createdAtTurn}</small><p>{event.message}</p></li>)}</ol>}
        {tab === 'grave' && <div className="grave-tabs"><h3>我方墓地 · {view.self.graveyard.length}</h3>{view.self.graveyard.map((card) => <button key={card.instanceId} onClick={() => setSelectedId(card.instanceId)}>{cardName(card)}</button>)}<h3>对手墓地 · {view.opponent.graveyard.length}</h3>{view.opponent.graveyard.map((card) => <span key={card.instanceId}>{cardName(card)}</span>)}</div>}
        <button className="concede" onClick={() => onCommand({ type: 'CONCEDE' })}>认输</button>
      </aside>
    </main>
  );
}
