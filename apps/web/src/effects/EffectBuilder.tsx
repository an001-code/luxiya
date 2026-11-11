import { useEffect, useState } from 'react';
import type {
  EffectAction, EffectCondition, EffectCost, EffectDuration, EffectEvent, EffectPlayer, EffectTarget, EffectZone, StructuredEffect,
} from '@pgr/protocol';
import { cloneTemplate, effectTemplates } from './effect-templates.js';
import { effectBlockingIssues, summarizeEffect } from './effect-summary.js';
import { FilterFields, PresetRuleField, TargetField, ValueField, targetName } from './EffectFields.js';

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
  ability: 'enter',
  conditions: [],
  costs: [],
  targets: [],
  actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
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

function ActionEditor({ action, targets, onChange, onRemove, canRemove }: { action: EffectAction; targets: EffectTarget[]; onChange: (action: EffectAction) => void; onRemove: () => void; canRemove: boolean }) {
  return <div className="effect-action-editor" data-testid="effect-action">
    <span className="drag-handle" aria-hidden="true">≡</span>
    <label>动作类型<select aria-label="动作类型" value={action.kind} onChange={(event) => onChange(actionForKind(event.target.value as EffectAction['kind']))}>
      <option value="custom">特殊规则</option><option value="draw">抽牌</option><option value="discard">舍弃所选卡牌</option>
      <option value="modify-stat">修改 PP / DP / 充能</option><option value="move-card">移动卡牌</option><option value="rest">横置</option>
      <option value="upright">重置</option><option value="freeze">冻结</option><option value="modify-corruption">修改侵蚀度</option>
      <option value="signal-as">视为信号球</option><option value="search">检索</option><option value="play">使用卡牌</option>
      <option value="equip">装备</option><option value="choose">选择分支</option>
    </select></label>
    {(action.kind === 'draw' || action.kind === 'modify-corruption' || action.kind === 'search') && <PlayerField value={action.player} onChange={(player) => onChange({ ...action, player } as EffectAction)} />}
    {action.kind === 'draw' && <ValueField value={action.amount} targets={targets} onChange={(amount) => onChange({ ...action, amount })} />}
    {(action.kind === 'modify-stat' || action.kind === 'modify-corruption') && <ValueField value={action.value} targets={targets} onChange={(value) => onChange({ ...action, value })} />}
    {'targetId' in action && <TargetField value={action.targetId} targets={targets} onChange={(targetId) => onChange({ ...action, targetId } as EffectAction)} />}
    {action.kind === 'modify-stat' && <><label>数值<select value={action.stat} onChange={(event) => onChange({ ...action, stat: event.target.value as typeof action.stat })}><option value="pp">PP</option><option value="dp">DP</option><option value="charge">充能</option></select></label><DurationField value={action.duration} onChange={(duration) => onChange({ ...action, duration })} /></>}
    {action.kind === 'move-card' && <ZoneField label="移动到" value={action.to} onChange={(to) => onChange({ ...action, to })} />}
    {action.kind === 'move-card' && <label>放置时是否公开<select value={action.face ?? ''} onChange={(event) => { const next = { ...action }; if (!event.target.value) delete next.face; else next.face = event.target.value as 'up' | 'down'; onChange(next); }}><option value="">保持原状态</option><option value="up">明置</option><option value="down">暗置</option></select></label>}
    {action.kind === 'modify-stat' && <label>修改方式<select value={action.operation} onChange={(event) => onChange({ ...action, operation: event.target.value as typeof action.operation })}><option value="add">增加（负数表示减少）</option><option value="set">设为</option></select></label>}
    {action.kind === 'move-card' && <><label>放置位置<select value={action.position ?? ''} onChange={(event) => { const next = { ...action }; if (event.target.value) next.position = event.target.value as 'top' | 'bottom'; else delete next.position; onChange(next); }}><option value="">区域默认位置</option><option value="top">最上方</option><option value="bottom">最下方</option></select></label><label>放置状态<select value={action.rested === undefined ? '' : String(action.rested)} onChange={(event) => { const next = { ...action }; if (!event.target.value) delete next.rested; else next.rested = event.target.value === 'true'; onChange(next); }}><option value="">保持原状态</option><option value="true">横置</option><option value="false">竖置</option></select></label></>}
    {action.kind === 'modify-corruption' && <label>运算<select value={action.operation} onChange={(event) => onChange({ ...action, operation: event.target.value as typeof action.operation })}><option value="add">增加</option><option value="subtract">降低</option><option value="set">设为</option></select></label>}
    {action.kind === 'signal-as' && <><label>颜色<select value={action.color} onChange={(event) => onChange({ ...action, color: event.target.value as typeof action.color })}><option value="red">红</option><option value="blue">蓝</option><option value="yellow">黄</option></select></label><NumberField label="信号数量" min={1} value={action.count} onChange={(count) => onChange({ ...action, count })} /><DurationField value={action.duration} onChange={(duration) => onChange({ ...action, duration })} /></>}
    {action.kind === 'search' && <><NumberField label="检索数量" min={1} value={action.count} onChange={(count) => onChange({ ...action, count })} /><ZoneField label="加入区域" value={action.destination} onChange={(destination) => onChange({ ...action, destination })} /></>}
    {action.kind === 'search' && <><FilterFields filter={action.filter} onChange={(filter) => onChange({ ...action, filter })} /><label>剩余卡牌<select value={action.remainder} onChange={(event) => onChange({ ...action, remainder: event.target.value as typeof action.remainder })}><option value="shuffle">洗回牌组</option><option value="deck-bottom">置于牌组底部</option></select></label></>}
    {action.kind === 'play' && <label className="effect-check"><input type="checkbox" checked={action.ignoreCost} onChange={(event) => onChange({ ...action, ignoreCost: event.target.checked })} />忽略费用</label>}
    {action.kind === 'equip' && <TargetField label="装备来源" value={action.sourceTargetId} targets={targets} onChange={(sourceTargetId) => onChange({ ...action, sourceTargetId })} />}
    {action.kind === 'choose' && <div className="choice-editor">{action.options.map((option, optionIndex) => <section key={option.id}>
      <label>选项名称<input value={option.label} onChange={(event) => onChange({ ...action, options: action.options.map((entry, index) => index === optionIndex ? { ...entry, label: event.target.value } : entry) })} /></label>
      {(option.conditions ?? []).map((condition, index) => <ConditionEditor key={index} condition={condition} onChange={(next) => onChange({ ...action, options: action.options.map((entry, position) => position === optionIndex ? { ...entry, conditions: (entry.conditions ?? []).map((value, offset) => offset === index ? next : value) } : entry) })} onRemove={() => onChange({ ...action, options: action.options.map((entry, position) => position === optionIndex ? { ...entry, conditions: entry.conditions?.filter((_, offset) => offset !== index) ?? [] } : entry) })} />)}
      {option.actions.map((child, index) => <ActionEditor key={index} action={child} targets={targets} canRemove={option.actions.length > 1} onChange={(next) => onChange({ ...action, options: action.options.map((entry, position) => position === optionIndex ? { ...entry, actions: entry.actions.map((value, offset) => offset === index ? next : value) } : entry) })} onRemove={() => onChange({ ...action, options: action.options.map((entry, position) => position === optionIndex ? { ...entry, actions: entry.actions.filter((_, offset) => offset !== index) } : entry) })} />)}
      <button type="button" onClick={() => onChange({ ...action, options: action.options.map((entry, position) => position === optionIndex ? { ...entry, actions: [...entry.actions, actionForKind('draw')] } : entry) })}>添加选项动作</button>
      <button type="button" onClick={() => onChange({ ...action, options: action.options.map((entry, position) => position === optionIndex ? { ...entry, conditions: [...(entry.conditions ?? []), { kind: 'controller-has-card', player: 'self', zone: 'field', filter: {}, min: 1 }] } : entry) })}>添加选项条件</button>
      <button type="button" disabled={action.options.length < 2} onClick={() => onChange({ ...action, options: action.options.filter((_, index) => index !== optionIndex) })}>移除选项</button>
    </section>)}<button type="button" onClick={() => onChange({ ...action, options: [...action.options, { id: `option-${Date.now()}`, label: `选项 ${action.options.length + 1}`, actions: [actionForKind('draw')] }] })}>添加分支选项</button></div>}
    {action.kind === 'custom' && <PresetRuleField value={action.customHandlerId} onChange={(customHandlerId) => onChange({ ...action, customHandlerId })} />}
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
    }}><option value="controller-has-card">区域中有卡牌</option><option value="source-attached">这张卡已装备</option><option value="corruption-compare">比较侵蚀度</option><option value="turn-event">回合事件</option><option value="custom">特殊规则</option></select></label>
    {condition.kind === 'controller-has-card' && <><PlayerField value={condition.player} onChange={(player) => onChange({ ...condition, player })} /><ZoneField value={condition.zone} onChange={(zone) => onChange({ ...condition, zone })} /><NumberField label="至少" min={0} value={condition.min} onChange={(min) => onChange({ ...condition, min })} /></>}
    {condition.kind === 'turn-event' && <label>事件<select value={condition.event} onChange={(event) => onChange({ ...condition, event: event.target.value as EffectEvent })}>{events.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    {(condition.kind === 'controller-has-card' || condition.kind === 'source-attached') && <FilterFields filter={condition.filter} onChange={(filter) => onChange({ ...condition, filter })} />}
    {condition.kind === 'corruption-compare' && <><label>比较我方与对方侵蚀度<select value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as typeof condition.operator })}><option value="lt">低于</option><option value="lte">不高于</option><option value="eq">等于</option><option value="gte">不低于</option><option value="gt">高于</option></select></label><label>左侧玩家<select value={condition.left} onChange={(event) => onChange({ ...condition, left: event.target.value as EffectPlayer })}>{players.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>右侧玩家<select value={condition.right} onChange={(event) => onChange({ ...condition, right: event.target.value as EffectPlayer })}>{players.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></>}
    {condition.kind === 'turn-event' && <PlayerField value={condition.player} onChange={(player) => onChange({ ...condition, player })} />}
    {condition.kind === 'custom' && <PresetRuleField value={condition.customHandlerId} onChange={(customHandlerId) => onChange({ ...condition, customHandlerId })} />}
    <button type="button" onClick={onRemove}>移除</button>
  </div>;
}

function CostEditor({ cost, targets, onChange, onRemove }: { cost: EffectCost; targets: EffectTarget[]; onChange: (cost: EffectCost) => void; onRemove: () => void }) {
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
    {'amount' in cost && <ValueField value={cost.amount} targets={targets} onChange={(amount) => onChange({ ...cost, amount } as EffectCost)} />}
    {cost.kind === 'discard' && <PlayerField value={cost.player} onChange={(player) => onChange({ ...cost, player })} />}
    {cost.kind === 'discard' && <FilterFields filter={cost.filter ?? {}} onChange={(filter) => onChange({ ...cost, filter })} />}
    {cost.kind === 'rest' && <TargetField value={cost.target} targets={targets} onChange={(target) => onChange({ ...cost, target })} />}
    {cost.kind === 'move-card' && <><TargetField value={cost.targetId} targets={targets} onChange={(targetId) => onChange({ ...cost, targetId })} /><ZoneField label="移到" value={cost.to} onChange={(to) => onChange({ ...cost, to })} /></>}
    {cost.kind === 'eliminate-signals' && <><label>消除颜色<select value={cost.color ?? 'any'} onChange={(event) => onChange({ ...cost, color: event.target.value as NonNullable<typeof cost.color> })}><option value="any">任意颜色</option><option value="red">红</option><option value="blue">蓝</option><option value="yellow">黄</option></select></label><label className="effect-check"><input type="checkbox" checked={cost.adjacent} onChange={(event) => onChange({ ...cost, adjacent: event.target.checked })} />必须相邻</label></>}
    {cost.kind === 'custom' && <PresetRuleField value={cost.customHandlerId} onChange={(customHandlerId) => onChange({ ...cost, customHandlerId })} />}
    <button type="button" onClick={onRemove}>移除</button>
  </div>;
}

function TargetEditor({ target, index, onChange, onRemove }: { target: EffectTarget; index: number; onChange: (target: EffectTarget) => void; onRemove: () => void }) {
  return <div className="compact-node">
    <strong className="target-caption">{targetName(target, index)}</strong>
    <label>目标类型<select value={target.kind} onChange={(event) => onChange(event.target.value === 'player'
      ? { id: target.id, kind: 'player', player: 'self', min: 1, max: 1 }
      : { id: target.id, kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1 })}><option value="cards">卡牌</option><option value="player">玩家</option></select></label>
    <PlayerField value={target.player} onChange={(player) => onChange({ ...target, player })} />
    {target.kind === 'cards' && <><ZoneField value={target.zone} onChange={(zone) => onChange({ ...target, zone })} /><label>选择提示<input value={target.prompt ?? ''} placeholder="例如：请选择要强化的角色" onChange={(event) => onChange({ ...target, prompt: event.target.value || undefined })} /></label></>}
    <NumberField label="最少" min={0} value={target.min} onChange={(min) => onChange({ ...target, min })} />
    <NumberField label="最多" min={0} value={target.max} onChange={(max) => onChange({ ...target, max })} />
    <label className="effect-check"><input type="checkbox" checked={target.optional ?? false} onChange={(event) => onChange({ ...target, optional: event.target.checked })} />允许不选择</label>
    {target.kind === 'cards' && <><label className="effect-check"><input type="checkbox" checked={target.ordered ?? false} onChange={(event) => onChange({ ...target, ordered: event.target.checked })} />需要排列顺序</label><FilterFields filter={target.filter ?? {}} onChange={(filter) => onChange({ ...target, filter })} /></>}
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
    <header><div><h2>卡牌效果</h2><p className="workspace-intro">选择何时生效、影响谁、发生什么。系统自动连接这些步骤。</p></div><strong>{effects.length} 项</strong></header>
    <div className="effect-template-bar"><b>效果模板</b>{effectTemplates.map((template) => <button key={template.id} type="button" title={template.description} onClick={() => appendTemplate(template.id)}>{template.name}</button>)}<button type="button" className="add-effect" onClick={() => onChange([...effects, blankEffect(nextEffectId(effects))])}>添加效果</button></div>
    {effects.length === 0 && <div className="empty-effects"><b>这张卡还没有结构化效果</b><span>从上方模板开始，或添加一个空白效果逐项配置。</span></div>}
    <div className="effect-cards">{effects.map((effect, effectIndex) => {
      const localIssues = effectBlockingIssues(effect);
      const serverIssues = validationDetails.filter((detail) => detail.includes(effect.id));
      const issues = [...new Set([...localIssues, ...serverIssues])];
      return <article key={`${effect.id}-${effectIndex}`} className={`effect-card${focusedEffectId === effect.id ? ' focused' : ''}`}>
        <header><h3>效果 {effectIndex + 1} · {abilities.find(([value]) => value === effect.ability)?.[1]}</h3><span className={issues.length ? 'effect-blocked' : 'effect-ready'}>{issues.length ? '需要完善' : '可执行'}</span><button type="button" className="danger-quiet" onClick={() => onChange(effects.filter((_, index) => index !== effectIndex))}>移除效果</button></header>
        <p className="effect-summary">{summarizeEffect(effect)}</p>
        {issues.length > 0 && <ul className="effect-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}

        <div className="effect-panel-grid">
          <section><h3>1. 能力与触发</h3><label>能力类型<select aria-label="能力类型" value={effect.ability} onChange={(event) => update(effectIndex, { ...effect, ability: event.target.value as StructuredEffect['ability'] })}>{abilities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>触发事件<select value={effect.trigger?.event ?? ''} onChange={(event) => update(effectIndex, event.target.value ? { ...effect, trigger: { kind: 'event', event: event.target.value as EffectEvent } } : (() => { const next = { ...effect }; delete next.trigger; return next; })())}><option value="">由能力类型决定</option>{events.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></section>
          <section><h3>2. 持续与限制</h3><DurationField value={effect.duration ?? { kind: 'instant' }} onChange={(duration) => update(effectIndex, { ...effect, duration })} /><label className="effect-check"><input type="checkbox" checked={effect.optional ?? false} onChange={(event) => update(effectIndex, { ...effect, optional: event.target.checked })} />可选择不发动</label><label className="effect-check"><input type="checkbox" checked={effect.oncePerTurn ?? false} onChange={(event) => update(effectIndex, { ...effect, oncePerTurn: event.target.checked })} />每回合一次</label></section>
        </div>

        <section className="node-panel"><header><div><h3>3. 条件</h3><p>所有条件满足后才能发动。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, conditions: [...effect.conditions, { kind: 'controller-has-card', player: 'self', zone: 'field', filter: {}, min: 1 }] })}>添加条件</button></header>{effect.conditions.map((condition, index) => <ConditionEditor key={index} condition={condition} onChange={(next) => update(effectIndex, { ...effect, conditions: effect.conditions.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, conditions: effect.conditions.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <section className="node-panel"><header><div><h3>4. 发动代价</h3><p>发动前需要支付什么？无需代价可留空。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, costs: [...effect.costs, { kind: 'pay-energy', amount: { kind: 'fixed', value: 1 } }] })}>添加费用</button></header>{effect.costs.map((cost, index) => <CostEditor key={index} cost={cost} targets={effect.targets} onChange={(next) => update(effectIndex, { ...effect, costs: effect.costs.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, costs: effect.costs.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <section className="node-panel"><header><div><h3>5. 选择哪些卡牌</h3><p>在这里定义可选卡牌，再在动作中选择对应的中文对象。</p></div><button type="button" onClick={() => { let sequence = effect.targets.length + 1; while (effect.targets.some((target) => target.id === `target-${sequence}`)) sequence++; update(effectIndex, { ...effect, targets: [...effect.targets, { id: `target-${sequence}`, kind: 'cards', player: 'self', zone: 'field', min: 1, max: 1 }] }); }}>添加目标</button></header>{effect.targets.map((target, index) => <TargetEditor key={target.id} target={target} index={index} onChange={(next) => update(effectIndex, { ...effect, targets: effect.targets.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, targets: effect.targets.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <section className="node-panel actions-panel"><header><div><h3>6. 动作（按顺序执行）</h3><p>从上到下依次结算。</p></div><button type="button" onClick={() => update(effectIndex, { ...effect, actions: [...effect.actions, actionForKind('draw')] })}>添加动作</button></header>{effect.actions.map((action, index) => <ActionEditor key={index} action={action} targets={effect.targets} canRemove={effect.actions.length > 1} onChange={(next) => update(effectIndex, { ...effect, actions: effect.actions.map((entry, itemIndex) => itemIndex === index ? next : entry) })} onRemove={() => update(effectIndex, { ...effect, actions: effect.actions.filter((_, itemIndex) => itemIndex !== index) })} />)}</section>
        <AdvancedJsonEditor effect={effect} onApply={(next) => update(effectIndex, next)} />
      </article>;
    })}</div>
  </section>;
}
