import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AppRepository, UserRecord, UserRole } from '../persistence/types.js';
import { hashPassword, verifyPassword } from './password.js';

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface AuthSession {
  user: PublicUser;
  token: string;
  expiresAt: string;
}

interface AuthServiceOptions {
  now?: () => Date;
  tokenGenerator?: () => string;
  sessionTtlMs?: number;
}

const usernameKey = (value: string): string => value.trim().toLocaleLowerCase('en-US');
const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
const publicUser = ({ id, username, role }: UserRecord): PublicUser => ({ id, username, role });

export class AuthService {
  private readonly now: () => Date;
  private readonly tokenGenerator: () => string;
  private readonly sessionTtlMs: number;

  constructor(private readonly repository: AppRepository, options: AuthServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.tokenGenerator = options.tokenGenerator ?? (() => randomBytes(32).toString('base64url'));
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * 24 * 60 * 60_000;
  }

  async register(username: string, password: string): Promise<AuthSession> {
    const user = await this.repository.createUser({
      id: randomUUID(),
      username: username.trim(),
      usernameKey: usernameKey(username),
      passwordHash: await hashPassword(password),
      role: 'player',
      createdAt: this.now().toISOString(),
    });
    return this.createSession(user);
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const user = await this.repository.findUserByUsernameKey(usernameKey(username));
    if (!user || !await verifyPassword(password, user.passwordHash)) throw new Error('INVALID_CREDENTIALS');
    return this.createSession(user);
  }

  async authenticate(token: string, requiredRole?: UserRole): Promise<PublicUser> {
    const hash = tokenHash(token);
    const session = await this.repository.findSession(hash);
    if (!session) throw new Error('UNAUTHENTICATED');
    if (session.expiresAt <= this.now().toISOString()) {
      await this.repository.deleteSession(hash);
      throw new Error('UNAUTHENTICATED');
    }
    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      await this.repository.deleteSession(hash);
      throw new Error('UNAUTHENTICATED');
    }
    if (requiredRole && user.role !== requiredRole) throw new Error('FORBIDDEN');
    return publicUser(user);
  }

  async logout(token: string): Promise<void> {
    await this.repository.deleteSession(tokenHash(token));
  }

  private async createSession(user: UserRecord): Promise<AuthSession> {
    const token = this.tokenGenerator();
    const expiresAt = new Date(this.now().getTime() + this.sessionTtlMs).toISOString();
    await this.repository.saveSession({ tokenHash: tokenHash(token), userId: user.id, expiresAt });
    return { user: publicUser(user), token, expiresAt };
  }
}
