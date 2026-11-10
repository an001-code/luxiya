import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthScreen } from './AuthScreen.js';
import { CardLibrary } from './CardLibrary.js';
import { DeckEditor } from './DeckEditor.js';
import { AdminCardEditor } from './AdminCardEditor.js';

const card = {
  id: 'TEST-001', name: '测试角色', type: 'character' as const, cost: 3, attribute: 'physical' as const,
  traits: ['测试'], pp: 3000, dp: 1, text: ['【出】：抽1张牌。'], effectIds: ['draw'], structuredEffects: [],
  status: 'published' as const, version: 1, hasImage: true, createdAt: '2026-11-09', updatedAt: '2026-11-09',
};

describe('card platform screens', () => {
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
    const html = renderToStaticMarkup(<AdminCardEditor cards={[draftCard]} onSave={async () => undefined} onPublish={async () => undefined} />);
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
  });
});
