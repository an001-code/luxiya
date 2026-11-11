import { useState } from 'react';
import { getCardDefinition } from '@pgr/cards';
import type { CardInstance, LegalAction, PlayerView, PublicCardView } from '@pgr/protocol';
import { BattleDialog } from './BattleDialog.js';
import { MiniCard, cardName, type ViewCard } from './BattleCard.js';
import { attributeLabels, cardTypeLabel } from './card-labels.js';

export type PlayAction = Extract<LegalAction, { type: 'PLAY_CARD' }>;
type AttackAction = Extract<LegalAction, { type: 'DECLARE_ATTACK' }>;
const playKey = (action: PlayAction) => JSON.stringify([action.instanceId, action.fieldSlot, action.targetSlot, action.evolutionTargetSlot, action.discountSignalIds]);

export function PlayCardDialog({ card, choices, energy, field, onCommand, onClose, onView }: {
  card: CardInstance; choices: PlayAction[]; energy: PublicCardView[]; field: (PublicCardView | null)[];
  onCommand: (action: PlayAction) => void; onClose: () => void; onView: (card: ViewCard) => void;
}) {
  const definition = getCardDefinition(card.cardId);
  const [choiceKey, setChoiceKey] = useState(() => {
    const simple = choices.find((choice) => choice.fieldSlot === undefined && choice.targetSlot === undefined && choice.evolutionTargetSlot === undefined);
    return simple ? playKey(simple) : definition.type === 'tactic' && choices.length === 1 ? playKey(choices[0]!) : '';
  });
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const chosen = choices.find((choice) => playKey(choice) === choiceKey);
  const cost = chosen?.paymentCost ?? (chosen?.evolutionTargetSlot !== undefined ? 2 : definition.cost);
  const paymentCards = energy.filter((fee) => paymentIds.includes(fee.instanceId));
  const valid = Boolean(chosen) && paymentIds.length === cost && paymentCards.length === cost && paymentCards.every((fee) => !fee.rested)
    && (cost === 0 || definition.attribute === 'none' || paymentCards.some((fee) => fee.face === 'up' && fee.cardId && getCardDefinition(fee.cardId).attribute === definition.attribute));
  const choose = (choice: PlayAction) => { setChoiceKey(playKey(choice)); setPaymentIds([]); };
  const choiceLabel = (choice: PlayAction) => {
    const slot = choice.evolutionTargetSlot ?? choice.targetSlot;
    const target = slot === undefined ? null : field[slot];
    const location = choice.evolutionTargetSlot !== undefined ? `升变 A${slot! + 1} · ${target ? cardName(target) : ''}`
      : choice.targetSlot !== undefined ? `装备 A${slot! + 1} · ${target ? cardName(target) : ''}`
      : choice.fieldSlot !== undefined ? `出场至 A${choice.fieldSlot + 1}` : '使用这张卡';
    return `${location} · 费用 ${choice.paymentCost ?? (choice.evolutionTargetSlot !== undefined ? 2 : definition.cost)}${choice.discountSignalIds?.length ? `（消除 ${choice.discountSignalIds.length} 个蓝色信号球）` : ''}`;
  };
  const submit = () => {
    if (!chosen || !valid) return;
    const command = { ...chosen, paymentIds };
    delete command.paymentCost;
    onCommand(command);
  };
  return <BattleDialog title={`使用《${definition.name}》`} onClose={onClose}>
    <p className="battle-dialog-hint">{attributeLabels[definition.attribute]} · {cardTypeLabel(definition)}。先选择出场方式与位置，再选择费用。</p>
    <div className="play-choice-groups">{[false, true].map((evolution) => {
      const options = choices.filter((choice) => (choice.evolutionTargetSlot !== undefined) === evolution);
      return options.length > 0 && <section key={String(evolution)}><h3>{evolution ? '升变召唤' : '通常使用'}</h3><div className="battle-choice-grid">{options.map((choice) => <button key={playKey(choice)} className={playKey(choice) === choiceKey ? 'selected' : ''} onClick={() => choose(choice)}>{choiceLabel(choice)}</button>)}</div></section>;
    })}</div>
    {chosen && <p className="chosen-play-summary">已选择：{choiceLabel(chosen)}</p>}
    {chosen && cost > 0 && <><p className="battle-dialog-hint">选择 {cost} 张未横置费用，已选 {paymentIds.length} 张。{definition.attribute !== 'none' && `其中至少一张明费须为${attributeLabels[definition.attribute]}属性。`}</p><div className="dialog-card-grid payment-options">{energy.map((fee) => <MiniCard key={fee.instanceId} card={fee} selected={paymentIds.includes(fee.instanceId)} legal={!fee.rested} onClick={() => {
      onView(fee); if (fee.rested) return;
      setPaymentIds((ids) => ids.includes(fee.instanceId) ? ids.filter((id) => id !== fee.instanceId) : ids.length < cost ? [...ids, fee.instanceId] : ids);
    }} />)}</div></>}
    <details className="decision-card-rules"><summary>查看完整卡牌效果</summary>{definition.text.map((line, index) => <p key={index}>{line}</p>)}</details>
    <footer><button onClick={onClose}>取消</button><button className="primary-action" disabled={!valid} onClick={submit}>{chosen?.evolutionTargetSlot !== undefined ? '确认升变' : cost > 0 ? '支付并使用' : '使用卡牌'}</button></footer>
  </BattleDialog>;
}

export function AttackTargetDialog({ choices, view, onCommand, onClose, onView }: {
  choices: AttackAction[]; view: PlayerView; onCommand: (action: AttackAction) => void; onClose: () => void; onView: (card: ViewCard) => void;
}) {
  const [selected, setSelected] = useState<AttackAction | null>(null);
  const stillLegal = selected && choices.some((action) => action.target === selected.target && action.targetSlot === selected.targetSlot);
  const chosenCard = selected?.targetSlot === undefined ? null : view.opponent.field[selected.targetSlot];
  return <BattleDialog title="选择攻击目标" onClose={onClose}><p className="battle-dialog-hint">选择对方玩家或一个合法角色目标。通常只能攻击横置的角色。</p>
    <div className="battle-choice-grid attack-targets">{choices.map((action) => {
      const target = action.targetSlot === undefined ? null : view.opponent.field[action.targetSlot];
      const label = action.target === 'player' ? '攻击对方玩家' : `攻击 A${action.targetSlot! + 1} · ${target ? cardName(target) : '角色'}`;
      return <button key={`${action.target}-${action.targetSlot}`} className={selected?.target === action.target && selected.targetSlot === action.targetSlot ? 'selected' : ''} onClick={() => { setSelected(action); if (target) onView(target); }}>{label}</button>;
    })}</div>{chosenCard?.cardId && <div className="attack-target-preview"><MiniCard card={chosenCard} /><div><h3>{cardName(chosenCard)}</h3><p>PP {chosenCard.effectivePp ?? getCardDefinition(chosenCard.cardId).pp ?? 0} · DP {chosenCard.effectiveDp ?? getCardDefinition(chosenCard.cardId).dp ?? 0}</p>{getCardDefinition(chosenCard.cardId).text.map((line, index) => <p key={index}>{line}</p>)}</div></div>}<footer><button onClick={onClose}>取消</button><button className="primary-action" disabled={!stillLegal} onClick={() => { if (selected && stillLegal) onCommand(selected); }}>确认攻击</button></footer></BattleDialog>;
}

export function DefenseDialog({ view, onCommand, onClose, onView, onPlay }: {
  view: PlayerView; onCommand: (action: LegalAction) => void; onClose: () => void; onView: (card: ViewCard) => void; onPlay: (card: CardInstance) => void;
}) {
  const [blocker, setBlocker] = useState<number | null>(null);
  const blocks = view.legalActions.filter((action): action is Extract<LegalAction, { type: 'BLOCK' }> => action.type === 'BLOCK');
  const selected = blocks.find((action) => action.blockerSlot === blocker);
  const attacker = view.pendingAttack ? view.opponent.field[view.pendingAttack.attackerSlot] : null;
  const target = view.pendingAttack?.targetSlot === undefined ? null : view.self.field[view.pendingAttack.targetSlot];
  const instants = (view.self.hand as CardInstance[]).filter((card) => view.legalActions.some((action) => action.type === 'PLAY_CARD' && action.instanceId === card.instanceId));
  return <BattleDialog title="是否阻挡本次攻击？" onClose={onClose}>
    <p className="battle-dialog-hint">对方《{attacker ? cardName(attacker) : '角色'}》正在攻击{target ? `你的《${cardName(target)}》` : '你'}。选择一张符合条件的角色阻挡，也可以使用瞬时战术或不阻挡。</p>
    {blocks.length ? <div className="blocker-choice-grid">{blocks.map((action) => {
      const card = view.self.field[action.blockerSlot]!;
      return <div key={action.blockerSlot}><MiniCard card={card} selected={blocker === action.blockerSlot} legal onClick={() => { setBlocker(action.blockerSlot); onView(card); }} /><span>A{action.blockerSlot + 1} · {cardName(card)}</span></div>;
    })}</div> : <p>当前没有符合条件的阻挡角色。</p>}
    {instants.length > 0 && <section><h3>或使用瞬时战术</h3><div className="dialog-card-grid">{instants.map((card) => <MiniCard key={card.instanceId} card={card} onClick={() => onPlay(card)} />)}</div></section>}
    <footer><button onClick={() => onCommand({ type: 'PASS_RESPONSE' })}>不阻挡</button><button className="primary-action" disabled={!selected} onClick={() => { if (selected) onCommand(selected); }}>确认阻挡</button></footer>
  </BattleDialog>;
}
