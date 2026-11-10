import type { CardDefinition } from '@pgr/protocol';
import type { AppRepository, StoredCard } from '../persistence/types.js';
import { hasEffectHandler } from './effect-handlers.js';
import { cardInputSchema, type CardInput } from './schema.js';

const maxImageBytes = 8 * 1024 * 1024;

export class CardValidationError extends Error {
  constructor(message: string, readonly details: string[] = []) { super(message); }
}

const imageSignatureMatches = (mime: StoredCard['imageMime'], bytes: Uint8Array): boolean => {
  if (mime === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
};

const decodeImage = (dataUrl: string): Pick<StoredCard, 'imageMime' | 'imageData'> => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('INVALID_IMAGE_DATA_URL');
  const mime = match[1] as NonNullable<StoredCard['imageMime']>;
  const imageData = new Uint8Array(Buffer.from(match[2]!, 'base64'));
  if (imageData.byteLength > maxImageBytes) throw new Error('IMAGE_TOO_LARGE');
  if (!imageSignatureMatches(mime, imageData)) throw new Error('IMAGE_MIME_MISMATCH');
  return { imageMime: mime, imageData };
};

export interface CardView extends Omit<StoredCard, 'imageData' | 'imageMime'> {
  hasImage: boolean;
  imageMime?: StoredCard['imageMime'];
}

const toView = (card: StoredCard): CardView => {
  const { imageData, ...rest } = card;
  return { ...rest, hasImage: Boolean(imageData) };
};

export class CardService {
  constructor(private readonly repository: AppRepository, private readonly now: () => Date = () => new Date()) {}

  async createDraft(rawInput: CardInput): Promise<CardView> {
    const input = cardInputSchema.parse(rawInput);
    if (await this.repository.findCardById(input.id)) throw new Error('CARD_EXISTS');
    return this.save(input, null);
  }

  async updateDraft(id: string, rawInput: CardInput): Promise<CardView> {
    const existing = await this.repository.findCardById(id);
    if (!existing) throw new Error('CARD_NOT_FOUND');
    const input = cardInputSchema.parse({ ...rawInput, id });
    return this.save(input, existing);
  }

  async publish(id: string): Promise<CardView> {
    const existing = await this.repository.findCardById(id);
    if (!existing) throw new Error('CARD_NOT_FOUND');
    const errors = this.publicationErrors(existing);
    if (errors.length > 0) throw new CardValidationError('CARD_NOT_PUBLISHABLE', errors);
    const updated = await this.repository.saveCard({ ...existing, status: 'published', version: existing.version + 1, updatedAt: this.now().toISOString() });
    return toView(updated);
  }

  async listPublished(): Promise<CardView[]> {
    return (await this.repository.listCards({ status: 'published' })).map(toView);
  }

  async listAll(): Promise<CardView[]> {
    return (await this.repository.listCards()).map(toView);
  }

  async findImage(id: string): Promise<{ mime: NonNullable<StoredCard['imageMime']>; bytes: Uint8Array } | null> {
    const card = await this.repository.findCardById(id);
    if (!card || card.status !== 'published' || !card.imageMime || !card.imageData) return null;
    return { mime: card.imageMime, bytes: card.imageData };
  }

  async findAdminImage(id: string): Promise<{ mime: NonNullable<StoredCard['imageMime']>; bytes: Uint8Array } | null> {
    const card = await this.repository.findCardById(id);
    if (!card?.imageMime || !card.imageData) return null;
    return { mime: card.imageMime, bytes: card.imageData };
  }

  private async save(input: CardInput, existing: StoredCard | null): Promise<CardView> {
    const image = input.imageDataUrl ? decodeImage(input.imageDataUrl) : existing?.imageData && existing.imageMime
      ? { imageData: existing.imageData, imageMime: existing.imageMime }
      : {};
    const now = this.now().toISOString();
    const definition: CardDefinition = {
      id: input.id,
      name: input.name,
      type: input.type,
      ...(input.subtype ? { subtype: input.subtype } : {}),
      cost: input.cost,
      attribute: input.attribute,
      traits: input.traits,
      ...(input.pp === undefined ? {} : { pp: input.pp }),
      ...(input.dp === undefined ? {} : { dp: input.dp }),
      ...(input.signal ? { signal: input.signal } : {}),
      text: input.text,
      effectIds: input.effectIds,
      structuredEffects: input.structuredEffects,
      ...(input.rarity ? { rarity: input.rarity } : {}),
      ...(input.artPath ? { artPath: input.artPath } : {}),
    };
    const stored = await this.repository.saveCard({
      ...definition,
      status: 'draft',
      version: (existing?.version ?? 0) + 1,
      ...image,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return toView(stored);
  }

  private publicationErrors(card: StoredCard): string[] {
    const errors: string[] = [];
    if (!card.imageData || !card.imageMime) errors.push('缺少完整卡图');
    if (card.text.length === 0) errors.push('缺少规则文本');
    const handlers = new Set((card.structuredEffects ?? []).map((effect) => effect.handlerId).filter((value): value is string => Boolean(value)));
    for (const effectId of card.effectIds) {
      if (!handlers.has(effectId)) errors.push(`效果缺少结构化配置：${effectId}`);
    }
    for (const handler of handlers) {
      if (!hasEffectHandler(handler)) errors.push(`未注册效果处理器：${handler}`);
    }
    return errors;
  }
}
