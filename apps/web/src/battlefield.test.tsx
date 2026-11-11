import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { PlayerBoardView, PlayerView } from '@pgr/protocol';
import { Battlefield } from './Battlefield.js';

const board = (id: string, own: boolean): PlayerBoardView => ({
  id,
  hand: own ? [] : { count: 4 },
  deck: { count: 44 },
  graveyard: [], processing: [], field: [null, null, null, null, null], signals: [], energy: [], corruption: 0,
});

const view: PlayerView = {
  gameId: 'game', version: 0, status: 'playing', viewerId: 'p1', self: board('p1', true), opponent: board('p2', false),
  activePlayerId: 'p1', phase: 'main', turn: 1, pendingAttack: null, priorityWindow: null, winnerId: null,
  pendingDecision: null, legalActions: [{ type: 'END_PHASE' }], events: [],
};

describe('Battlefield', () => {
  test('draw confirmation omits the automatic phase explanation', () => {
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, drawConfirmation: { count: 1, cards: [] } }} onCommand={() => undefined} />);
    expect(html).toContain('确认抽牌');
    expect(html).not.toContain('程序已完成');
    expect(html).not.toContain('确认后进入费用填充');
  });

  test('own dark energy keeps its inspectable identity but renders a card back', () => {
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, self: { ...view.self,
      energy: [{ instanceId: 'dark-energy', cardId: 'ST01-005', face: 'down', rested: false }],
    } }} onCommand={() => undefined} />);
    expect(html).toContain('data-card-view="dark-energy"');
    expect(html).toContain('battle-card-back');
    expect(html).not.toContain('/api/cards/ST01-005/image');
  });
  test('renders mirrored resources, ten field slots and the three inspector tabs', () => {
    const html = renderToStaticMarkup(<Battlefield view={view} onCommand={() => undefined} />);
    expect(html.match(/data-field-slot=/g)).toHaveLength(10);
    expect(html.match(/data-energy-slot=/g)).toHaveLength(20);
    expect(html.match(/data-signal-slot=/g)).toHaveLength(24);
    expect(html.match(/data-corruption-cell=/g)).toHaveLength(16);
    expect(html.match(/信号球区/g)).toHaveLength(2);
    expect(html.match(/费用区/g)).toHaveLength(2);
    expect(html).toContain('卡牌详情');
    expect(html).toContain('回合记录');
    expect(html).toContain('墓地');
    expect(html).toContain('认输');
    expect(html).toContain('对手处理区');
    expect(html).toContain('我方处理区');
    expect(html).not.toContain('对手资源');
    expect(html).not.toContain('我方资源');
  });

  test('renders public resource cards as detail buttons while opponent hand stays hidden', () => {
    const publicCard = { instanceId: 'public-signal', cardId: 'BP01-079', face: 'up' as const, rested: false };
    const ownEnergy = { instanceId: 'own-energy', cardId: 'ST01-005', face: 'up' as const, rested: false };
    const html = renderToStaticMarkup(<Battlefield view={{
      ...view,
      self: { ...view.self, signals: [publicCard], energy: [ownEnergy], processing: [publicCard] },
      opponent: { ...view.opponent, signals: [publicCard], processing: [publicCard] },
    }} onCommand={() => undefined} />);

    expect(html.match(/data-card-view=/g)).toHaveLength(5);
    expect(html).toContain('/api/cards/BP01-079/image');
    expect(html).toContain('/api/cards/ST01-005/image');
    expect(html).not.toContain('等待指令');
    expect(html).not.toContain('data-opponent-hand-card');
  });

  test('shows a result overlay when the game has finished', () => {
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, status: 'finished', winnerId: 'p1' }} onCommand={() => undefined} />);
    expect(html).toContain('对局结束');
    expect(html).toContain('胜利');
  });

  test('shows the authoritative effective PP after temporary modifiers', () => {
    const enhanced = { instanceId: 'enhanced', cardId: 'ST01-005', face: 'up' as const, rested: false, effectivePp: 5500, effectiveDp: 0 };
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, self: { ...view.self, field: [enhanced, null, null, null, null] } }} onCommand={() => undefined} />);
    expect(html).toContain('PP 5500 · DP 0');
  });

  test('offers an explicit mulligan confirmation during opening setup', () => {
    const html = renderToStaticMarkup(<Battlefield view={{ ...view, phase: 'mulligan', legalActions: [{ type: 'MULLIGAN', instanceIds: [] }] }} onCommand={() => undefined} />);
    expect(html).toContain('确认调度');
  });
});

describe('effect decision panel', () => {
  test('renders the current decision as explicit target buttons', () => {
    const html = renderToStaticMarkup(<Battlefield view={{
      ...view,
      pendingDecision: {
        id: 'decision-1', frameId: 'frame-1', kind: 'select-cards', purpose: 'target', prompt: 'Choose one character',
        min: 1, max: 1, targetId: 'character',
        options: [{ id: 'target-1', label: 'Test character', instanceId: 'target-1', cardId: 'DEV-001' }],
      },
      legalActions: [{ type: 'RESOLVE_EFFECT_DECISION', decisionId: 'decision-1', selectedInstanceIds: [] }],
    }} onCommand={() => undefined} />);

    expect(html).toContain('data-effect-decision="decision-1"');
    expect(html).toContain('data-decision-option="target-1"');
    expect(html).toContain('Choose one character');
    expect(html).toContain('role="dialog"');
  });
});
