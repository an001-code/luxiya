import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api.js';

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
});
