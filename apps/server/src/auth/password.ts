import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
};

export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  const [algorithm, saltValue, keyValue, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !keyValue || extra) return false;
  try {
    const expected = Buffer.from(keyValue, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};
