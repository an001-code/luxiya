import type { EffectCardFilter, EffectTarget, EffectValue } from '@pgr/protocol';

export const zoneNames: Record<string, string> = { deck: '牌组', hand: '手牌', graveyard: '墓地', processing: '处理区', field: '战场', signals: '信号球区', energy: '费用区' };
export const targetName = (target: EffectTarget, index: number): string => {
  if (target.kind === 'player') return `对象 ${index + 1} · ${target.player === 'self' ? '我方' : '对方'}玩家`;
  const type = target.filter?.types?.map((value) => ({ character: '角色', tactic: '战术', item: '道具' })[value]).join('、') || '卡牌';
  return `对象 ${index + 1} · ${target.player === 'self' ? '我方' : '对方'}${zoneNames[target.zone]}的${type}`;
};

export function TargetField({ value, targets, onChange, label = '作用对象' }: { value: string; targets: EffectTarget[]; onChange: (value: string) => void; label?: string }) {
  const known = ['source', 'equipped-character', ...targets.map((target) => target.id)];
  return <label>{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">请选择作用对象</option>
    <option value="source">这张卡本身</option><option value="equipped-character">装备此卡的角色</option>
    {targets.map((target, index) => <option value={target.id} key={target.id}>{targetName(target, index)}</option>)}
    {value && !known.includes(value) && <option value={value}>原作用对象已移除，请重新选择</option>}
  </select></label>;
}

export function ValueField({ value, targets, onChange, label = '数量' }: { value: EffectValue; targets: EffectTarget[]; onChange: (value: EffectValue) => void; label?: string }) {
  return <div className="value-fields">
    <label>计算方式<select value={value.kind} onChange={(event) => onChange(event.target.value === 'fixed' ? { kind: 'fixed', value: 1 } : event.target.value === 'selected-count' ? { kind: 'selected-count', targetId: targets[0]?.id ?? '', multiplier: 1 } : { kind: 'source-stat', stat: 'pp' })}>
      <option value="fixed">固定数值</option><option value="selected-count">所选卡牌数量 × 倍数</option><option value="source-stat">这张卡的数值</option>
    </select></label>
    {value.kind === 'fixed' && <label>{label}<input aria-label={label} type="number" value={value.value} onChange={(event) => onChange({ ...value, value: Number(event.target.value) })} /></label>}
    {value.kind === 'selected-count' && <><TargetField label="统计哪些卡牌" value={value.targetId} targets={targets} onChange={(targetId) => onChange({ ...value, targetId })} /><label>每张乘以<input type="number" value={value.multiplier ?? 1} onChange={(event) => onChange({ ...value, multiplier: Number(event.target.value) })} /></label></>}
    {value.kind === 'source-stat' && <label>读取数值<select value={value.stat} onChange={(event) => onChange({ ...value, stat: event.target.value as typeof value.stat })}><option value="pp">PP</option><option value="dp">DP</option><option value="charge">充能</option></select></label>}
  </div>;
}

export function FilterFields({ filter, onChange }: { filter: EffectCardFilter; onChange: (filter: EffectCardFilter) => void }) {
  const single = (key: 'types' | 'subtypes' | 'attributes' | 'signals', value: string) => {
    const next = { ...filter };
    if (value) Object.assign(next, { [key]: [value] }); else delete next[key];
    onChange(next);
  };
  return <details className="filter-fields" open={Object.keys(filter).length > 0}>
    <summary>筛选符合条件的卡牌{Object.keys(filter).length === 0 ? '（不限）' : ''}</summary>
    <div className="filter-field-grid">
      <label>卡牌类型<select value={filter.types?.[0] ?? ''} onChange={(event) => single('types', event.target.value)}><option value="">不限</option><option value="character">角色</option><option value="tactic">战术</option><option value="item">道具</option></select></label>
      <label>卡牌子类型<select value={filter.subtypes?.[0] ?? ''} onChange={(event) => single('subtypes', event.target.value)}><option value="">不限</option><option value="normal">普通战术</option><option value="instant">瞬时战术</option><option value="equipment">装备</option><option value="support">辅助机</option></select></label>
      <label>属性<select value={filter.attributes?.[0] ?? ''} onChange={(event) => single('attributes', event.target.value)}><option value="">不限</option>{Object.entries({ physical: '物理', fire: '火', lightning: '雷', ice: '冰', dark: '暗', void: '空', none: '无' }).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>信号颜色<select value={filter.signals?.[0] ?? ''} onChange={(event) => single('signals', event.target.value)}><option value="">不限</option><option value="red">红</option><option value="blue">蓝</option><option value="yellow">黄</option></select></label>
      {(['names', 'traits'] as const).map((key) => <label key={key}>{key === 'names' ? '名称为（多个用顿号分隔）' : '具有特征（多个用顿号分隔）'}<input value={filter[key]?.join('、') ?? ''} onChange={(event) => { const next = { ...filter }; const values = event.target.value.split('、'); if (event.target.value) next[key] = values; else delete next[key]; onChange(next); }} /></label>)}
      {([['minCost', '最低费用'], ['maxCost', '最高费用'], ['minPp', '最低 PP'], ['maxPp', '最高 PP']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={0} placeholder="不限" value={filter[key] ?? ''} onChange={(event) => { const next = { ...filter }; if (event.target.value === '') delete next[key]; else next[key] = Number(event.target.value); onChange(next); }} /></label>)}
      <label>横置状态<select value={filter.rested === undefined ? '' : String(filter.rested)} onChange={(event) => { const next = { ...filter }; if (!event.target.value) delete next.rested; else next.rested = event.target.value === 'true'; onChange(next); }}><option value="">不限</option><option value="true">已横置</option><option value="false">未横置</option></select></label>
      <label>公开状态<select value={filter.face ?? ''} onChange={(event) => { const next = { ...filter }; if (!event.target.value) delete next.face; else next.face = event.target.value as 'up' | 'down'; onChange(next); }}><option value="">不限</option><option value="up">明置</option><option value="down">暗置</option></select></label>
    </div>
  </details>;
}

export const presetRules: Record<string, string> = {
  haste: '速攻', weapon_haste: '武器赋予速攻', charge_zero: '攻击充能为零',
  charge_choice_red: '红球充能选择', charge_choice_blue: '蓝球充能选择', charge_choice_yellow: '黄球充能选择',
  enter_draw_discard: '出场抽牌后弃牌', enter_swap_energy: '出场置换费用', enter_recover_blue: '出场回收蓝球', corruption_draw: '根据侵蚀抽牌',
  signal_draw: '使用信号球抽牌', equipment_pp: '装备增加 PP', charge_top_rested: '牌组顶置为横置明费',
  gray_raven_team_bonus: '灰鸦小队条件加成', reorder_signals: '重新排列信号球', blue_signal_discount: '蓝球减费', floating_dp: '当前卡牌的 DP 修正',
  evolve_lucia: '露西亚升变', search_top_five_gray_raven: '牌组顶五张检索灰鸦角色', lucia_blue_activated: '蓝球消除并回收、使用角色',
  leave_recover_sealed_blade: '离场回收封刃', triple_signal: '信号球视为三个', qu_energy_replacement: '曲的处理区费用置换', sealed_blade: '封刃攻击限制', support_recover_signal: '辅助机回收信号球',
};

export function PresetRuleField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label>特殊规则<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">请选择已支持的特殊规则</option>{Object.entries(presetRules).map(([id, label]) => <option value={id} key={id}>{label}</option>)}{value && !presetRules[value] && <option value={value}>尚未支持的特殊规则（需开发人员处理）</option>}</select></label>;
}
