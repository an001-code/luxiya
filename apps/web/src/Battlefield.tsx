import { useEffect, useMemo, useState } from 'react';
import { getCardDefinition } from '@pgr/cards';
import type { CardInstance, LegalAction, PlayerBoardView, PlayerView, PublicCardView } from '@pgr/protocol';
import { BattleCardArt } from './BattleCardArt.js';
import { BattleDialog } from './BattleDialog.js';
import { BattleMotion } from './BattleMotion.js';
import { MiniCard, cardName, type ViewCard } from './BattleCard.js';
import { AttackTargetDialog, DefenseDialog, PlayCardDialog, type PlayAction } from './BattleChoices.js';
import { attributeLabels, cardTypeLabel } from './card-labels.js';

interface BattlefieldProps {
  view: PlayerView;
  onCommand: (action: LegalAction) => void;
}

type FieldAction = Extract<LegalAction, { type: 'DECLARE_ATTACK' | 'BLOCK' }>;

const phaseNames = { mulligan: '起手调度', upright: '竖直阶段', draw: '抽牌阶段', energy: '费用填充', main: '主要阶段', end: '结束阶段' };

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
              <span className="resource-card-cost">{definition?.cost ?? '?'}</span><b className="resource-card-art"><BattleCardArt key={card.cardId} cardId={card.cardId} /></b><strong>{definition?.name ?? '隐藏卡牌'}</strong><small>{index + 1}</small>
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
          return <button data-card-view={card.instanceId} className={`energy-slot ${card.rested ? 'rested' : ''} ${card.face === 'down' ? 'facedown' : ''} ${selectable ? 'pay-selectable' : ''} ${paymentIds.has(card.instanceId) ? 'payment-selected' : ''}`} key={card.instanceId} data-energy-slot={index} onClick={() => { onView(card); onPayment?.(card); }} title={cardName(card)}><span className="resource-card-cost">{definition?.cost ?? '?'}</span><b className="resource-card-art"><BattleCardArt key={card.cardId} cardId={card.cardId} /></b><strong>{definition ? attributeLabels[definition.attribute] : '暗费'}</strong>{paymentIds.has(card.instanceId) && <span className="payment-mark">支付</span>}</button>;
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
  return <section className={`processing-zone ${side}`} data-processing-zone={side}><header><span>{title}</span><b>{board.processing.length}</b></header><div className="processing-cards">{board.processing.length > 0 ? board.processing.map((card) => <div className="processing-card-wrap" key={card.instanceId}><MiniCard card={card} selected={selectedId === card.instanceId} onClick={() => onCard(card)} /></div>) : <p>暂无处理中的卡牌</p>}</div></section>;
}

const collectVisibleCards = (view: PlayerView): ViewCard[] => {
  const boardCards = (board: PlayerBoardView): PublicCardView[] => [...board.field.filter((card): card is PublicCardView => card !== null), ...board.graveyard, ...board.processing, ...board.signals, ...board.energy, ...board.field.flatMap((card) => card?.attached ?? [])];
  return [...view.self.hand as CardInstance[], ...boardCards(view.self), ...boardCards(view.opponent)];
};

export function Battlefield({ view, onCommand }: BattlefieldProps) {
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [attackSlot, setAttackSlot] = useState<number | null>(null);
  const [dismissedDefenseVersion, setDismissedDefenseVersion] = useState<number | null>(null);
  const [mulliganIds, setMulliganIds] = useState<string[]>([]);
  const [decisionSelectionIds, setDecisionSelectionIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'detail' | 'log' | 'grave'>('detail');
  const [openingSubmitted, setOpeningSubmitted] = useState(false);
  const hand = view.self.hand as CardInstance[];
  const selected = useMemo(() => collectVisibleCards(view).find((card) => card.instanceId === detailCardId)
    ?? (() => { const option = view.pendingDecision?.options.find((option) => option.instanceId === detailCardId); return option?.cardId ? { instanceId: option.instanceId!, cardId: option.cardId, face: 'up' as const, rested: false } : null; })(), [detailCardId, view]);
  const actionCard = hand.find((card) => card.instanceId === actionCardId) ?? null;
  const playChoices = view.legalActions.filter((action): action is PlayAction => action.type === 'PLAY_CARD' && action.instanceId === actionCardId);
  const playableIds = new Set(view.legalActions.filter((action): action is Extract<LegalAction, { type: 'PLAY_CARD' }> => action.type === 'PLAY_CARD').map((action) => action.instanceId));
  const isMine = view.activePlayerId === view.viewerId;

  useEffect(() => {
    setDecisionSelectionIds([]);
  }, [view.pendingDecision?.id]);
  useEffect(() => { setOpeningSubmitted(false); }, [view.gameId]);
  useEffect(() => { setAttackSlot(null); }, [view.turn]);
  useEffect(() => { const drawn = view.drawConfirmation?.cards[0]; if (drawn) setDetailCardId(drawn.instanceId); }, [view.drawConfirmation?.cards[0]?.instanceId]);

  const viewCard = (card: ViewCard) => { setDetailCardId(card.instanceId); setTab('detail'); };
  const chooseHandCard = (card: CardInstance) => {
    viewCard(card);
    if (view.phase === 'mulligan') {
      setMulliganIds((ids) => ids.includes(card.instanceId) ? ids.filter((id) => id !== card.instanceId) : [...ids, card.instanceId]);
      return;
    }
    setActionCardId(card.instanceId);
  };

  const primaryAction = () => {
    if (view.phase === 'mulligan') { onCommand({ type: 'MULLIGAN', instanceIds: mulliganIds }); setOpeningSubmitted(true); }
    else if (view.pendingAttack || view.priorityWindow) onCommand({ type: 'PASS_RESPONSE' });
    else if (view.phase === 'energy') { onCommand(actionCardId ? { type: 'SET_ENERGY', instanceId: actionCardId } : { type: 'SET_ENERGY' }); setActionCardId(null); }
    else if (view.phase === 'main') onCommand({ type: 'END_PHASE' });
  };

  const actionLabel = view.phase === 'mulligan' ? `确认调度 (${mulliganIds.length})` : (view.pendingAttack || view.priorityWindow) ? '不响应' : view.phase === 'energy' ? (actionCardId ? '放置为费用' : '跳过填充') : view.phase === 'main' ? '结束阶段' : '推进阶段';
  const fieldActionAt = (index: number): { label: string; action: FieldAction } | null => {
    const attack = view.legalActions.find((action): action is Extract<LegalAction, { type: 'DECLARE_ATTACK' }> => action.type === 'DECLARE_ATTACK' && action.attackerSlot === index);
    return attack ? { label: '攻击', action: attack } : null;
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
    setDecisionSelectionIds((ids) => ids.includes(instanceId)
      ? ids.filter((id) => id !== instanceId)
      : decision.max === 1 ? [instanceId] : ids.length < decision.max ? [...ids, instanceId] : ids);
  };
  const confirmDecision = () => {
    const decision = view.pendingDecision;
    if (!decision || decisionSelectionIds.length < decision.min || decisionSelectionIds.length > decision.max) return;
    onCommand({ type: 'RESOLVE_EFFECT_DECISION', decisionId: decision.id, selectedInstanceIds: decisionSelectionIds });
  };

  const showOpening = view.phase === 'mulligan' && !openingSubmitted && view.legalActions.some((action) => action.type === 'MULLIGAN');
  const showEnergy = view.phase === 'energy' && view.legalActions.some((action) => action.type === 'SET_ENERGY');
  const showPlay = Boolean(actionCard && playChoices.length && !showOpening && !showEnergy && !view.pendingDecision);
  const attackChoices = view.legalActions.filter((action): action is Extract<LegalAction, { type: 'DECLARE_ATTACK' }> => action.type === 'DECLARE_ATTACK' && action.attackerSlot === attackSlot);
  const canDefend = view.pendingAttack?.stage === 'response' && view.pendingAttack.blockerSlot === undefined && !isMine && view.pendingAttack.priorityPlayerId === view.viewerId
    && view.legalActions.some((action) => action.type === 'PASS_RESPONSE') && !view.processingPending && !view.pendingDecision;
  const showDefense = canDefend && dismissedDefenseVersion !== view.version && !showPlay;
  const preview = selected?.cardId ? <aside className="dialog-card-preview"><div><BattleCardArt key={selected.cardId} cardId={selected.cardId} /></div><h3>{cardName(selected)}</h3>{getCardDefinition(selected.cardId).text.map((line, index) => <p key={index}>{line}</p>)}</aside> : <aside className="dialog-card-preview"><p>点击卡牌可查看完整效果。</p></aside>;

  return (
    <main className="battlefield-shell">
      <div className="arena-backdrop" aria-hidden="true"><i /><b /></div>
      <BattleMotion view={view} />
      {view.status === 'finished' && <div className="result-overlay"><section><small>对局结束</small><h1>{view.winnerId === view.viewerId ? '胜利' : view.winnerId ? '败北' : '平局'}</h1><p>本局记录已保留在右侧回合记录中。</p></section></div>}
      <aside className="resource-rail"><ResourcePanel board={view.opponent} side="opponent" onView={viewCard} paymentIds={new Set()} /><ResourcePanel board={view.self} side="self" onView={viewCard} paymentIds={new Set()} {...(eliminateAction ? { onEliminate: () => onCommand(eliminateAction) } : {})} /></aside>
      <section className="battle-center">
        <div className="opponent-hand"><span>对手手牌</span><strong>{'count' in view.opponent.hand ? view.opponent.hand.count : view.opponent.hand.length}</strong><div className="card-backs">{Array.from({ length: Math.min(7, 'count' in view.opponent.hand ? view.opponent.hand.count : 0) }, (_, index) => <i key={index} />)}</div></div>
        <FieldRow board={view.opponent} side="opponent" selectedId={detailCardId} onCard={viewCard} />
        <CorruptionBar corruption={view.opponent.corruption} side="opponent" />
        <section className="processing-console">
          <ProcessingZone board={view.opponent} side="opponent" selectedId={detailCardId} onCard={viewCard} />
          <section className="action-console">
            <div className="phase-status"><small>第 {view.turn} 回合</small><strong>{phaseNames[view.phase]}</strong><span>{view.phase === 'mulligan' ? view.opening?.selfDone || openingSubmitted ? '我方已确认' : '双方同时调度' : isMine ? '我方行动' : '对手行动'}</span>{view.processingPending && <em>卡牌公开中</em>}{view.pendingAttack && <em>攻击响应窗口</em>}</div>
            {!showOpening && !showEnergy && !view.pendingDecision && !showPlay && !view.drawConfirmation && !['mulligan', 'upright', 'draw'].includes(view.phase) && <button className="primary-action" onClick={() => canDefend ? setDismissedDefenseVersion(null) : primaryAction()} disabled={!view.legalActions.some((action) => ['PASS_RESPONSE', 'SET_ENERGY', 'END_PHASE'].includes(action.type))}>{canDefend ? '选择阻挡或响应' : actionLabel}</button>}
          </section>
          <ProcessingZone board={view.self} side="self" selectedId={detailCardId} onCard={viewCard} />
        </section>
        <CorruptionBar corruption={view.self.corruption} side="self" />
        <FieldRow board={view.self} side="self" selectedId={detailCardId} onCard={viewCard} getAction={fieldActionAt} onAction={(action) => { if (action.type === 'DECLARE_ATTACK') setAttackSlot(action.attackerSlot); }} />
        <div className="hand-zone">
          <span className="hand-count">手牌 {hand.length}</span>
          <div className="hand-cards">
            {hand.map((card) => <MiniCard key={card.instanceId} card={card} selected={view.phase === 'mulligan' ? mulliganIds.includes(card.instanceId) : actionCardId === card.instanceId} legal={playableIds.has(card.instanceId)} onClick={() => chooseHandCard(card)} />)}
          </div>
        </div>
      </section>
      {showOpening && <BattleDialog title="起手调度"><p className="battle-dialog-hint">选择要替换的手牌，也可以全部保留。双方可同时操作，全部确认后开始回合。</p><div className="battle-dialog-body"><div className="dialog-card-grid">{hand.map((card) => <MiniCard key={card.instanceId} card={card} selected={mulliganIds.includes(card.instanceId)} onClick={() => chooseHandCard(card)} />)}</div>{preview}</div><footer><button className="primary-action" onClick={primaryAction}>确认调度 ({mulliganIds.length})</button></footer></BattleDialog>}
      {showEnergy && <BattleDialog title="选择费用填充"><p className="battle-dialog-hint">选择一张手牌放入费用区，或跳过本次填充。</p><div className="battle-dialog-body"><div className="dialog-card-grid">{hand.map((card) => <MiniCard key={card.instanceId} card={card} selected={actionCardId === card.instanceId} onClick={() => chooseHandCard(card)} />)}</div>{preview}</div><footer><button onClick={() => { onCommand({ type: 'SET_ENERGY' }); setActionCardId(null); }}>跳过填充</button><button className="primary-action" disabled={!actionCardId || view.self.energy.length >= 10} onClick={primaryAction}>放置为费用</button></footer></BattleDialog>}
      {showPlay && actionCard && <PlayCardDialog key={actionCard.instanceId} card={actionCard} choices={playChoices} energy={view.self.energy} field={view.self.field} evolutionCheck={view.evolutionChecks?.[actionCard.instanceId]} onView={viewCard} onClose={() => setActionCardId(null)} onCommand={(action) => { onCommand(action); setActionCardId(null); setDismissedDefenseVersion(view.version); }} />}
      {attackChoices.length > 0 && <AttackTargetDialog choices={attackChoices} view={view} onView={viewCard} onClose={() => setAttackSlot(null)} onCommand={(action) => { onCommand(action); setAttackSlot(null); }} />}
      {showDefense && <DefenseDialog key={`${view.gameId}-${view.version}`} view={view} onView={viewCard} onPlay={chooseHandCard} onClose={() => setDismissedDefenseVersion(view.version)} onCommand={(action) => { onCommand(action); setDismissedDefenseVersion(view.version); }} />}
      {view.drawConfirmation && <BattleDialog title="抽牌完成"><p className="battle-dialog-hint">程序已完成竖直与本回合抽牌，共抽取 {view.drawConfirmation.count} 张。确认后进入费用填充。</p><div className="battle-dialog-body"><div className="dialog-card-grid">{view.drawConfirmation.cards.map((card) => <MiniCard key={card.instanceId} card={card} onClick={() => viewCard(card)} />)}</div>{preview}</div><footer><button className="primary-action" disabled={!view.legalActions.some((action) => action.type === 'CONFIRM_DRAW')} onClick={() => onCommand({ type: 'CONFIRM_DRAW' })}>确认抽牌</button></footer></BattleDialog>}
      {view.pendingDecision && <BattleDialog title={view.pendingDecision.prompt}><section className="effect-decision" data-effect-decision={view.pendingDecision.id}>
              <strong>{view.pendingDecision.prompt}</strong>
              <small>{view.pendingDecision.kind === 'order-cards' ? '按需要的顺序依次点击卡牌；再次点击可以取消。' : `请选择 ${view.pendingDecision.min}-${Math.min(view.pendingDecision.max, view.pendingDecision.options.length)} 项`}</small>
              <div className="decision-options">{view.pendingDecision.options.map((option) => <button
                key={option.id}
                data-decision-option={option.id}
                className={option.instanceId && decisionSelectionIds.includes(option.instanceId) ? 'selected' : ''}
                onClick={() => { if (option.instanceId && option.cardId) setDetailCardId(option.instanceId); chooseDecisionOption(option.id, option.instanceId); }}
              >{option.cardId && <span className="decision-card-art"><BattleCardArt key={option.cardId} cardId={option.cardId} /></span>}<span>{option.label}</span>{option.instanceId && decisionSelectionIds.includes(option.instanceId) && <b>{decisionSelectionIds.indexOf(option.instanceId) + 1}</b>}</button>)}</div>
              {selected?.cardId && <details className="decision-card-rules"><summary>查看《{cardName(selected)}》的完整效果</summary>{getCardDefinition(selected.cardId).text.map((line, index) => <p key={index}>{line}</p>)}</details>}
              {view.pendingDecision.kind !== 'choose-option' && <button className="confirm-decision" onClick={confirmDecision} disabled={decisionSelectionIds.length < view.pendingDecision.min || decisionSelectionIds.length > view.pendingDecision.max}>{view.pendingDecision.min === 0 && decisionSelectionIds.length === 0 ? '不选择，继续结算' : '确认选择'}</button>}
            </section></BattleDialog>}
      <aside className="inspector">
        <nav>
          <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>卡牌详情</button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>回合记录</button>
          <button className={tab === 'grave' ? 'active' : ''} onClick={() => setTab('grave')}>墓地</button>
        </nav>
        {tab === 'detail' && <div className="detail-panel">{selected?.cardId ? <><div className="detail-art"><BattleCardArt key={selected.cardId} cardId={selected.cardId} /></div><h2>{cardName(selected)}</h2><div className="tags"><span>费用 {getCardDefinition(selected.cardId).cost}</span><span>{attributeLabels[getCardDefinition(selected.cardId).attribute]}</span><span>{cardTypeLabel(getCardDefinition(selected.cardId))}</span></div>{getCardDefinition(selected.cardId).text.map((line) => <p key={line}>{line}</p>)}</> : selected ? <div className="hidden-card-detail"><div className="detail-art">◆</div><h2>隐藏费用牌</h2><p>这张暗费的牌面信息对你不可见。</p></div> : <p className="empty-copy">选择一张卡牌查看详情</p>}</div>}
        {tab === 'log' && <ol className="turn-log">{[...view.events].reverse().map((event) => <li key={event.id}><small>回合 {event.createdAtTurn}</small><p>{event.message}</p></li>)}</ol>}
        {tab === 'grave' && <div className="grave-tabs"><h3>我方墓地 · {view.self.graveyard.length}</h3>{view.self.graveyard.map((card) => <button data-card-view={card.instanceId} key={card.instanceId} onClick={() => viewCard(card)}>{cardName(card)}</button>)}<h3>对手墓地 · {view.opponent.graveyard.length}</h3>{view.opponent.graveyard.map((card) => <button data-card-view={card.instanceId} key={card.instanceId} onClick={() => viewCard(card)}>{cardName(card)}</button>)}</div>}
        <button className="concede" onClick={() => onCommand({ type: 'CONCEDE' })}>认输</button>
      </aside>
    </main>
  );
}
