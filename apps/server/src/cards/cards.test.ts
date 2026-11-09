import { describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../bootstrap-admin.js';
import { createMemoryRepository } from '../persistence/memory-repository.js';
import { buildServer } from '../server.js';
import { CardService } from './service.js';
import { seedBuiltInCards } from '../seed-cards.js';

const pngDataUrl = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;
const cardInput = {
  id: 'TEST-001',
  name: '测试角色',
  type: 'character' as const,
  cost: 3,
  attribute: 'physical' as const,
  traits: ['测试'],
  pp: 3000,
  dp: 1,
  text: ['【出】：抽1张牌，丢弃1张手牌。'],
  effectIds: ['enter_draw_discard'],
  structuredEffects: [{
    id: 'enter-draw-discard',
    ability: 'enter' as const,
    handlerId: 'enter_draw_discard',
    actions: [{ type: 'draw' as const, amount: 1 }, { type: 'discard' as const, amount: 1 }],
  }],
  imageDataUrl: pngDataUrl,
};

const cookieValue = (header: string | string[] | undefined): string => {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Missing Set-Cookie header');
  return value.split(';')[0]!;
};

describe('admin card API', () => {
  it('seeds built-in definitions as drafts without overwriting later administrator edits', async () => {
    const repository = createMemoryRepository();
    await seedBuiltInCards(repository, () => new Date('2026-11-09T00:00:00.000Z'));
    const seeded = await repository.findCardById('BP01-079');
    expect(seeded).toMatchObject({ name: '第五次交锋', status: 'draft', version: 1 });

    await repository.saveCard({ ...seeded!, name: '管理员修订名称', version: 2 });
    await seedBuiltInCards(repository, () => new Date('2026-11-10T00:00:00.000Z'));
    await expect(repository.findCardById('BP01-079')).resolves.toMatchObject({ name: '管理员修订名称', version: 2 });
  });

  it('lets an administrator save a draft and publishes it only after executable validation', async () => {
    const repository = createMemoryRepository();
    await bootstrapAdmin(repository, { username: 'Anonce', password: 'BootstrapPass!21' });
    const server = buildServer({ repository });
    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Anonce', password: 'BootstrapPass!21' } });
    const cookie = cookieValue(login.headers['set-cookie']);

    const created = await server.inject({ method: 'POST', url: '/api/admin/cards', headers: { cookie }, payload: cardInput });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ card: { id: 'TEST-001', status: 'draft', version: 1, hasImage: true } });
    expect((await server.inject({ method: 'GET', url: '/api/cards' })).json()).toEqual({ cards: [] });

    const published = await server.inject({ method: 'POST', url: '/api/admin/cards/TEST-001/publish', headers: { cookie } });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ card: { id: 'TEST-001', status: 'published', version: 2 } });
    expect((await server.inject({ method: 'GET', url: '/api/cards' })).json()).toMatchObject({ cards: [{ id: 'TEST-001', name: '测试角色' }] });

    const image = await server.inject({ method: 'GET', url: '/api/cards/TEST-001/image' });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.rawPayload.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await server.close();
  });

  it('rejects card writes from ordinary players', async () => {
    const server = buildServer({ repository: createMemoryRepository() });
    const registered = await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'player_one', password: 'TestPass!21' } });
    const response = await server.inject({ method: 'POST', url: '/api/admin/cards', headers: { cookie: cookieValue(registered.headers['set-cookie']) }, payload: cardInput });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'FORBIDDEN' });
    await server.close();
  });

  it('keeps cards with unsupported handlers as drafts and explains why publishing failed', async () => {
    const repository = createMemoryRepository();
    const service = new CardService(repository);
    await service.createDraft({
      ...cardInput,
      id: 'TEST-UNSUPPORTED',
      effectIds: ['future_complex_effect'],
      structuredEffects: [{ ...cardInput.structuredEffects[0]!, handlerId: 'future_complex_effect' }],
    });

    await expect(service.publish('TEST-UNSUPPORTED')).rejects.toMatchObject({
      message: 'CARD_NOT_PUBLISHABLE',
      details: ['未注册效果处理器：future_complex_effect'],
    });
    await expect(repository.findCardById('TEST-UNSUPPORTED')).resolves.toMatchObject({ status: 'draft' });
  });

  it('rejects oversized images and image data whose bytes do not match the declared type', async () => {
    const service = new CardService(createMemoryRepository());
    const oversized = `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}`;
    await expect(service.createDraft({ ...cardInput, id: 'TEST-LARGE', imageDataUrl: oversized })).rejects.toThrow('IMAGE_TOO_LARGE');
    const fakePng = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`;
    await expect(service.createDraft({ ...cardInput, id: 'TEST-MISMATCH', imageDataUrl: fakePng })).rejects.toThrow('IMAGE_MIME_MISMATCH');
  });
});
