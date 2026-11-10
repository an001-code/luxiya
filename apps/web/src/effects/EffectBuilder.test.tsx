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
    await user.type(within(actions[1]!).getByLabelText('目标 ID'), 'discard-target');

    let effect = JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')[0];
    expect(effect.actions).toEqual([
      { kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } },
      { kind: 'discard', targetId: 'discard-target' },
    ]);

    await user.selectOptions(within(actions[0]!).getByLabelText('动作类型'), 'rest');
    expect(within(actions[0]!).queryByLabelText('数量')).toBeNull();
    expect(within(actions[0]!).queryByLabelText('执行玩家')).toBeNull();
    expect(within(actions[0]!).getByLabelText('目标 ID')).toBeTruthy();
    effect = JSON.parse(screen.getByLabelText('效果数据').textContent ?? '[]')[0];
    expect(effect.actions[0]).toEqual({ kind: 'rest', targetId: '' });
  });

  it('marks incomplete and unsupported custom nodes as blocking', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '添加效果' }));

    expect(screen.getByText('阻止发布')).toBeTruthy();
    expect(screen.getByText('动作尚未配置完整')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('动作类型'), 'custom');
    await user.type(screen.getByLabelText('处理器 ID'), 'future-handler');
    expect(screen.getByText('自定义处理器需由开发人员注册后才能发布')).toBeTruthy();
  });
});
