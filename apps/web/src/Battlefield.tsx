import { useEffect, useMemo, useState } from 'react';
import { getCardDefinition } from '@pgr/cards';
import type { CardInstance, LegalAction, PlayerBoardView, PlayerView, PublicCardView } from '@pgr/protocol';

interface BattlefieldProps {
  view: PlayerView;
  onCommand: (action: LegalAction) => void;
}

type ViewCard = PublicCardView | CardInstance;
type FieldAction = Extract<LegalAction, { type: 'DECLARE_ATTACK' | 'BLOCK' }>;

const phaseNames = { mulligan: '起手调度', upright: '竖直阶段', draw: '抽牌阶段', energy: '费用填充', main: '主要阶段', end: '结束阶段' };

const cardName = (card: ViewCard): string => card.cardId ? getCardDefinition(card.cardId).name : '隐藏费用牌';

function MiniCard({ card, selected, legal, onClick }: { card: ViewCard; selected?: boolean; legal?: boolean; onClick?: () => void }) {
  const definition = card.cardId ? getCardDefinition(card.cardId) : null;
  const displayedPp = 'effectivePp' in card && card.effectivePp !== undefined ? card.effectivePp : definition?.pp;
  const displayedDp = 'effectiveDp' in card && card.effectiveDp !== undefined ? card.effectiveDp : definition?.dp;
  return (
    <button data-card-view={card.instanceId} className={`mini-card ${selected ? 'selected' : ''} ${legal ? 'legal' : ''} ${card.rested ? 'rested' : ''}`} onClick={onClick} disabled={!onClick} title={cardName(card)}>
      <span className="card-cost">{definition?.cost ?? '?'}</span>
      <span className="card-art">{definition ? definition.name.slice(0, 1) : '◆'}</span>
      <strong>{definition?.name ?? '隐藏卡牌'}</strong>
      {definition?.type === 'character' && <small>PP {displayedPp} · DP {displayedDp}</small>}
    </button>
  );
}

function ResourcePanel({ board, side, onView, onPayment, paymentIds, onEliminate }: {
  board: PlayerBoardView;
  side: 'opponent' | 'self';
  onView: (card: ViewCard) => void;
  onPayment?: (card: PublicCardView) => void;
  paymentIds: Set<string>;
  onEliminate?: () => void;
}) {
  const signalSlots = Math.max(12, board.signals.length);
  return (
    <section className={`resource-panel ${side}`} aria-label={side === 'self' ? '蓝方资源' : '红方资源'}>
      <h3>信号球区 <em>{board.signals.length}</em></h3>
      <div className="signal-grid">
        {Array.from({ length: signalSlots }, (_, index) => {
          const card = board.signals[index];
          const definition = card?.cardId ? getCardDefinition(card.cardId) : null;
          const signal = definition?.signal ?? null;
          return card ? (
            <button data-card-view={card.instanceId} className={`signal-slot ${signal ?? ''}`} key={card.instanceId} data-signal-slot={index} onClick={() => onView(card)} title={cardName(card)}>
              <span className="resource-card-cost">{definition?.cost ?? '?'}</span><b className="resource-card-art">{definition?.name.slice(0, 1) ?? '◆'}</b><strong>{definition?.name ?? '隐藏卡牌'}</strong><small>{index + 1}</small>
            </button>
          ) : <div className="signal-slot empty" key={index} data-signal-slot={index}><small>{index + 1}</small></div>;
        })}
      </div>
      {onEliminate && <button className="eliminate-signals" onClick={onEliminate}>三消前3张 · 抽1张</button>}
      <h3>费用区 {board.energy.length}/10</h3>
      <div className="energy-grid">
        {Array.from({ length: 10 }, (_, index) => {
          const card = board.energy[index];
          if (!card) return <div className="energy-slot empty" key={index} data-energy-slot={index}><span>+</span></div>;
          const selectable = Boolean(onPayment && !card.rested);
          const definition = card.cardId ? getCardDefinition(card.cardId) : null;
          return <button data-card-view={card.instanceId} className={`energy-slot ${card.rested ? 'rested' : ''} ${card.face === 'down' ? 'facedown' : ''} ${selectable ? 'pay-selectable' : ''} ${paymentIds.has(card.instanceId) ? 'payment-selected' : ''}`} key={card.instanceId} data-energy-slot={index} onClick={() => { onView(card); onPayment?.(card); }} title={cardName(card)}><span className="resource-card-cost">{definition?.cost ?? '?'}</span><b className="resource-card-art">{definition?.name.slice(0, 1) ?? '◆'}</b><strong>{definition?.attribute.slice(0, 2) ?? '暗费'}</strong>{paymentIds.has(card.instanceId) && <span className="payment-mark">支付</span>}</button>;
        })}
      </div>
    </section>
  );
}

function CorruptionBar({ corruption, side }: { corruption: number; side: 'opponent' | 'self' }) {
  return <section className={`corruption-bar ${side}`} data-corruption-track={side}><strong>侵蚀</strong><div className="corruption-cells">{Array.from({ length: 8 }, (_, value) => <i key={value} data-corruption-cell={value} className={`${value <= corruption ? 'filled' : ''} ${value === corruption ? 'current' : ''}`}>{value}</i>)}</div><b>{corruption}/7</b></section>;
}

function FieldRow({ board, side, selectedId, onCard, getAction, onAction }: {
  board: PlayerBoardView;
  side: 'opponent' | 'self';
  selectedId: string | null;
  onCard: (card: PublicCardView) => void;
  getAction?: (index: number) => { label: string; action: FieldAction } | null;
  onAction?: (action: FieldAction) => void;
}) {
  return (
    <div className={`field-row ${side}`}>
      <div className="deck-pile"><span>牌组</span><strong>{board.deck.count}</strong></div>
      {board.field.map((card, index) => {
        const fieldAction = getAction?.(index) ?? null;
        return <div className="field-slot" data-field-slot={`${side}-${index}`} key={index}>{card ? <MiniCard card={card} selected={selectedId === card.instanceId} onClick={() => onCard(card)} /> : <span>A{index + 1}</span>}{fieldAction && <button className="slot-action" onClick={() => onAction?.(fieldAction.action)}>{fieldAction.label}</button>}</div>;
      })}
      <div className="grave-pile"><span>墓地</span><strong>{board.graveyard.length}</strong></div>
    </div>
  );
}

function ProcessingZone({ board, side, selectedId, onCard }: { board: PlayerBoardView; side: 'opponent' | 'self'; selectedId: string | null; onCard: (card: PublicCardView) => void }) {
  const title = side === 'self' ? '我方处理区' : '对手处理区';
  return <section className={`processing-zone ${side}`} data-processing-zone={side}><header><span>{title}</span><b>{board.processing.length}</b></header><div className="processing-cards">{board.processing.length > 0 ? board.processing.map((card) => <MiniCard key={card.instanceId} card={card} selected={selectedId === card.instanceId} onClick={() => onCard(card)} />) : <p>等待效果进入处理</p>}</div></section>;
}

const collectVisibleCards = (view: PlayerView): ViewCard[] => {
  const boardCards = (board: PlayerBoardView): PublicCardView[] => [...board.field.filter((card): card is PublicCardView => card !== null), ...board.graveyard, ...board.processing, ...board.signals, ...board.energy, ...board.field.flatMap((card) => card?.attached ?? [])];
  return [...view.self.hand as CardInstance[], ...boardCards(view.self), ...boardCards(view.opponent)];
};

export function Battlefield({ view, onCommand }: BattlefieldProps) {
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [mulliganIds, setMulliganIds] = useState<string[]>([]);
  const [decisionSelectionIds, setDecisionSelectionIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'detail' | 'log' | 'grave'>('detail');
  const hand = view.self.hand as CardInstance[];
  const selected = useMemo(() => collectVisibleCards(view).find((card) => card.instanceId === detailCardId) ?? null, [detailCardId, view]);
  const actionCard = hand.find((card) => card.instanceId === actionCardId) ?? null;
  const actionDefinition = actionCard ? getCardDefinition(actionCard.cardId) : null;
  const playableIds = new Set(view.legalActions.filter((action): action is Extract<LegalAction, { type: 'PLAY_CARD' }> => action.type === 'PLAY_CARD').map((action) => action.instanceId));
  const paymentSet = new Set(paymentIds);
  const selectedPaymentCards = view.self.energy.filter((card) => paymentSet.has(card.instanceId));
  const paymentValid = Boolean(actionDefinition)
    && selectedPaymentCards.length === actionDefinition!.cost
    && selectedPaymentCards.every((card) => !card.rested)
    && (actionDefinition!.cost === 0 || actionDefinition!.attribute === 'none'
      || selectedPaymentCards.some((card) => card.face === 'up' && card.cardId && getCardDefinition(card.cardId).attribute === actionDefinition!.attribute));
  const paymentActive = Boolean(actionCardId && playableIds.has(actionCardId) && actionDefinition && actionDefinition.cost > 0);
  const isMine = view.activePlayerId === view.viewerId;

  useEffect(() => {
    setDecisionSelectionIds([]);
  }, [view.pendingDecision?.id]);

  const viewCard = (card: ViewCard) => { setDetailCardId(card.instanceId); setTab('detail'); };
  const chooseHandCard = (card: CardInstance) => {
    viewCard(card);
    if (view.phase === 'mulligan') {
      setMulliganIds((ids) => ids.includes(card.instanceId) ? ids.filter((id) => id !== card.instanceId) : [...ids, card.instanceId]);
      return;
    }
    if (actionCardId !== card.instanceId) setPaymentIds([]);
    setActionCardId(card.instanceId);
  };
  const togglePayment = (card: PublicCardView) => {
    if (!paymentActive || card.rested || !actionDefinition) return;
    setPaymentIds((ids) => {
      if (ids.includes(card.instanceId)) return ids.filter((id) => id !== card.instanceId);
      if (ids.length >= actionDefinition.cost) return ids;
      return [...ids, card.instanceId];
    });
  };

  const primaryAction = () => {
    if (view.phase === 'mulligan') onCommand({ type: 'MULLIGAN', instanceIds: mulliganIds });
    else if (view.pendingAttack || view.priorityWindow) onCommand({ type: 'PASS_RESPONSE' });
    else if (view.phase === 'upright' || view.phase === 'draw') onCommand({ type: 'ADVANCE_PHASE' });
    else if (view.phase === 'energy') onCommand(actionCardId ? { type: 'SET_ENERGY', instanceId: actionCardId } : { type: 'SET_ENERGY' });
    else if (view.phase === 'main') onCommand({ type: 'END_PHASE' });
  };

  const playSelectedCard = () => {
    if (!actionCard || !actionDefinition || !playableIds.has(actionCard.instanceId) || !paymentValid) return;
    const sendPlayCommand = (command: Extract<LegalAction, { type: 'PLAY_CARD' }>) => {
      onCommand(command);
      setActionCardId(null);
      setPaymentIds([]);
    };
    if (actionDefinition.subtype === 'equipment') {
      const targetSlot = view.self.field.findIndex((card) => card?.cardId && getCardDefinition(card.cardId).type === 'character' && !card.attached?.length);
      if (targetSlot >= 0) sendPlayCommand({ type: 'PLAY_CARD', instanceId: actionCard.instanceId, targetSlot, paymentIds });
      else sendPlayCommand({ type: 'PLAY_CARD', instanceId: actionCard.instanceId, fieldSlot: view.self.field.findIndex((card) => card === null), paymentIds });
    } else sendPlayCommand({ type: 'PLAY_CARD', instanceId: actionCard.instanceId, fieldSlot: view.self.field.findIndex((card) => card === null), paymentIds });
  };

  const actionLabel = view.phase === 'mulligan' ? `确认调度 (${mulliganIds.length})` : (view.pendingAttack || view.priorityWindow) ? '不响应' : view.phase === 'energy' ? (actionCardId ? '放置为费用' : '跳过填充') : view.phase === 'main' ? '结束阶段' : '推进阶段';
  const fieldActionAt = (index: number): { label: string; action: FieldAction } | null => {
    const block = view.legalActions.find((action): action is Extract<LegalAction, { type: 'BLOCK' }> => action.type === 'BLOCK' && action.blockerSlot === index);
    if (block) return { label: '阻挡', action: block };
    const attack = view.legalActions.find((action): action is Extract<LegalAction, { type: 'DECLARE_ATTACK' }> => action.type === 'DECLARE_ATTACK' && action.attackerSlot === index && action.target === 'player');
    return attack ? { label: '攻击玩家', action: attack } : null;
  };
  const eliminateAction = view.legalActions.find((action): action is Extract<LegalAction, { type: 'ELIMINATE_SIGNALS' }> => action.type === 'ELIMINATE_SIGNALS');
  const chooseDecisionOption = (optionId: string, instanceId?: string) => {
    const decision = view.pendingDecision;
    if (!decision) return;
    if (decision.kind === 'choose-option') {
      onCommand({ type: 'RESOLVE_EFFECT_DECISION', decisionId: decision.id, optionId, selectedInstanceIds: [] });
      return;
    }
    if (!instanceId) return;
    if (decision.max === 1) {
      onCommand({ type: 'RESOLVE_EFFECT_DECISION', decisionId: decision.id, selectedInstanceIds: [instanceId] });
      return;
    }
    setDecisionSelectionIds((ids) => ids.includes(instanceId)
      ? ids.filter((id) => id !== instanceId)
      : ids.length < decision.max ? [...ids, instanceId] : ids);
  };
  const confirmDecision = () => {
    const decision = view.pendingDecision;
    if (!decision || decisionSelectionIds.length < decision.min || decisionSelectionIds.length > decision.max) return;
    onCommand({ type: 'RESOLVE_EFFECT_DECISION', decisionId: decision.id, selectedInstanceIds: decisionSelectionIds });
  };

  return (
    <main className="battlefield-shell">
      <div className="arena-backdrop" aria-hidden="true"><i /><b /></div>
      {view.status === 'finished' && <div className="result-overlay"><section><small>对局结束</small><h1>{view.winnerId === view.viewerId ? '胜利' : view.winnerId ? '败北' : '平局'}</h1><p>本局记录已保留在右侧回合记录中。</p></section></div>}
      <aside className="resource-rail"><ResourcePanel board={view.opponent} side="opponent" onView={viewCard} paymentIds={new Set()} /><ResourcePanel board={view.self} side="self" onView={viewCard} paymentIds={paymentSet} {...(paymentActive ? { onPayment: togglePayment } : {})} {...(eliminateAction ? { onEliminate: () => onCommand(eliminateAction) } : {})} /></aside>
      <section className="battle-center">
        <div className="opponent-hand"><span>对手手牌</span><strong>{'count' in view.opponent.hand ? view.opponent.hand.count : view.opponent.hand.length}</strong><div className="card-backs">{Array.from({ length: Math.min(7, 'count' in view.opponent.hand ? view.opponent.hand.count : 0) }, (_, index) => <i key={index} />)}</div></div>
        <FieldRow board={view.opponent} side="opponent" selectedId={detailCardId} onCard={viewCard} />
        <CorruptionBar corruption={view.opponent.corruption} side="opponent" />
        <section className="processing-console">
          <ProcessingZone board={view.opponent} side="opponent" selectedId={detailCardId} onCard={viewCard} />
          <section className="action-console">
            <div className="phase-status"><small>第 {view.turn} 回合</small><strong>{isMine ? '我方行动' : '对手行动'} · {phaseNames[view.phase]}</strong></div>
            <div className="action-readout"><span>{view.pendingAttack ? '攻击响应窗口' : '当前行动：等待指令'}</span><b>{view.pendingAttack ? '响应堆栈 1' : '响应堆栈 0'}</b></div>
            {view.pendingDecision && <section className="effect-decision" data-effect-decision={view.pendingDecision.id}>
              <strong>{view.pendingDecision.prompt}</strong>
              <small>请选择 {view.pendingDecision.min}-{view.pendingDecision.max} 项</small>
              <div className="decision-options">{view.pendingDecision.options.map((option) => <button
                key={option.id}
                data-decision-option={option.id}
                className={option.instanceId && decisionSelectionIds.includes(option.instanceId) ? 'selected' : ''}
                onClick={() => chooseDecisionOption(option.id, option.instanceId)}
              >{option.label}</button>)}</div>
              {view.pendingDecision.max > 1 && <button className="confirm-decision" onClick={confirmDecision} disabled={decisionSelectionIds.length < view.pendingDecision.min || decisionSelectionIds.length > view.pendingDecision.max}>确认选择</button>}
            </section>}
            <button className="primary-action" onClick={primaryAction} disabled={!view.legalActions.some((action) => ['MULLIGAN', 'PASS_RESPONSE', 'ADVANCE_PHASE', 'SET_ENERGY', 'END_PHASE'].includes(action.type))}>{actionLabel}</button>
          </section>
          <ProcessingZone board={view.self} side="self" selectedId={detailCardId} onCard={viewCard} />
        </section>
        <CorruptionBar corruption={view.self.corruption} side="self" />
        <FieldRow board={view.self} side="self" selectedId={detailCardId} onCard={viewCard} getAction={fieldActionAt} onAction={onCommand} />
        <div className="hand-zone">
          <span className="hand-count">手牌 {hand.length}</span>
          <div className="hand-cards">
            {hand.map((card) => <MiniCard key={card.instanceId} card={card} selected={view.phase === 'mulligan' ? mulliganIds.includes(card.instanceId) : actionCardId === card.instanceId} legal={playableIds.has(card.instanceId)} onClick={() => chooseHandCard(card)} />)}
          </div>
          {actionCardId && playableIds.has(actionCardId) && actionDefinition && <div className="play-controls">{actionDefinition.cost > 0 && <small className={paymentValid ? 'valid' : ''}>选择费用 {paymentIds.length}/{actionDefinition.cost}{actionDefinition.attribute !== 'none' ? ` · ${actionDefinition.attribute}` : ''}</small>}<button className="play-card" onClick={playSelectedCard} disabled={!paymentValid}>{actionDefinition.cost > 0 ? '支付并使用' : '使用卡牌'}</button></div>}
        </div>
      </section>
      <aside className="inspector">
        <nav>
          <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>卡牌详情</button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>回合记录</button>
          <button className={tab === 'grave' ? 'active' : ''} onClick={() => setTab('grave')}>墓地</button>
        </nav>
        {tab === 'detail' && <div className="detail-panel">{selected?.cardId ? <><div className="detail-art">{cardName(selected).slice(0, 1)}</div><h2>{cardName(selected)}</h2><div className="tags"><span>费用 {getCardDefinition(selected.cardId).cost}</span><span>{getCardDefinition(selected.cardId).attribute}</span></div>{getCardDefinition(selected.cardId).text.map((line) => <p key={line}>{line}</p>)}</> : selected ? <div className="hidden-card-detail"><div className="detail-art">◆</div><h2>隐藏费用牌</h2><p>这张暗费的牌面信息对你不可见。</p></div> : <p className="empty-copy">选择一张卡牌查看详情</p>}</div>}
        {tab === 'log' && <ol className="turn-log">{[...view.events].reverse().map((event) => <li key={event.id}><small>回合 {event.createdAtTurn}</small><p>{event.message}</p></li>)}</ol>}
        {tab === 'grave' && <div className="grave-tabs"><h3>我方墓地 · {view.self.graveyard.length}</h3>{view.self.graveyard.map((card) => <button data-card-view={card.instanceId} key={card.instanceId} onClick={() => viewCard(card)}>{cardName(card)}</button>)}<h3>对手墓地 · {view.opponent.graveyard.length}</h3>{view.opponent.graveyard.map((card) => <button data-card-view={card.instanceId} key={card.instanceId} onClick={() => viewCard(card)}>{cardName(card)}</button>)}</div>}
        <button className="concede" onClick={() => onCommand({ type: 'CONCEDE' })}>认输</button>
      </aside>
    </main>
  );
}
