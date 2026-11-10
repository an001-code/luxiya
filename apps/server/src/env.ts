import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const projectEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

export const loadProjectEnv = (path = projectEnvPath): boolean => {
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
};
