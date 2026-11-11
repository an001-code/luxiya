// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StructuredEffect } from '@pgr/protocol';
import { EffectBuilder } from './EffectBuilder.js';

afterEach(cleanup);

function Harness({ initial = [] }: { initial?: StructuredEffect[] }) {
  const [effects, setEffects] = useState(initial);
  return <>
    <EffectBuilder effects={effects} onChange={setEffects} />
    <output aria-label="效果数据">{JSON.stringify(effects)}</output>
  </>;
}

describe('EffectBuilder', () => {
  it('builds an enter draw effect with a readable Chinese summary', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '添加效果' }));
    await user.selectOptions(screen.getByLabelText('能力类型'), 'enter');
    await user.selectOptions(screen.getByLabelText('动作类型'), 'draw');
    await user.selectOptions(screen.getByLabelText('执行玩家'), 'self');
    await user.clear(screen.getByLabelText('数量'));
    await user.type(screen.getByLabelText('数量'), '1');

    expect(JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')).toEqual([{
      id: 'effect-1',
      ability: 'enter',
      conditions: [],
      costs: [],
      targets: [],
      actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
      duration: { kind: 'instant' },
    }]);
    expect(screen.getByText('出场时，我方抽 1 张牌。')).toBeTruthy();
    expect(screen.getByText('可执行')).toBeTruthy();
  });

  it('preserves action order and removes irrelevant fields when the action kind changes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{
      id: 'effect-1', ability: 'enter', conditions: [], costs: [], targets: [],
      actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
      duration: { kind: 'instant' },
    }]} />);

    await user.click(screen.getByRole('button', { name: '添加动作' }));
    const actions = screen.getAllByTestId('effect-action');
    expect(actions).toHaveLength(2);
    await user.selectOptions(within(actions[1]!).getByLabelText('动作类型'), 'discard');
    await user.click(screen.getByRole('button', { name: '添加目标' }));
    await user.selectOptions(within(actions[1]!).getByLabelText('作用对象'), 'target-1');

    let effect = JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')[0];
    expect(effect.actions).toEqual([
      { kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } },
      { kind: 'discard', targetId: 'target-1' },
    ]);

    await user.selectOptions(within(actions[0]!).getByLabelText('动作类型'), 'rest');
    expect(within(actions[0]!).queryByLabelText('数量')).toBeNull();
    expect(within(actions[0]!).queryByLabelText('执行玩家')).toBeNull();
    expect(within(actions[0]!).getByLabelText('作用对象')).toBeTruthy();
    effect = JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')[0];
    expect(effect.actions[0]).toEqual({ kind: 'rest', targetId: '' });
  });

  it('marks incomplete and unsupported custom nodes as blocking', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '添加效果' }));
    await user.selectOptions(screen.getByLabelText('动作类型'), 'custom');
    expect(screen.getByText('需要完善')).toBeTruthy();
    expect(screen.getByText('动作尚未配置完整')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('特殊规则'), 'haste');
    expect(screen.getByText('可执行')).toBeTruthy();
    expect(screen.queryByLabelText('处理器 ID')).toBeNull();
  });

  it('connects Chinese target choices and dynamic values without exposing identifier fields', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '添加效果' }));
    await user.click(screen.getByRole('button', { name: '添加目标' }));
    await user.selectOptions(screen.getByLabelText('动作类型'), 'modify-stat');
    await user.selectOptions(screen.getByLabelText('作用对象'), screen.getByRole('option', { name: '对象 1 · 我方战场的卡牌' }));
    await user.selectOptions(screen.getByLabelText('计算方式'), 'selected-count');
    await user.clear(screen.getByLabelText('每张乘以'));
    await user.type(screen.getByLabelText('每张乘以'), '1000');
    const effect = JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')[0];
    expect(effect.actions[0]).toMatchObject({ targetId: effect.targets[0].id, value: { kind: 'selected-count', targetId: effect.targets[0].id, multiplier: 1000 } });
    expect(screen.queryByLabelText('目标 ID')).toBeNull();
    expect(screen.queryByLabelText('效果 ID')).toBeNull();
  });

  it('edits branch actions using the same visual controls', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '添加效果' }));
    await user.selectOptions(screen.getByLabelText('动作类型'), 'choose');
    await user.click(screen.getByRole('button', { name: '添加分支选项' }));
    const names = screen.getAllByLabelText('选项名称');
    await user.clear(names[1]!);
    await user.type(names[1]!, '抽两张牌');
    const amounts = screen.getAllByLabelText('数量');
    await user.clear(amounts[1]!);
    await user.type(amounts[1]!, '2');
    const effect = JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')[0];
    expect(effect.actions[0].options[1]).toMatchObject({ label: '抽两张牌', actions: [{ kind: 'draw', amount: { kind: 'fixed', value: 2 } }] });
  });
});
