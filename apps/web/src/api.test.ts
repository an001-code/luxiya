import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, saveAndPublishAdminCard } from './api.js';

const draft = {
  id: 'TEST-001', name: '测试卡牌', type: 'tactic' as const, subtype: 'normal' as const,
  cost: 1, attribute: 'physical' as const, traits: [], text: ['抽1张牌。'], effectIds: [], structuredEffects: [],
};

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not declare JSON content when a POST has no body', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchStub);

    await apiRequest('/api/rooms', { method: 'POST' });

    const init = fetchStub.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('saves first and publishes the card id returned by the server', async () => {
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ card: { ...draft, id: 'SERVER-ID' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ card: { ...draft, id: 'SERVER-ID', status: 'published' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchStub);

    await saveAndPublishAdminCard(draft, null);

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[0]![0]).toBe('http://localhost:3001/api/admin/cards');
    expect(fetchStub.mock.calls[1]![0]).toBe('http://localhost:3001/api/admin/cards/SERVER-ID/publish');
  });

  it('does not publish when saving fails', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'SAVE_FAILED', details: ['效果 effect-2：动作尚未配置完整'] }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchStub);

    await expect(saveAndPublishAdminCard(draft, 'TEST-001')).rejects.toEqual(expect.objectContaining({
      message: 'SAVE_FAILED', details: ['效果 effect-2：动作尚未配置完整'],
    }));
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
