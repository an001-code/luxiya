import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth/password.js';
import { connectMySqlRepository, mysqlConfigFromEnv } from './persistence/mysql-repository.js';
import type { AppRepository, UserRecord } from './persistence/types.js';

export const bootstrapAdmin = async (
  repository: AppRepository,
  input: { username: string; password: string },
): Promise<UserRecord> => {
  if (input.password.length < 8 || input.password.length > 128) throw new Error('INVALID_ADMIN_PASSWORD');
  const username = input.username.trim();
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw new Error('INVALID_ADMIN_USERNAME');
  const existing = await repository.findUserByUsernameKey(username);
  const admin: UserRecord = {
    id: existing?.id ?? randomUUID(),
    username,
    usernameKey: username.toLocaleLowerCase('en-US'),
    passwordHash: await hashPassword(input.password),
    role: 'admin',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  return existing ? repository.saveUser(admin) : repository.createUser(admin);
};

const run = async (): Promise<void> => {
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required');
  const repository = await connectMySqlRepository(mysqlConfigFromEnv());
  try {
    const user = await bootstrapAdmin(repository, { username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'Anonce', password });
    console.log(`Administrator ready: ${user.username}`);
  } finally {
    await repository.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
