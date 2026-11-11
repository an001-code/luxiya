import { useEffect, useState } from 'react';
import type {
  EffectAction, EffectCondition, EffectCost, EffectDuration, EffectEvent, EffectPlayer, EffectTarget, EffectZone, StructuredEffect,
} from '@pgr/protocol';
import { cloneTemplate, effectTemplates } from './effect-templates.js';
import { effectBlockingIssues, summarizeEffect } from './effect-summary.js';

interface EffectBuilderProps {
  effects: StructuredEffect[];
  onChange: (effects: StructuredEffect[]) => void;
  validationDetails?: string[];
  focusedEffectId?: string | null;
}

const abilities: Array<[StructuredEffect['ability'], string]> = [
  ['enter', '出场能力'], ['automatic', '自动能力'], ['activated', '起动能力'], ['instant', '瞬时能力'], ['permanent', '永久能力'], ['charge', '充能能力'],
];
const players: Array<[EffectPlayer, string]> = [['self', '我方玩家'], ['opponent', '对方玩家']];
const zones: Array<[EffectZone, string]> = [
  ['deck', '牌组'], ['hand', '手牌'], ['graveyard', '墓地'], ['processing', '处理区'], ['field', '战场'], ['signals', '信号球区'], ['energy', '费用区'],
];
const durations: Array<[EffectDuration['kind'], string]> = [
  ['instant', '立即'], ['attack', '本次攻击'], ['turn', '本回合'], ['next-turn', '下个回合'], ['permanent', '永久'],
];
const events: Array<[EffectEvent, string]> = [
  ['card-used', '使用卡牌'], ['card-entered', '卡牌出场'], ['card-left', '卡牌离场'], ['attack-declared', '宣言攻击'],
  ['attack-charge', '攻击充能'], ['damage-charge', '伤害充能'], ['corruption-changed', '侵蚀变化'], ['turn-start', '回合开始'],
  ['turn-end', '回合结束'], ['card-moved-to-processing', '进入处理区'],
];

const nextEffectId = (effects: StructuredEffect[]): string => {
  let sequence = effects.length + 1;
  while (effects.some((effect) => effect.id === `effect-${sequence}`)) sequence += 1;
  return `effect-${sequence}`;
};

const blankEffect = (id: string): StructuredEffect => ({
  id,
  ability: 'automatic',
  conditions: [],
  costs: [],
  targets: [],
  actions: [{ kind: 'custom', customHandlerId: '' }],
  duration: { kind: 'instant' },
});

const actionForKind = (kind: EffectAction['kind']): EffectAction => {
  switch (kind) {
    case 'draw': return { kind, player: 'self', amount: { kind: 'fixed', value: 1 } };
    case 'discard': return { kind, targetId: '' };
    case 'modify-stat': return { kind, targetId: '', stat: 'pp', operation: 'add', value: { kind: 'fixed', value: 1000 }, duration: { kind: 'turn' } };
    case 'move-card': return { kind, targetId: '', to: 'graveyard' };
    case 'rest': return { kind, targetId: '' };
    case 'upright': return { kind, targetId: '' };
    case 'freeze': return { kind, targetId: '' };
    case 'modify-corruption': return { kind, player: 'self', operation: 'add', value: { kind: 'fixed', value: 1 } };
    case 'signal-as': return { kind, targetId: '', color: 'red', count: 1, duration: { kind: 'turn' } };
    case 'search': return { kind, player: 'self', count: 1, filter: {}, destination: 'hand', remainder: 'shuffle' };
    case 'play': return { kind, targetId: '', ignoreCost: false };
    case 'equip': return { kind, targetId: '', sourceTargetId: 'source' };
    case 'choose': return { kind, options: [{ id: 'option-1', label: '选项 1', actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }] }] };
    case 'custom': return { kind, customHandlerId: '' };
  }
};

function NumberField({ label, value, onChange, min }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return <label>{label}<input aria-label={label} type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function PlayerField({ value, onChange }: { value: EffectPlayer; onChange: (value: EffectPlayer) => void }) {
  return <label>执行玩家<select aria-label="执行玩家" value={value} onChange={(event) => onChange(event.target.value as EffectPlayer)}>{players.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
}

function ZoneField({ label = '区域', value, onChange }: { label?: string; value: EffectZone; onChange: (value: EffectZone) => void }) {
  return <label>{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as EffectZone)}>{zones.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
}

function DurationField({ value, onChange }: { value: EffectDuration; onChange: (value: EffectDuration) => void }) {
  return <label>持续时间<select aria-label="持续时间" value={value.kind} onChange={(event) => onChange({ kind: event.target.value as EffectDuration['kind'] })}>{durations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
}

function ActionEditor({ action, onChange, onRemove, canRemove }: { action: EffectAction; onChange: (action: EffectAction) => void; onRemove: () => void; canRemove: boolean }) {
  const target = 'targetId' in action ? action.targetId : '';
  const setFixedValue = (value: number) => {
    if ('value' in action) onChange({ ...action, value: { kind: 'fixed', value } } as EffectAction);
    else if (action.kind === 'draw') onChange({ ...action, amount: { kind: 'fixed', value } });
  };
  const fixedValue = action.kind === 'draw'
    ? action.amount.kind === 'fixed' ? action.amount.value : 0
    : 'value' in action && action.value.kind === 'fixed' ? action.value.value : 0;

  return <div className="effect-action-editor" data-testid="effect-action">
    <span className="drag-handle" aria-hidden="true">≡</span>
    <label>动作类型<select aria-label="动作类型" value={action.kind} onChange={(event) => onChange(actionForKind(event.target.value as EffectAction['kind']))}>
      <option value="custom">待配置 / 开发处理器</option><option value="draw">抽牌</option><option value="discard">舍弃目标</option>
      <option value="modify-stat">修改 PP / DP / 充能</option><option value="move-card">移动卡牌</option><option value="rest">横置</option>
      <option value="upright">重置</option><option value="freeze">冻结</option><option value="modify-corruption">修改侵蚀度</option>
      <option value="signal-as">视为信号球</option><option value="search">检索</option><option value="play">使用卡牌</option>
      <option value="equip">装备</option><option value="choose">选择分支</option>
    </select></label>
    {(action.kind === 'draw' || action.kind === 'modify-corruption' || action.kind === 'search') && <PlayerField value={action.player} onChange={(player) => onChange({ ...action, player } as EffectAction)} />}
    {(action.kind === 'draw' || action.kind === 'modify-stat' || action.kind === 'modify-corruption') && <NumberField label="数量" value={fixedValue} onChange={setFixedValue} />}
    {'targetId' in action && <label>目标 ID<input aria-label="目标 ID" value={target} onChange={(event) => onChange({ ...action, targetId: event.target.value } as EffectAction)} placeholder="与目标面板中的 ID 一致" /></label>}
    {action.kind === 'modify-stat' && <><label>数值<select value={action.stat} onChange={(event) => onChange({ ...action, stat: event.target.value as typeof action.stat })}><option value="pp">PP</option><option value="dp">DP</option><option value="charge">充能</option></select></label><DurationField value={action.duration} onChange={(duration) => onChange({ ...action, duration })} /></>}
    {action.kind === 'move-card' && <ZoneField label="移动到" value={action.to} onChange={(to) => onChange({ ...action, to })} />}
    {action.kind === 'modify-corruption' && <label>运算<select value={action.operation} onChange={(event) => onChange({ ...action, operation: event.target.value as typeof action.operation })}><option value="add">增加</option><option value="subtract">降低</option><option value="set">设为</option></select></label>}
    {action.kind === 'signal-as' && <><label>颜色<select value={action.color} onChange={(event) => onChange({ ...action, color: event.target.value as typeof action.color })}><option value="red">红</option><option value="blue">蓝</option><option value="yellow">黄</option></select></label><NumberField label="信号数量" min={1} value={action.count} onChange={(count) => onChange({ ...action, count })} /><DurationField value={action.duration} onChange={(duration) => onChange({ ...action, duration })} /></>}
    {action.kind === 'search' && <><NumberField label="检索数量" min={1} value={action.count} onChange={(count) => onChange({ ...action, count })} /><ZoneField label="加入区域" value={action.destination} onChange={(destination) => onChange({ ...action, destination })} /></>}
    {action.kind === 'play' && <label className="effect-check"><input type="checkbox" checked={action.ignoreCost} onChange={(event) => onChange({ ...action, ignoreCost: event.target.checked })} />忽略费用</label>}
    {action.kind === 'equip' && <label>装备来源 ID<input value={action.sourceTargetId} onChange={(event) => onChange({ ...action, sourceTargetId: event.target.value })} /></label>}
    {action.kind === 'choose' && <p className="effect-help">分支选项请在下方“高级 JSON”中编辑；常用分支模板将在后续批次继续扩展。</p>}
    {action.kind === 'custom' && <label>处理器 ID<input aria-label="处理器 ID" value={action.customHandlerId} onChange={(event) => onChange({ ...action, customHandlerId: event.target.value })} placeholder="需要开发人员注册" /></label>}
    <button type="button" className="danger-quiet" disabled={!canRemove} onClick={onRemove}>移除动作</button>
  </div>;
}

function ConditionEditor({ condition, onChange, onRemove }: { condition: EffectCondition; onChange: (condition: EffectCondition) => void; onRemove: () => void }) {
  return <div className="compact-node">
    <label>条件类型<select value={condition.kind} onChange={(event) => {
      const kind = event.target.value as EffectCondition['kind'];
      const next: EffectCondition = kind === 'controller-has-card' ? { kind, player: 'self', zone: 'field', filter: {}, min: 1 }
        : kind === 'source-attached' ? { kind, filter: {} }
        : kind === 'corruption-compare' ? { kind, left: 'self', operator: 'gte', right: 'opponent' }
        : kind === 'turn-event' ? { kind, event: 'turn-start', player: 'self' }
        : { kind: 'custom', customHandlerId: '' };
      onChange(next);
    }}><option value="controller-has-card">区域中有卡牌</option><option value="source-attached">来源已装备</option><option value="corruption-compare">比较侵蚀度</option><option value="turn-event">回合事件</option><option value="custom">开发处理器</option></select></label>
    {condition.kind === 'controller-has-card' && <><PlayerField value={condition.player} onChange={(player) => onChange({ ...condition, player })} /><ZoneField value={condition.zone} onChange={(zone) => onChange({ ...condition, zone })} /><NumberField label="至少" min={0} value={condition.min} onChange={(min) => onChange({ ...condition, min })} /></>}
    {condition.kind === 'turn-event' && <label>事件<select value={condition.event} onChange={(event) => onChange({ ...condition, event: event.target.value as EffectEvent })}>{events.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    {condition.kind === 'custom' && <label>处理器 ID<input value={condition.customHandlerId} onChange={(event) => onChange({ ...condition, customHandlerId: event.target.value })} /></label>}
    <button type="button" onClick={onRemove}>移除</button>
  </div>;
}

function CostEditor({ cost, onChange, onRemove }: { cost: EffectCost; onChange: (cost: EffectCost) => void; onRemove: () => void }) {
  return <div className="compact-node">
    <label>费用类型<select value={cost.kind} onChange={(event) => {
      const kind = event.target.value as EffectCost['kind'];
      const next: EffectCost = kind === 'pay-energy' ? { kind, amount: { kind: 'fixed', value: 1 } }
        : kind === 'discard' ? { kind, player: 'self', amount: { kind: 'fixed', value: 1 } }
        : kind === 'rest' ? { kind, target: 'source' }
        : kind === 'eliminate-signals' ? { kind, amount: { kind: 'fixed', value: 3 }, color: 'any', adjacent: true }
        : kind === 'move-card' ? { kind, targetId: 'source', to: 'graveyard' }
        : { kind: 'custom', customHandlerId: '' };
      onChange(next);
    }}><option value="pay-energy">支付费用</option><option value="discard">舍弃手牌</option><option value="rest">横置来源</option><option value="eliminate-signals">消除信号球</option><option value="move-card">移动卡牌</option><option value="custom">开发处理器</option></select></label>
    {'amount' in cost && cost.amount.kind === 'fixed' && <NumberField label="数量" min={0} value={cost.amount.value} onChange={(value) => onChange({ ...cost, amount: { kind: 'fixed', value } } as EffectCost)} />}
    {cost.kind === 'discard' && <PlayerField value={cost.player} onChange={(player) => onChange({ ...cost, player })} />}
    {cost.kind === 'custom' && <label>处理器 ID<input value={cost.customHandlerId} onChange={(event) => onChange({ ...cost, customHandlerId: event.target.value })} /></label>}
    <button type="button" onClick={onRemove}>移除</button>
  </div>;
}

function TargetEditor({ target, onChange, onRemove }: { target: EffectTarget; onChange: (target: EffectTarget) => void; onRemove: () => void }) {
  return <div className="compact-node">
    <label>目标 ID<input value={target.id} onChange={(event) => onChange({ ...target, id: event.target.value })} /></label>
    <label>目标类型<select value={target.kind} onChange={(event) => onChange(event.target.value === 'player'
      ? { id: target.id, kind: 'player', player: 'self', min: 1, max: 1 }
      : { id: target.id, kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1 })}><option value="cards">卡牌</option><option value="player">玩家</option></select></label>
    <PlayerField value={target.player} onChange={(player) => onChange({ ...target, player })} />
    {target.kind === 'cards' && <><ZoneField value={target.zone} onChange={(zone) => onChange({ ...target, zone })} /><label>选择提示<input value={target.prompt ?? ''} placeholder="例如：请选择要强化的角色" onChange={(event) => onChange({ ...target, prompt: event.target.value || undefined })} /></label></>}
    <NumberField label="最少" min={0} value={target.min} onChange={(min) => onChange({ ...target, min })} />
    <NumberField label="最多" min={0} value={target.max} onChange={(max) => onChange({ ...target, max })} />
    <button type="button" onClick={onRemove}>移除</button>
  </div>;
}

function AdvancedJsonEditor({ effect, onApply }: { effect: StructuredEffect; onApply: (effect: StructuredEffect) => void }) {
  const [value, setValue] = useState(() => JSON.stringify(effect, null, 2));
  const [error, setError] = useState('');
  useEffect(() => setValue(JSON.stringify(effect, null, 2)), [effect]);
  return <details className="advanced-effect-json"><summary>高级 JSON（复杂规则 / 开发人员）</summary>
    <textarea aria-label={`${effect.id} 高级 JSON`} rows={14} value={value} onChange={(event) => setValue(event.target.value)} />
    {error && <p className="effect-error">{error}</p>}
    <button type="button" onClick={() => { try { onApply(JSON.parse(value) as StructuredEffect); setError(''); } catch { setError('JSON 格式无效，未应用修改'); } }}>应用 JSON</button>
  </details>;
}

export function EffectBuilder({ effects, onChange, validationDetails = [], focusedEffectId = null }: EffectBuilderProps) {
  const update = (index: number, effect: StructuredEffect) => onChange(effects.map((entry, entryIndex) => entryIndex === index ? effect : entry));
  const appendTemplate = (templateId: string) => {
    const template = effectTemplates.find((entry) => entry.id === templateId);
    if (template) onChange([...effects, cloneTemplate(template, nextEffectId(effects))]);
  };

  return <section className="effect-builder">
    <header><div><small>RULE EFFECT BUILDER</small><h2>结构化效果</h2></div><strong>{effects.length} 项</strong></header>
    <div className="effect-template-bar"><b>效果模板</b>{effectTemplates.map((template) => <button key={template.id} type="button" title={template.description} onClick={() => appendTemplate(template.id)}>{template.name}</button>)}<button type="button" className="add-effect" onClick={() => onChange([...effects, blankEffect(nextEffectId(effects))])}>添加效果</button></div>
    {effects.length === 0 && <div className="empty-effects"><b>这张卡还没有结构化效果</b><span>从上方模板开始，或添加一个空白效果逐项配置。</span></div>}
    <div className="effect-cards">{effects.map((effect, effectIndex) => {
      const localIssues = effectBlockingIssues(effect);
      const serverIssues = validationDetails.filter((detail) => detail.includes(effect.id));
      const issues = [...new Set([...localIssues, ...serverIssues])];
      return <article key={`${effect.id}-${effectIndex}`} className={`effect-card${focusedEffectId === effect.id ? ' focused' : ''}`}>
        <header><label>效果 ID<input value={effect.id} onChange={(event) => update(effectIndex, { ...effect, id: event.target.value })} /></label><span className={issues.length ? 'effect-blocked' : 'effect-ready'}>{issues.length ? '阻止发布' : '可执行'}</span><button type="button" className="danger-quiet" onClick={() => onChange(effects.filter((_, index) => index !== effectIndex))}>移除效果</button></header>
        <p className="effect-summary">{summarizeEffect(effect)}</p>
        {issues.length > 0 && <ul className="effect-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}

        <div className="effect-panel-grid">
          <section><h3>1. 能力与触发</h3><label>能力类型<select aria-label="能力类型" value={effect.ability} onChange={(event) => update(effectIndex, { ...effect, ability: event.target.value as StructuredEffect['ability'] })}>{abilities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>触发事件<select value={effect.trigger?.event ?? ''} onChange={(event) => update(effectIndex, event.target.value ? { ...effect, trigger: { kind: 'event', event: event.target.value as EffectEvent } } : (() => { const next = { ...effect }; delete next.trigger; return next; })())}><option value="">由能力类型决定</option>{events.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></section>
          <section><h3>2. 持续与限制</h3><DurationField value={effect.duration ?? { kind: 'instant' }} onChange={(duration) => update(effectIndex, { ...effect, duration })} /><label className="effect-check"><input type="checkbox" checked={effect.optional ?? false} onChange={(event) => update(effectIndex, { ...effect, optional: event.target.checked })} />可选择不发动</label><label className="effect-check"><input type="checkbox" checked={effect.oncePerTurn ?? false} onChange={(event) => update(effectIndex, { ...effect, oncePerTurn: event.target.checked })} />每回合一次</label></section>
        </div>

        <section className="node-panel"><header><div><h3>3. 条件</h3><p>所有条件满足后才能发动。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, conditions: [...effect.conditions, { kind: 'controller-has-card', player: 'self', zone: 'field', filter: {}, min: 1 }] })}>添加条件</button></header>{effect.conditions.map((condition, index) => <ConditionEditor key={index} condition={condition} onChange={(next) => update(effectIndex, { ...effect, conditions: effect.conditions.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, conditions: effect.conditions.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <section className="node-panel"><header><div><h3>4. 费用</h3><p>发动前一次性支付，失败则不执行动作。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, costs: [...effect.costs, { kind: 'pay-energy', amount: { kind: 'fixed', value: 1 } }] })}>添加费用</button></header>{effect.costs.map((cost, index) => <CostEditor key={index} cost={cost} onChange={(next) => update(effectIndex, { ...effect, costs: effect.costs.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, costs: effect.costs.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <section className="node-panel"><header><div><h3>5. 目标</h3><p>动作通过目标 ID 引用这里的选择。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, targets: [...effect.targets, { id: `target-${effect.targets.length + 1}`, kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1 }] })}>添加目标</button></header>{effect.targets.map((target, index) => <TargetEditor key={index} target={target} onChange={(next) => update(effectIndex, { ...effect, targets: effect.targets.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, targets: effect.targets.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <section className="node-panel actions-panel"><header><div><h3>6. 动作（按顺序执行）</h3><p>从上到下依次结算；切换类型会清除旧动作的无关字段。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, actions: [...effect.actions, actionForKind('draw')] })}>添加动作</button></header>{effect.actions.map((action, index) => <ActionEditor key={index} action={action} canRemove={effect.actions.length > 1} onChange={(next) => update(effectIndex, { ...effect, actions: effect.actions.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, actions: effect.actions.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <AdvancedJsonEditor effect={effect} onApply={(next) => update(effectIndex, next)} />
      </article>;
    })}</div>
  </section>;
}
