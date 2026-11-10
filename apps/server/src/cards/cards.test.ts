import { describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../bootstrap-admin.js';
import { createMemoryRepository } from '../persistence/memory-repository.js';
import { buildServer } from '../server.js';
import { CardService } from './service.js';
import { cardInputSchema } from './schema.js';
import { seedBuiltInCards } from '../seed-cards.js';
import { cardDefinitions } from '@pgr/cards';

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
    sourceEffectId: 'enter_draw_discard',
    ability: 'enter' as const,
    trigger: { kind: 'event' as const, event: 'card-entered' as const },
    conditions: [],
    costs: [],
    targets: [],
    actions: [{ kind: 'custom' as const, customHandlerId: 'enter_draw_discard' }],
    duration: { kind: 'instant' as const },
  }],
  imageDataUrl: pngDataUrl,
};

const cookieValue = (header: string | string[] | undefined): string => {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Missing Set-Cookie header');
  return value.split(';')[0]!;
};

describe('admin card API', () => {
  it('synchronizes only built-in effect fields and is idempotent', async () => {
    const repository = createMemoryRepository();
    await seedBuiltInCards(repository, () => new Date('2026-11-09T00:00:00.000Z'));
    const seeded = await repository.findCardById('BP01-079');
    expect(seeded).toMatchObject({ name: '第五次交锋', status: 'draft', version: 1, effectSchemaVersion: 1 });

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await repository.saveCard({
      ...seeded!, text: ['管理员修订规则'], status: 'published', imageMime: 'image/png', imageData: png,
      effectSchemaVersion: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    });
    await repository.saveCard({ ...seeded!, id: 'ADMIN-ONLY', name: '管理员自建卡', effectSchemaVersion: 0 });
    const first = await seedBuiltInCards(repository, () => new Date('2026-11-09T12:00:00.000Z'));
    expect(first.synchronized).toBe(1);
    const migrated = await repository.findCardById('BP01-079');
    expect(migrated).toMatchObject({
      text: ['管理员修订规则'], status: 'published', version: 1, effectSchemaVersion: 1,
      imageMime: 'image/png', imageData: png,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(migrated?.structuredEffects?.some((effect) => effect.sourceEffectId === 'signal_draw')).toBe(true);
    await expect(repository.findCardById('ADMIN-ONLY')).resolves.toMatchObject({ effectSchemaVersion: 0 });

    const second = await seedBuiltInCards(repository, () => new Date('2026-11-10T00:00:00.000Z'));
    expect(second.synchronized).toBe(0);
    await expect(repository.findCardById('BP01-079')).resolves.toEqual(migrated);
  });

  it('lets an administrator list draft and published cards without exposing drafts publicly', async () => {
    const repository = createMemoryRepository();
    await seedBuiltInCards(repository, () => new Date('2026-11-09T00:00:00.000Z'));
    await bootstrapAdmin(repository, { username: 'Anonce', password: 'BootstrapPass!21' });
    const server = buildServer({ repository });
    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'Anonce', password: 'BootstrapPass!21' } });
    const cookie = cookieValue(login.headers['set-cookie']);

    const adminCards = await server.inject({ method: 'GET', url: '/api/admin/cards', headers: { cookie } });
    expect(adminCards.statusCode).toBe(200);
    expect(adminCards.json().cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ST01-005', status: 'draft', hasImage: false }),
    ]));
    expect((await server.inject({ method: 'GET', url: '/api/cards' })).json()).toEqual({ cards: [] });

    const player = await server.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'player_one', password: 'TestPass!21' } });
    const forbidden = await server.inject({ method: 'GET', url: '/api/admin/cards', headers: { cookie: cookieValue(player.headers['set-cookie']) } });
    expect(forbidden.statusCode).toBe(403);
    await server.close();
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

    const draftImage = await server.inject({ method: 'GET', url: '/api/admin/cards/TEST-001/image', headers: { cookie } });
    expect(draftImage.statusCode).toBe(200);
    expect(draftImage.headers['content-type']).toContain('image/png');
    expect((await server.inject({ method: 'GET', url: '/api/admin/cards/TEST-001/image' })).statusCode).toBe(401);

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
      structuredEffects: [{
        ...cardInput.structuredEffects[0]!,
        sourceEffectId: 'future_complex_effect',
        actions: [{ kind: 'custom' as const, customHandlerId: 'future_complex_effect' }],
      }],
    });

    await expect(service.publish('TEST-UNSUPPORTED')).rejects.toMatchObject({
      message: 'CARD_NOT_PUBLISHABLE',
      details: ['效果 enter-draw-discard：未注册效果处理器 future_complex_effect'],
    });
    await expect(repository.findCardById('TEST-UNSUPPORTED')).resolves.toMatchObject({ status: 'draft' });
  });

  it('publishes a typed common effect without requiring a custom handler', async () => {
    const service = new CardService(createMemoryRepository());
    await service.createDraft({
      ...cardInput,
      id: 'TEST-TYPED-DRAW',
      effectIds: [],
      structuredEffects: [{
        id: 'enter-draw-one',
        ability: 'enter',
        trigger: { kind: 'event', event: 'card-entered' },
        conditions: [],
        costs: [],
        targets: [{ id: 'controller', kind: 'player', player: 'self', min: 1, max: 1 }],
        actions: [{ kind: 'draw', player: 'self', amount: { kind: 'fixed', value: 1 } }],
        duration: { kind: 'instant' },
      }],
    });

    await expect(service.publish('TEST-TYPED-DRAW')).resolves.toMatchObject({ status: 'published' });
  });

  it('publishes every non-development built-in card without missing-handler errors', async () => {
    const repository = createMemoryRepository();
    const service = new CardService(repository);
    const timestamp = '2026-11-10T00:00:00.000Z';
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const definition of cardDefinitions.filter((card) => !card.id.startsWith('DEV-'))) {
      await repository.saveCard({
        ...definition,
        structuredEffects: definition.structuredEffects ?? [],
        status: 'draft', version: 1, effectSchemaVersion: 1,
        imageMime: 'image/png', imageData: png, createdAt: timestamp, updatedAt: timestamp,
      });
      await expect(service.publish(definition.id), definition.id).resolves.toMatchObject({ status: 'published' });
    }
  });

  it('rejects an unknown structured action before it reaches persistence', () => {
    const parsed = cardInputSchema.safeParse({
      ...cardInput,
      id: 'TEST-UNKNOWN-ACTION',
      structuredEffects: [{
        id: 'bad-action', ability: 'enter', conditions: [], costs: [], targets: [],
        actions: [{ kind: 'teleport_everything' }],
      }],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects oversized images and image data whose bytes do not match the declared type', async () => {
    const service = new CardService(createMemoryRepository());
    const oversized = `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}`;
    await expect(service.createDraft({ ...cardInput, id: 'TEST-LARGE', imageDataUrl: oversized })).rejects.toThrow('IMAGE_TOO_LARGE');
    const fakePng = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`;
    await expect(service.createDraft({ ...cardInput, id: 'TEST-MISMATCH', imageDataUrl: fakePng })).rejects.toThrow('IMAGE_MIME_MISMATCH');
  });
});
