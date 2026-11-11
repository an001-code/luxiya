// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen.js';
import { CardLibrary } from './CardLibrary.js';
import { DeckEditor } from './DeckEditor.js';
import { AdminCardEditor } from './AdminCardEditor.js';
import { ApiError } from './api.js';

afterEach(cleanup);

const card = {
  id: 'TEST-001', name: '测试角色', type: 'character' as const, cost: 3, attribute: 'physical' as const,
  traits: ['测试'], pp: 3000, dp: 1, text: ['【出】：抽1张牌。'], effectIds: ['draw'], structuredEffects: [],
  status: 'published' as const, version: 1, hasImage: true, createdAt: '2026-11-09', updatedAt: '2026-11-09',
};

describe('card platform screens', () => {
  it('shows a failed deletion inside the confirmation dialog and retains the selected card', async () => {
    const user = userEvent.setup();
    render(<AdminCardEditor cards={[card]} onSave={async () => card} onPublish={async () => undefined} onSaveAndPublish={async () => undefined} onDelete={async () => { throw new ApiError('CARD_IN_USE', 409, ['请先从牌组移除']); }} />);
    await user.click(screen.getByRole('button', { name: '删除卡牌' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    expect((await screen.findByRole('alert')).textContent).toContain('请先从牌组移除');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('卡牌编号') as HTMLInputElement).value).toBe('TEST-001');
  });
  it('requires confirmation, supports cancellation and clears selection after deleting', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    render(<AdminCardEditor cards={[card]} onSave={async () => card} onPublish={async () => undefined} onSaveAndPublish={async () => undefined} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: '删除卡牌' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '删除卡牌' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onDelete).toHaveBeenCalledWith('TEST-001');
    expect(screen.getByText('新建草稿')).toBeTruthy();
  });
  it('renders login and registration actions before entering the command terminal', () => {
    const html = renderToStaticMarkup(<AuthScreen busy={false} error="" onSubmit={() => undefined} />);
    expect(html).toContain('账号登录');
    expect(html).toContain('创建账号');
    expect(html).toContain('name="username"');
    expect(html).toContain('type="password"');
  });

  it('renders published cards with filters and a readable detail rail', () => {
    const html = renderToStaticMarkup(<CardLibrary cards={[card]} loading={false} />);
    expect(html).toContain('全部卡牌');
    expect(html).toContain('测试角色');
    expect(html).toContain('费用 3');
    expect(html).toContain('【出】：抽1张牌。');
    expect(html).toContain('物理');
    expect(html).toContain('角色牌');
    expect(html).not.toContain('>physical<');
    expect(html).not.toContain('>character<');
  });

  it('shows deck count, validation errors, and activation state', () => {
    const html = renderToStaticMarkup(<DeckEditor
      cards={[card]}
      decks={[{ id: 'deck-1', name: '测试牌组', active: false, cards: [{ cardId: 'TEST-001', count: 4 }], validationErrors: ['牌组必须恰好包含50张卡牌'] }]}
      selectedDeckId="deck-1"
      onSelectDeck={() => undefined}
      onSave={() => undefined}
      onActivate={() => undefined}
    />);
    expect(html).toContain('4 / 50');
    expect(html).toContain('牌组必须恰好包含50张卡牌');
    expect(html).toContain('设为启用牌组');
  });

  it('renders an editable administrator card index and loads an existing draft', () => {
    const draftCard = { ...card, status: 'draft' as const, hasImage: false };
    const html = renderToStaticMarkup(<AdminCardEditor cards={[draftCard]} onSave={async () => draftCard} onPublish={async () => undefined} onSaveAndPublish={async () => undefined} />);
    expect(html).toContain('卡牌录入');
    expect(html).toContain('卡牌索引');
    expect(html).toContain('新建卡牌');
    expect(html).toContain('TEST-001');
    expect(html).toContain('测试角色');
    expect(html).toContain('编辑草稿');
    expect(html).toContain('完整卡图');
    expect(html).toContain('原始规则文本');
    expect(html).toContain('结构化效果');
    expect(html).toContain('保存草稿');
    expect(html).toContain('发布卡牌');
    expect(html).toContain('保存并发布');
    expect(html).toContain('效果模板');
  });

  it('keeps and highlights the failing ability when save-and-publish is rejected', async () => {
    const user = userEvent.setup();
    const draftCard = {
      ...card,
      status: 'draft' as const,
      structuredEffects: [{
        id: 'effect-2', ability: 'enter' as const, conditions: [], costs: [], targets: [],
        actions: [{ kind: 'draw' as const, player: 'self' as const, amount: { kind: 'fixed' as const, value: 1 } }],
        duration: { kind: 'instant' as const },
      }],
    };
    const publish = vi.fn(async () => undefined);
    const saveAndPublish = vi.fn(async () => {
      throw new ApiError('CARD_NOT_PUBLISHABLE', 422, ['效果 effect-2：未注册效果处理器 future-handler']);
    });
    render(<AdminCardEditor cards={[draftCard]} onSave={async () => draftCard} onPublish={publish} onSaveAndPublish={saveAndPublish} />);

    await user.click(screen.getByRole('button', { name: '保存并发布' }));

    const detail = await screen.findByText('效果 effect-2：未注册效果处理器 future-handler');
    expect(detail.closest('.effect-card')?.className).toContain('focused');
    expect(saveAndPublish).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });
});
